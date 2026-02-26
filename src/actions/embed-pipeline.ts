"use server";

// T2: Embed Pipeline — contents를 chunk 분할 → Gemini 임베딩 → knowledge_chunks INSERT
// blueprint 16개는 기존 chunks에 content_id 연결만 (INSERT 스킵)

import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";
import { chunkText } from "@/lib/chunk-utils";

// ─── 타입 ────────────────────────────────────────────────────

interface EmbedResult {
  contentId: string;
  title: string;
  status: "success" | "skipped" | "linked" | "failed";
  chunksCount: number;
  error?: string;
}

interface EmbedAllResult {
  total: number;
  success: number;
  linked: number;
  skipped: number;
  failed: number;
  results: EmbedResult[];
}

// ─── source_type → priority 매핑 ────────────────────────────

function getPriority(sourceType: string | null): number {
  switch (sourceType) {
    case "lecture":
    case "blueprint":
    case "papers":
    case "webinar":
      return 1;
    case "qa":
    case "feedback":
    case "info_share":
      return 2;
    case "crawl":
    case "marketing_theory":
      return 3;
    case "meeting":
    case "youtube":
      return 4;
    case "assignment":
      return 5;
    default:
      return 3;
  }
}

// ─── Blueprint 매칭 ─────────────────────────────────────────

/**
 * contents.title에서 핵심 인증명 추출
 * "Meta Blueprint 인증: AI 및 퍼포먼스 마케팅 스페셜리스트 - 교육 과정 개요"
 * → "AI 및 퍼포먼스 마케팅 스페셜리스트"
 */
function extractCertName(title: string): string {
  // "Meta Blueprint 인증: " 제거
  let name = title.replace(/^Meta Blueprint 인증:\s*/, "");
  // " - 교육 과정 개요" / " - 시험 개요" / " - 학습 가이드" 등 제거
  name = name.replace(/\s*-\s*[^-]+$/, "");
  return name.trim();
}

/**
 * 인증명 → knowledge_chunks.lecture_name 변환
 * "AI 및 퍼포먼스 마케팅 스페셜리스트" → "Blueprint: AI 및 퍼포먼스 마케팅 스페셜리스트"
 */
function toLectureName(certName: string): string {
  return `Blueprint: ${certName}`;
}

// ─── 단일 콘텐츠 임베딩 ─────────────────────────────────────

