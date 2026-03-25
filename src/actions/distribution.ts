"use server";

/**
 * distribution.ts — 채널 배포 Server Actions
 *
 * organic_posts → AI 변환 → channel_distributions → 채널 발행 파이프라인을 담당.
 * 모든 함수는 requireAdmin()으로 admin 권한 체크 후 실행.
 *
 * 의존 테이블:
 * - organic_posts: 원본 글
 * - channel_distributions: 채널별 변환/배포 상태
 * - channel_credentials: 채널 OAuth 자격증명 + extra_config
 */

import { requireAdmin } from "@/lib/auth-utils";
import { transformForChannels } from "@/lib/ai-transform";
import { getChannelClient } from "@/lib/channel-api/get-client";
import type {
  TransformChannel,
  ChannelDistribution,
  DistributionStatus,
} from "@/types/distribution";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** transformToChannels 결과 항목 */
interface TransformResultItem {
  channel: TransformChannel;
  distributionId: string;
  status: "created" | "skipped" | "failed";
  error?: string;
}

// ─── 1. AI 변환 ───────────────────────────────────────────────────────────────

/**
 * 원본 포스트를 지정된 채널로 AI 변환 후 channel_distributions에 저장
 *
 * @param input.sourcePostId - organic_posts.id
 * @param input.channels     - 변환할 채널 목록
 * @param input.forceRetransform - true이면 이미 존재하는 채널도 재변환
 */
