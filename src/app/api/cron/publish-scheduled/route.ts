/**
 * publish-scheduled — 예약 발행 처리 크론 (15분마다 실행)
 *
 * channel_distributions에서 status='approved' AND scheduled_at <= now()인 건을 조회하여
 * 채널별 API 클라이언트로 발행 처리.
 *
 * 인증: Authorization: Bearer {CRON_SECRET} 헤더 필수
 *
 * 재시도 정책:
 * - 발행 실패 시 retry_count 증가
 * - retry_count < 3이면 status='approved'로 복원 → 다음 사이클에서 재시도
 * - retry_count >= 3이면 status='failed'로 최종 실패 처리
 *
 * naver_blog 특이사항:
 * - 반자동 채널이라 publish()가 에디터 URL만 반환
 * - status는 'review'로 유지, 관리자가 수동 완료 처리
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getChannelClient } from "@/lib/channel-api/get-client";
import type { TransformChannel } from "@/types/distribution";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

// 최대 재시도 횟수 (초과 시 최종 실패)
const MAX_RETRY_COUNT = 3;

// 한 번에 처리할 최대 건수 (타임아웃 방지)
const BATCH_LIMIT = 20;

export async function GET(req: Request) {
  // 1) CRON_SECRET 헤더 검증
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const runId = await startCronRun("publish-scheduled");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const now = new Date().toISOString();

  let successCount = 0;
  let failCount = 0;

  try {
    // 2) 예약 시간 도달한 배포 건 조회
    // status='approved' AND scheduled_at <= now()
    const { data: distributions, error: fetchError } = await db
      .from("channel_distributions")
      .select(
        "id, channel, transformed_title, transformed_body, transformed_metadata, retry_count"
      )
      .eq("status", "approved")
      .lte("scheduled_at", now)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchError) {
      console.error("publish-scheduled: 예약 배포 건 조회 실패", fetchError.message);
      return NextResponse.json(
        { error: `예약 배포 건 조회 실패: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const rows = (distributions as Array<{
      id: string;
      channel: TransformChannel;
      transformed_title: string | null;
      transformed_body: string | null;
      transformed_metadata: Record<string, unknown> | null;
      retry_count: number;
    }>) ?? [];

    if (rows.length === 0) {
      return NextResponse.json({
        published: 0,
        failed: 0,
        message: "처리할 예약 배포 건 없음",
      });
    }

    // 3) 각 건 순차 처리
    for (const dist of rows) {
      // 변환 결과 없으면 skip (데이터 이상)
      if (!dist.transformed_title || !dist.transformed_body) {
        console.warn(`publish-scheduled: 변환 결과 없음 (id=${dist.id}), 건너뜀`);
        continue;
      }

      // 3-1) status → 'publishing'
      await db
        .from("channel_distributions")
        .update({ status: "publishing", updated_at: now })
        .eq("id", dist.id);

      // 3-2) 채널 클라이언트 획득
      const client = await getChannelClient(dist.channel);

      if (!client) {
        // Phase 3 미구현 채널 — review로 복원 후 skip
        await db
          .from("channel_distributions")
          .update({
            status: "review",
            error_message: `${dist.channel} 채널은 Phase 3에서 구현 예정입니다.`,
            updated_at: now,
          })
          .eq("id", dist.id);
        continue;
      }

      // 3-3) 발행 시도
      try {
        const result = await client.publish({
          title: dist.transformed_title,
          body: dist.transformed_body,
          metadata: dist.transformed_metadata ?? {},
        });

        // naver_blog 반자동 → 에디터 URL만 반환, status='review' 유지
        const finalStatus = dist.channel === "naver_blog" ? "review" : "published";

        // 3-4) 성공 업데이트
        await db
          .from("channel_distributions")
          .update({
            status: finalStatus,
            external_id: result.externalId,
            external_url: result.externalUrl,
            published_at: dist.channel === "naver_blog" ? null : now,
            error_message: null,
            updated_at: now,
          })
          .eq("id", dist.id);

        successCount++;
      } catch (publishError) {
        const errMsg =
          publishError instanceof Error
            ? publishError.message
            : "발행 중 오류가 발생했습니다.";

        const newRetryCount = dist.retry_count + 1;

        if (newRetryCount < MAX_RETRY_COUNT) {
          // 재시도 가능 — 'approved'로 복원 (다음 사이클에서 재시도)
          await db
            .from("channel_distributions")
            .update({
              status: "approved",
              error_message: `발행 실패 (시도 ${newRetryCount}/${MAX_RETRY_COUNT}): ${errMsg}`,
              retry_count: newRetryCount,
              updated_at: now,
            })
            .eq("id", dist.id);

          console.warn(
            `publish-scheduled: 발행 실패, 재시도 예정 (id=${dist.id}, retry=${newRetryCount})`,
            errMsg
          );
        } else {
          // 최대 재시도 초과 → 최종 실패
          await db
            .from("channel_distributions")
            .update({
              status: "failed",
              error_message: `최대 재시도 횟수(${MAX_RETRY_COUNT}) 초과: ${errMsg}`,
              retry_count: newRetryCount,
              updated_at: now,
            })
            .eq("id", dist.id);

          console.error(
            `publish-scheduled: 최종 실패 (id=${dist.id}, retry=${newRetryCount})`,
            errMsg
          );
          failCount++;
        }
      }
    }

    // 4) 결과 반환
    await completeCronRun(runId, failCount > 0 ? "partial" : "success", successCount);
    return NextResponse.json({
      published: successCount,
      failed: failCount,
      total: rows.length,
    });
  } catch (e) {
    console.error("publish-scheduled: 크론 실행 중 예외 발생", e);
    await completeCronRun(runId, "error", 0, e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "크론 실행 실패" },
      { status: 500 }
    );
  }
}
