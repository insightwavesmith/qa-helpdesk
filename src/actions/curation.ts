"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { embedContentToChunks } from "@/actions/embed-pipeline";
import { requireStaff, requireAdmin } from "@/lib/auth-utils";
import { generateFlashText } from "@/lib/gemini";
import type { LinkedInfoShare, CurationContentWithLinks } from "@/types/content";

export async function getCurationContents({
  source,
  minScore,
  period,
  showDismissed = false,
  curationStatus,
  page = 1,
  pageSize = 100,
}: {
  source?: string;
  minScore?: number;
  period?: string;
  showDismissed?: boolean;
  curationStatus?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: CurationContentWithLinks[]; count: number; error: string | null }> {
  const db = await requireStaff();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // deleted_at은 새 컬럼이라 Supabase 타입에 없음 — filter로 우회
  let query = (db
    .from("contents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("*", { count: "exact" }) as any)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  // curation_status 필터 (신규 상태 필터 우선)
  if (curationStatus && curationStatus !== "all") {
    query = query.eq("curation_status", curationStatus);
  } else if (showDismissed) {
    query = query.in("curation_status", ["new", "selected", "dismissed"]);
  } else {
    query = query.in("curation_status", ["new", "selected"]);
  }

  // 소스 필터 (모든 source_type 허용, info_share만 제외)
  if (source && source !== "all") {
    query = query.eq("source_type", source);
  } else {
    query = query.neq("source_type", "info_share");
  }

  // 중요도 필터
  if (minScore && minScore > 0) {
    query = query.gte("importance_score", minScore);
  }

  // 기간 필터
  if (period === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query.gte("created_at", today.toISOString());
  } else if (period === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte("created_at", weekAgo.toISOString());
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getCurationContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  const contents = data || [];
  if (contents.length === 0) {
    return { data: [], count: count || 0, error: null };
  }

  // content_relations JOIN으로 생성물 연결 조회
  const contentIds = contents.map((c: { id: string }) => c.id);
  const linkMap = await getLinkedInfoSharesMap(db, contentIds);

  const enriched: CurationContentWithLinks[] = contents.map((c: { id: string }) => ({
    ...c,
    linked_info_shares: linkMap.get(c.id) || [],
  })) as CurationContentWithLinks[];

  return { data: enriched, count: count || 0, error: null };
}

/** content_relations 테이블을 이용해 소스→생성물 연결 조회 */
async function getLinkedInfoSharesMap(
  db: Awaited<ReturnType<typeof requireStaff>>,
  contentIds: string[]
): Promise<Map<string, LinkedInfoShare[]>> {
  const linkMap = new Map<string, LinkedInfoShare[]>();

  if (contentIds.length === 0) return linkMap;

  // content_relations는 새 테이블이라 아직 Supabase 타입에 없음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: relations } = await (db as any)

    .from("content_relations")
    .select("source_id, generated_id")
    .in("source_id", contentIds) as { data: { source_id: string; generated_id: string }[] | null };

  if (!relations || relations.length === 0) return linkMap;

  // 생성물 id 목록
  const generatedIds = [...new Set(relations.map((r) => r.generated_id))];

  const { data: generatedContents } = await db
    .from("contents")
    .select("id, title, status")
    .in("id", generatedIds);

  if (!generatedContents) return linkMap;

  const genMap = new Map<string, { id: string; title: string; status: string }>();
  for (const g of generatedContents) {
    genMap.set(g.id, g);
  }

  for (const rel of relations) {
    const gen = genMap.get(rel.generated_id);
    if (!gen) continue;
    const existing = linkMap.get(rel.source_id) || [];
    existing.push({ id: gen.id, title: gen.title, status: gen.status });
    linkMap.set(rel.source_id, existing);
  }

  return linkMap;
}

export async function getCurationCount() {
  const db = await requireStaff();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (db as any)
    .from("contents")
    .select("id", { count: "exact", head: true })
    .in("curation_status", ["new", "selected"])
    .is("deleted_at", null)
    .neq("source_type", "info_share");

  if (error) {
    console.error("getCurationCount error:", error);
    return 0;
  }

  return count || 0;
}

// ─── 상태별 카운트 (Phase 2 T2) ─────────────────────────────

export interface CurationStatusCounts {
  total: number;
  new: number;
  selected: number;
  dismissed: number;
  published: number;
}

export async function getCurationStatusCounts(
  source?: string
): Promise<CurationStatusCounts> {
  const db = await requireStaff();

  const buildQuery = (status?: string) => {
    let q = (db
      .from("contents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id", { count: "exact", head: true }) as any)
      .is("deleted_at", null);

    if (source && source !== "all") {
      q = q.eq("source_type", source);
    } else {
      q = q.neq("source_type", "info_share");
    }

    if (status) {
      q = q.eq("curation_status", status);
    }

    return q;
  };

  const [totalRes, newRes, selectedRes, dismissedRes, publishedRes] = await Promise.all([
    buildQuery(),
    buildQuery("new"),
    buildQuery("selected"),
    buildQuery("dismissed"),
    buildQuery("published"),
  ]);

  return {
    total: totalRes.count || 0,
    new: newRes.count || 0,
    selected: selectedRes.count || 0,
    dismissed: dismissedRes.count || 0,
    published: publishedRes.count || 0,
  };
}

export async function updateCurationStatus(
  id: string,
  status: "new" | "selected" | "dismissed" | "published"
) {
  const db = await requireStaff();

  const { error } = await db
    .from("contents")
    .update({
      curation_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateCurationStatus error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function batchUpdateCurationStatus(
  ids: string[],
  status: "new" | "selected" | "dismissed" | "published"
) {
  const db = await requireStaff();

  const { error } = await db
    .from("contents")
    .update({
      curation_status: status,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) {
    console.error("batchUpdateCurationStatus error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function createInfoShareDraft({
  title,
  bodyMd,
  category = "education",
  sourceContentIds,
  thumbnailUrl,
}: {
  title: string;
  bodyMd: string;
  category?: string;
  sourceContentIds: string[];
  thumbnailUrl?: string | null;
}) {
  const db = await requireStaff();
  const now = new Date().toISOString();

  // 1. 새 contents 행 INSERT (draft — 콘텐츠 탭에서 편집/게시)
  const { data: newContent, error: insertError } = await db
    .from("contents")
    .insert({
      title,
      body_md: bodyMd,
      status: "draft",
      type: "education",
      category,
      source_type: "info_share",
      source_ref: sourceContentIds.join(","),
      curation_status: "selected",
      ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
    })
    .select("id")
    .single();

  if (insertError || !newContent) {
    console.error("createInfoShareDraft insert error:", insertError);
    return { data: null, error: insertError?.message || "생성 실패" };
  }

  // 2. content_relations에 관계 기록
  if (sourceContentIds.length > 0) {
    const relations = sourceContentIds.map((srcId) => ({
      source_id: srcId,
      generated_id: newContent.id,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: relError } = await (db as any)
      .from("content_relations")
      .insert(relations);
    if (relError) {
      console.error("createInfoShareDraft content_relations insert error:", relError);
    }
  }

  // 3. 자동 임베딩 (응답 반환 후 비동기 실행)
  after(async () => {
    try {
      await embedContentToChunks(newContent.id);
    } catch (err) {
      console.error("createInfoShareDraft auto-embed failed:", err);
    }
  });

  revalidatePath("/admin/content");
  return { data: { id: newContent.id }, error: null };
}

export async function getInfoShareContents({
  page = 1,
  pageSize = 50,
}: { page?: number; pageSize?: number } = {}) {
  const db = await requireStaff();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await db
    .from("contents")
    .select("*", { count: "exact" })
    .eq("source_type", "info_share")
    .in("curation_status", ["published", "selected"])
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getInfoShareContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

// ─── T7: 파이프라인 현황 ─────────────────────────────────────

export interface PipelineStat {
  sourceType: string;
  label: string;
  contentsCount: number;
  chunksCount: number;
  newCount: number;
}

const SOURCE_LABELS: Record<string, string> = {
  blueprint: "블루프린트",
  lecture: "자사몰사관학교",
  youtube: "YouTube",
  crawl: "블로그",
  marketing_theory: "마케팅원론",
  webinar: "웨비나",
  papers: "논문",
  file: "파일",
};

export async function getPipelineStats(): Promise<PipelineStat[]> {
  const db = await requireStaff();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  // 3개 쿼리 병렬 실행
  const s = db;
  const [contentsRes, chunksRes, newRes] = await Promise.all([
    db.from("contents").select("source_type").neq("source_type", "info_share"),
    s.from("knowledge_chunks").select("source_type"),
    db.from("contents").select("source_type").gte("created_at", dayAgo).neq("source_type", "info_share"),
  ]);

  // 집계
  const contentsCounts: Record<string, number> = {};
  const chunksCounts: Record<string, number> = {};
  const newCounts: Record<string, number> = {};

  for (const row of (contentsRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    contentsCounts[st] = (contentsCounts[st] || 0) + 1;
  }
  for (const row of (chunksRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    chunksCounts[st] = (chunksCounts[st] || 0) + 1;
  }
  for (const row of (newRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    newCounts[st] = (newCounts[st] || 0) + 1;
  }

  const allSources = new Set([...Object.keys(contentsCounts), ...Object.keys(chunksCounts)]);
  const stats: PipelineStat[] = [];
  for (const st of allSources) {
    if (st === "info_share" || st === "unknown") continue;
    stats.push({
      sourceType: st,
      label: SOURCE_LABELS[st] || st,
      contentsCount: contentsCounts[st] || 0,
      chunksCount: chunksCounts[st] || 0,
      newCount: newCounts[st] || 0,
    });
  }
  stats.sort((a, b) => b.chunksCount - a.chunksCount);
  return stats;
}

// ─── 커리큘럼 콘텐츠 조회 ─────────────────────────────────

export async function getCurriculumContents(sourceType: string) {
  const db = await requireStaff();

  const { data, error } = await db
    .from("contents")
    .select("*")
    .eq("source_type", sourceType)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getCurriculumContents error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

// ─── 사이드바 통계 (AI 요약 완료/미처리) ─────────────────────

export async function getCurationSummaryStats(): Promise<{
  total: number;
  withSummary: number;
  withoutSummary: number;
}> {
  const db = await requireStaff();

  const [totalRes, withSummaryRes] = await Promise.all([
    db.from("contents").select("id", { count: "exact", head: true }).neq("source_type", "info_share").neq("status", "archived"),
    db.from("contents").select("id", { count: "exact", head: true }).neq("source_type", "info_share").neq("status", "archived").not("ai_summary", "is", null),
  ]);

  const total = totalRes.count || 0;
  const withSummary = withSummaryRes.count || 0;

  return {
    total,
    withSummary,
    withoutSummary: total - withSummary,
  };
}

// ─── Soft Delete (Phase 2 T3) ────────────────────────────────

export async function softDeleteContents(
  ids: string[]
): Promise<{ error: string | null }> {
  const db = await requireStaff();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("contents")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    console.error("softDeleteContents error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function restoreContents(
  ids: string[]
): Promise<{ error: string | null }> {
  const db = await requireStaff();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("contents")
    .update({ deleted_at: null })
    .in("id", ids);

  if (error) {
    console.error("restoreContents error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function getDeletedContents(
  source?: string
): Promise<{ data: Array<Record<string, unknown>>; count: number; error: string | null }> {
  const db = await requireStaff();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from("contents")
    .select("id, title, source_type, deleted_at, created_at", { count: "exact" })
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (source && source !== "all") {
    query = query.eq("source_type", source);
  } else {
    query = query.neq("source_type", "info_share");
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getDeletedContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

// ─── Phase 0: 백필 ─────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function backfillAiSummary(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const db = await requireAdmin();

  const { data: rows, error } = await db
    .from("contents")
    .select("id, title, body_md")
    .is("ai_summary", null)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    return { processed: 0, failed: 0, errors: [error.message] };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    try {
      const text = (row.body_md || "").slice(0, 3000);

      // T2: 빈 본문 가드
      if (!text.trim()) {
        failed++;
        errors.push(`${row.id}: 빈 본문 skip`);
        continue;
      }

      const prompt = `다음 콘텐츠를 3줄로 핵심 요약해주세요. 불릿포인트 없이 평서문으로 작성하세요.

제목: ${row.title}
본문:
${text}

3줄 요약:`;

      const summary = await generateFlashText(prompt, { temperature: 0.2, maxTokens: 300 });

      if (!summary || !summary.trim()) {
        failed++;
        errors.push(`${row.id}: 빈 응답`);
        continue;
      }

      const { error: updateErr } = await db
        .from("contents")
        .update({ ai_summary: summary.trim(), updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateErr) {
        failed++;
        errors.push(`${row.id}: ${updateErr.message}`);
      } else {
        processed++;
      }

      // rate limit: 1초 간격
      await delay(1000);
    } catch (e) {
      failed++;
      errors.push(`${row.id}: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    }
  }

  return { processed, failed, errors };
}

export async function backfillImportanceScore(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const db = await requireAdmin();

  // importance_score가 0이거나 null인 레코드 조회
  const [nullRes, zeroRes] = await Promise.all([
    db.from("contents").select("id, title, body_md, source_type").is("importance_score", null).neq("status", "archived"),
    db.from("contents").select("id, title, body_md, source_type").eq("importance_score", 0).neq("status", "archived"),
  ]);

  const rows = [
    ...(nullRes.data || []),
    ...(zeroRes.data || []),
  ];

  // 중복 제거
  const seen = new Set<string>();
  const uniqueRows = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of uniqueRows) {
    try {
      let score: number;

      // blueprint/lecture -> 고정 5
      if (row.source_type === "blueprint" || row.source_type === "lecture") {
        score = 5;
      } else {
        // AI 스코어링
        const text = (row.body_md || "").slice(0, 2000);

        // T2: 빈 본문 가드
        if (!text.trim()) {
          failed++;
          errors.push(`${row.id}: 빈 본문 skip`);
          continue;
        }

        const prompt = `이 콘텐츠의 자사몰 사업자 교육 관점에서의 중요도를 1~5로 평가해주세요.
5=필수 학습, 4=매우 유용, 3=참고할 만함, 2=일반적, 1=관련성 낮음

제목: ${row.title}
본문 앞부분:
${text}

숫자만 답변해주세요 (1~5):`;

        const result = await generateFlashText(prompt, { temperature: 0.1, maxTokens: 10 });
        const parsed = parseInt(result.trim());

        if (isNaN(parsed) || parsed < 1 || parsed > 5) {
          score = 3; // 파싱 실패 시 기본값
        } else {
          score = parsed;
        }

        // rate limit: 1초 간격 (AI 호출한 경우만)
        await delay(1000);
      }

      const { error: updateErr } = await db
        .from("contents")
        .update({ importance_score: score, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateErr) {
        failed++;
        errors.push(`${row.id}: ${updateErr.message}`);
      } else {
        processed++;
      }
    } catch (e) {
      failed++;
      errors.push(`${row.id}: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    }
  }

  return { processed, failed, errors };
}