export async function transformToChannels(input: {
  sourcePostId: string;
  channels: TransformChannel[];
  forceRetransform?: boolean;
}): Promise<{ results: TransformResultItem[]; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const { sourcePostId, channels, forceRetransform = false } = input;

    // 1) 원본 포스트 조회
    const { data: postData, error: postError } = await supabase
      .from("organic_posts")
      .select("title, content, keywords")
      .eq("id", sourcePostId)
      .single();

    if (postError || !postData) {
      return { results: [], error: postError?.message ?? "원본 포스트를 찾을 수 없습니다." };
    }

    const post = postData as {
      title: string;
      content: string | null;
      keywords: string[] | null;
    };

    if (!post.content) {
      return { results: [], error: "원본 포스트에 본문이 없습니다." };
    }

    // 2) 이미 존재하는 channel_distributions 조회
    const { data: existingRows } = await supabase
      .from("channel_distributions")
      .select("id, channel, status")
      .eq("source_post_id", sourcePostId)
      .in("channel", channels);

    const existingMap = new Map<
      string,
      { id: string; channel: string; status: string }
    >();
    for (const row of (existingRows as Array<{ id: string; channel: string; status: string }>) ?? []) {
      existingMap.set(row.channel, row);
    }

    // 3) 변환 대상 채널 분류
    const channelsToTransform: TransformChannel[] = [];
    const skippedResults: TransformResultItem[] = [];

    for (const channel of channels) {
      const existing = existingMap.get(channel);
      if (existing && !forceRetransform) {
        // 이미 존재하고 강제 재변환이 아닌 경우 skip
        skippedResults.push({
          channel,
          distributionId: existing.id,
          status: "skipped",
        });
      } else {
        channelsToTransform.push(channel);
      }
    }

    if (channelsToTransform.length === 0) {
      return { results: skippedResults, error: null };
    }

    // 4) AI 변환 (병렬)
    const transformResults = await transformForChannels(
      {
        title: post.title,
        content: post.content,
        keywords: post.keywords ?? undefined,
      },
      channelsToTransform
    );

    // 5) channel_distributions UPSERT
    const upsertResults: TransformResultItem[] = [];
    const now = new Date().toISOString();

    for (const channel of channelsToTransform) {
      const transformed = transformResults.get(channel);
      if (!transformed) {
        upsertResults.push({ channel, distributionId: "", status: "failed", error: "변환 결과 없음" });
        continue;
      }

      // 에러 변환 결과 감지 (wordCount === 0 && body에 "[변환 오류]" 포함)
      const isFailed = transformed.wordCount === 0 && transformed.body.startsWith("[변환 오류]");

      const upsertPayload = {
        source_post_id: sourcePostId,
        channel,
        transformed_title: transformed.title,
        transformed_body: transformed.body,
        transformed_metadata: transformed.metadata,
        status: isFailed ? "failed" : "review",
        error_message: isFailed ? transformed.body : null,
        updated_at: now,
      };

      const { data: upsertData, error: upsertError } = await supabase
        .from("channel_distributions")
        .upsert(upsertPayload, {
          onConflict: "source_post_id,channel",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();

      if (upsertError || !upsertData) {
        upsertResults.push({
          channel,
          distributionId: "",
          status: "failed",
          error: upsertError?.message ?? "UPSERT 실패",
        });
      } else {
        upsertResults.push({
          channel,
          distributionId: (upsertData as { id: string }).id,
          status: isFailed ? "failed" : "created",
          error: isFailed ? transformed.body : undefined,
        });
      }
    }

    // 6) organic_posts.ai_transform_status 업데이트
    const allDone = upsertResults.every((r) => r.status !== "failed");
    await supabase
      .from("organic_posts")
      .update({
        ai_transform_status: allDone ? "done" : "failed",
        updated_at: now,
      })
      .eq("id", sourcePostId);

    return {
      results: [...skippedResults, ...upsertResults],
      error: null,
    };
  } catch (e) {
    console.error("transformToChannels exception:", e);
    return { results: [], error: e instanceof Error ? e.message : "변환 실패" };
  }
}

// ─── 2. 첨삭 후 승인 ──────────────────────────────────────────────────────────

/**
 * 배포 건을 'approved' 상태로 변경 (첨삭 완료 후 발행 허용)
 *
 * @param input.distributionId - channel_distributions.id
 * @param input.reviewerNote   - 검토 메모 (선택)
 */
export async function approveDistribution(input: {
  distributionId: string;
  reviewerNote?: string;
}): Promise<{ error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const { error } = await supabase
      .from("channel_distributions")
      .update({
        status: "approved",
        reviewer_note: input.reviewerNote ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.distributionId);

    if (error) {
      console.error("approveDistribution error:", error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error("approveDistribution exception:", e);
    return { error: e instanceof Error ? e.message : "승인 실패" };
  }
}

// ─── 3. 예약 발행 ─────────────────────────────────────────────────────────────

/**
 * 배포 건에 발행 예약 시간 설정
 * status가 'approved'인 경우에만 허용
 *
 * @param input.distributionId - channel_distributions.id
 * @param input.scheduledAt    - 예약 발행 시간 (ISO 8601)
 */
export async function scheduleDistribution(input: {
  distributionId: string;
  scheduledAt: string;
}): Promise<{ error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    // 현재 상태 확인 — approved 상태에서만 예약 허용
    const { data: distData, error: fetchError } = await supabase
      .from("channel_distributions")
      .select("status")
      .eq("id", input.distributionId)
      .single();

    if (fetchError || !distData) {
      return { error: fetchError?.message ?? "배포 건을 찾을 수 없습니다." };
    }

    const currentStatus = (distData as { status: string }).status;
    if (currentStatus !== "approved") {
      return {
        error: `예약 발행은 'approved' 상태에서만 가능합니다. 현재 상태: ${currentStatus}`,
      };
    }

    const { error } = await supabase
      .from("channel_distributions")
      .update({
        scheduled_at: input.scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.distributionId);

    if (error) {
      console.error("scheduleDistribution error:", error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error("scheduleDistribution exception:", e);
    return { error: e instanceof Error ? e.message : "예약 실패" };
  }
}

// ─── 4. 즉시 배포 ─────────────────────────────────────────────────────────────

/**
 * 배포 건을 즉시 채널에 발행
 *
 * 흐름:
 * 1. channel_distributions 조회
 * 2. status → 'publishing'
 * 3. 채널별 API 클라이언트로 publish()
 * 4. 성공: status='published', external_id/url, published_at
 * 5. 실패: status='failed', error_message, retry_count++
 * 6. naver_blog는 반자동 → status='review'로 유지 (수동 완료 필요)
 *
 * @param input.distributionId - channel_distributions.id
 */
export async function publishDistribution(input: {
  distributionId: string;
}): Promise<{ externalId: string | null; externalUrl: string | null; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const now = new Date().toISOString();

    // 1) 배포 건 조회
    const { data: distData, error: fetchError } = await supabase
      .from("channel_distributions")
      .select(
        "id, channel, transformed_title, transformed_body, transformed_metadata, status, retry_count"
      )
      .eq("id", input.distributionId)
      .single();

    if (fetchError || !distData) {
      return {
        externalId: null,
        externalUrl: null,
        error: fetchError?.message ?? "배포 건을 찾을 수 없습니다.",
      };
    }

    const dist = distData as {
      id: string;
      channel: TransformChannel;
      transformed_title: string | null;
      transformed_body: string | null;
      transformed_metadata: Record<string, unknown> | null;
      status: string;
      retry_count: number;
    };

    // 변환 결과 없으면 발행 불가
    if (!dist.transformed_title || !dist.transformed_body) {
      return {
        externalId: null,
        externalUrl: null,
        error: "변환된 콘텐츠가 없습니다. 먼저 AI 변환을 실행해주세요.",
      };
    }

    // 2) status → 'publishing'
    await supabase
      .from("channel_distributions")
      .update({ status: "publishing", updated_at: now })
      .eq("id", input.distributionId);

    // 3) 채널 클라이언트 획득
    const client = await getChannelClient(dist.channel);

    // Phase 3 미구현 채널 (youtube, instagram, google_seo)
    if (!client) {
      // DB에 저장만 하고 review 상태 유지 (Phase 3 구현 전)
      await supabase
        .from("channel_distributions")
        .update({
          status: "review",
          error_message: `${dist.channel} 채널은 Phase 3에서 구현 예정입니다. 현재 저장만 됩니다.`,
          updated_at: now,
        })
        .eq("id", input.distributionId);

      return {
        externalId: null,
        externalUrl: null,
        error: `${dist.channel} 채널은 Phase 3에서 구현 예정입니다.`,
      };
    }

    // 4) 발행 시도
    try {
      const result = await client.publish({
        title: dist.transformed_title,
        body: dist.transformed_body,
        metadata: dist.transformed_metadata ?? {},
      });

      // naver_blog는 반자동 — 에디터 URL만 반환하며 수동 완료 대기
      const finalStatus: DistributionStatus =
        dist.channel === "naver_blog" ? "review" : "published";

      // 5) 성공 업데이트
      await supabase
        .from("channel_distributions")
        .update({
          status: finalStatus,
          external_id: result.externalId,
          external_url: result.externalUrl,
          published_at: dist.channel === "naver_blog" ? null : now,
          error_message: null,
          updated_at: now,
        })
        .eq("id", input.distributionId);

      return {
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        error: null,
      };
    } catch (publishError) {
      // 5) 실패 업데이트 — retry_count 증가
      const errMsg =
        publishError instanceof Error ? publishError.message : "발행 중 오류가 발생했습니다.";

      await supabase
        .from("channel_distributions")
        .update({
          status: "failed",
          error_message: errMsg,
          retry_count: dist.retry_count + 1,
          updated_at: now,
        })
        .eq("id", input.distributionId);

      return { externalId: null, externalUrl: null, error: errMsg };
    }
  } catch (e) {
    console.error("publishDistribution exception:", e);
    return {
      externalId: null,
      externalUrl: null,
      error: e instanceof Error ? e.message : "발행 실패",
    };
  }
}

// ─── 5. 배포 큐 조회 ──────────────────────────────────────────────────────────

/**
 * channel_distributions 목록 조회 (필터 + 페이지네이션)
 *
 * @param filters.sourcePostId - 원본 포스트 ID 필터
 * @param filters.channel      - 채널 필터
 * @param filters.status       - 상태 필터
 * @param filters.page         - 페이지 (1-based, 기본 1)
 * @param filters.limit        - 페이지당 건수 (기본 20)
 */
export async function getDistributions(filters: {
  sourcePostId?: string;
  channel?: TransformChannel;
  status?: DistributionStatus;
  page?: number;
  limit?: number;
}): Promise<{ data: ChannelDistribution[]; count: number; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const { sourcePostId, channel, status, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("channel_distributions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (sourcePostId) {
      query = query.eq("source_post_id", sourcePostId);
    }
    if (channel) {
      query = query.eq("channel", channel);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("getDistributions error:", error);
      return { data: [], count: 0, error: error.message };
    }

    return {
      data: (data as ChannelDistribution[]) ?? [],
      count: count ?? 0,
      error: null,
    };
  } catch (e) {
    console.error("getDistributions exception:", e);
    return { data: [], count: 0, error: e instanceof Error ? e.message : "조회 실패" };
  }
}

// ─── 6. 변환 결과 수동 수정 ───────────────────────────────────────────────────

/**
 * 변환된 콘텐츠를 수동으로 첨삭 (제목/본문/메타데이터)
 *
 * @param input.distributionId - channel_distributions.id
 * @param input.title          - 수정할 제목 (선택)
 * @param input.body           - 수정할 본문 (선택)
 * @param input.metadata       - 수정할 메타데이터 (선택)
 * @param input.note           - 검토 메모 (선택)
 */
export async function updateTransformedContent(input: {
  distributionId: string;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  note?: string;
}): Promise<{ error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) {
      updatePayload.transformed_title = input.title;
    }
    if (input.body !== undefined) {
      updatePayload.transformed_body = input.body;
    }
    if (input.metadata !== undefined) {
      updatePayload.transformed_metadata = input.metadata;
    }
    if (input.note !== undefined) {
      updatePayload.reviewer_note = input.note;
    }

    const { error } = await supabase
      .from("channel_distributions")
      .update(updatePayload)
      .eq("id", input.distributionId);

    if (error) {
      console.error("updateTransformedContent error:", error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error("updateTransformedContent exception:", e);
    return { error: e instanceof Error ? e.message : "수정 실패" };
  }
}