const BATCH_SIZE = 3; // F-R2: rate limit 안전 마진 (5→3)
const BATCH_DELAY_MS = 500; // F-R2: 200→500ms

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function embedContentToChunks(
  contentId: string
): Promise<EmbedResult> {
  const supabase = createServiceClient();

  // 1. contents 조회
  const { data: content, error: fetchErr } = await supabase
    .from("contents")
    .select("id, title, body_md, source_type, source_ref")
    .eq("id", contentId)
    .single();

  if (fetchErr || !content) {
    return {
      contentId,
      title: "",
      status: "failed",
      chunksCount: 0,
      error: fetchErr?.message || "콘텐츠를 찾을 수 없습니다",
    };
  }

  const title = content.title || "";
  const bodyMd = content.body_md || "";
  const sourceType = content.source_type || "crawl";
  const priority = getPriority(sourceType);

  // 2. body_md가 비어있으면 실패 처리
  if (!bodyMd.trim()) {
    await supabase
      .from("contents")
      .update({ embedding_status: "failed" } as Record<string, unknown>)
      .eq("id", contentId);
    return {
      contentId,
      title,
      status: "failed",
      chunksCount: 0,
      error: "body_md가 비어있습니다",
    };
  }

  // 3. Blueprint 특수 처리: 기존 chunks에 content_id 연결만
  if (sourceType === "blueprint") {
    return linkBlueprintChunks(supabase, contentId, title);
  }

  // 4. 재임베딩: 기존 chunks 삭제
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("knowledge_chunks")
    .delete()
    .eq("content_id", contentId);

  // 5. Chunk 분할
  const chunks = chunkText(bodyMd);
  if (chunks.length === 0) {
    await supabase
      .from("contents")
      .update({ embedding_status: "failed" } as Record<string, unknown>)
      .eq("id", contentId);
    return {
      contentId,
      title,
      status: "failed",
      chunksCount: 0,
      error: "청킹 결과가 비어있습니다",
    };
  }

  // 6. 임베딩 → INSERT (batch 처리)
  await supabase
    .from("contents")
    .update({ embedding_status: "processing" } as Record<string, unknown>)
    .eq("id", contentId);

  let insertedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const chunkIndex = i + j;
      const chunkContent = batch[j];

      try {
        const embedding = await generateEmbedding(chunkContent);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertErr } = await (supabase as any)
          .from("knowledge_chunks")
          .insert({
          lecture_name: title,
          week: sourceType,
          chunk_index: chunkIndex,
          content: chunkContent,
          embedding,
          source_type: sourceType,
          priority,
          content_id: contentId,
          chunk_total: chunks.length,
          source_ref: content.source_ref || null,
          embedding_model: "gemini-embedding-001",
        });

        if (insertErr) {
          console.error(
            `[embed] INSERT 실패 chunk ${chunkIndex}:`,
            insertErr
          );
        } else {
          insertedCount++;
        }
      } catch (err) {
        // 429 등 API 에러 시 exponential backoff (F-R2 반영)
        if (err instanceof Error && err.message.includes("429")) {
          console.warn(`[embed] Rate limit, backoff 2s (chunk ${chunkIndex})`);
          await delay(2000);
          j--; // 재시도
          continue;
        }
        console.error(`[embed] 임베딩 실패 chunk ${chunkIndex}:`, err);
      }
    }

    // 배치 간 딜레이
    if (i + BATCH_SIZE < chunks.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  // 7. contents 상태 갱신
  const status = insertedCount > 0 ? "completed" : "failed";
  await supabase
    .from("contents")
    .update({
      embedding_status: status,
      chunks_count: insertedCount,
      embedded_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", contentId);

  return {
    contentId,
    title,
    status: insertedCount > 0 ? "success" : "failed",
    chunksCount: insertedCount,
  };
}

// ─── Blueprint 연결 (INSERT 스킵) ───────────────────────────

async function linkBlueprintChunks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contentId: string,
  title: string
): Promise<EmbedResult> {
  const certName = extractCertName(title);
  const lectureName = toLectureName(certName);

  // 기존 chunks 찾기
  const { data: existing, error: findErr } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .eq("lecture_name", lectureName)
    .eq("source_type", "blueprint");

  if (findErr || !existing || existing.length === 0) {
    console.warn(
      `[embed] Blueprint 매칭 실패: "${title}" → "${lectureName}". 기존 chunks 없음.`
    );
    // 매칭 실패 시 일반 임베딩으로 폴백하지 않음 (데이터 중복 방지)
    await supabase
      .from("contents")
      .update({ embedding_status: "failed" } as Record<string, unknown>)
      .eq("id", contentId);
    return {
      contentId,
      title,
      status: "failed",
      chunksCount: 0,
      error: `Blueprint 매칭 실패: "${lectureName}" 해당 chunks 없음`,
    };
  }

  // content_id 연결
  await supabase
    .from("knowledge_chunks")
    .update({ content_id: contentId })
    .eq("lecture_name", lectureName)
    .eq("source_type", "blueprint");

  // contents 상태 갱신
  await supabase
    .from("contents")
    .update({
      embedding_status: "completed",
      chunks_count: existing.length,
      embedded_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", contentId);

  return {
    contentId,
    title,
    status: "linked",
    chunksCount: existing.length,
  };
}

// ─── 전체 임베딩 ─────────────────────────────────────────────

export async function embedAllPending(): Promise<EmbedAllResult> {
  const supabase = createServiceClient();

  const { data: pending, error: queryErr } = await supabase
    .from("contents")
    .select("id, title, source_type")
    .eq("embedding_status", "pending")
    .order("source_type");

  if (queryErr || !pending) {
    return {
      total: 0,
      success: 0,
      linked: 0,
      skipped: 0,
      failed: 1,
      results: [
        {
          contentId: "",
          title: "",
          status: "failed",
          chunksCount: 0,
          error: queryErr?.message || "pending 조회 실패",
        },
      ],
    };
  }

  const results: EmbedResult[] = [];

  for (const item of pending) {
    try {
      const result = await embedContentToChunks(item.id);
      results.push(result);
      console.log(
        `[embed] ${result.status}: ${item.title} (${result.chunksCount} chunks)`
      );
    } catch (err) {
      results.push({
        contentId: item.id,
        title: item.title || "",
        status: "failed",
        chunksCount: 0,
        error: err instanceof Error ? err.message : "알 수 없는 에러",
      });
    }
  }

  return {
    total: pending.length,
    success: results.filter((r) => r.status === "success").length,
    linked: results.filter((r) => r.status === "linked").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
