/**
 * 소재 임베딩 파이프라인
 * 소재 이미지 → 이미지 임베딩, 카피 텍스트 → 텍스트 임베딩
 * creative_media 테이블에 저장
 */

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";

export interface CreativeEmbedInput {
  adId: string;
  accountId: string;
  source: "own" | "competitor";
  brandName?: string;
  brandId?: string;
  category?: string;
  mediaUrl: string | null;
  mediaType?: string;
  adCopy: string | null;
  lpUrl: string | null;
  creativeType?: string;
  imageHash?: string;
  /** CAROUSEL 카드 위치 (0-based). 미지정 시 0으로 처리 */
  position?: number;
  // 성과 지표 (자사 광고용)
  roas?: number;
  ctr?: number;
  clickToPurchaseRate?: number;
  qualityRanking?: string;
}

export interface EmbedResult {
  adId: string;
  embeddingDone: boolean;
  textEmbeddingDone: boolean;
  lpEmbeddingDone: boolean;
  error?: string;
}

/**
 * 소재 이미지 + 카피 임베딩 → creative_media upsert
 * 임베딩 실패해도 나머지 필드는 저장 (다음 크론에서 재시도)
 */
export async function embedCreative(input: CreativeEmbedInput): Promise<EmbedResult> {
  const supabase = createServiceClient();
  const result: EmbedResult = {
    adId: input.adId,
    embeddingDone: false,
    textEmbeddingDone: false,
    lpEmbeddingDone: false,
  };

  // ad_id → creatives.id 매핑
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creative } = await (supabase as any)
    .from("creatives")
    .select("id")
    .eq("ad_id", input.adId)
    .maybeSingle();

  if (!creative?.id) {
    result.error = `creatives 테이블에 ad_id=${input.adId} 없음`;
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    embedding_model: EMBEDDING_MODEL,
    updated_at: new Date().toISOString(),
  };

  // 1. 소재 이미지 임베딩
  if (input.mediaUrl) {
    try {
      updates.embedding = await generateEmbedding(
        { imageUrl: input.mediaUrl },
        { taskType: "SEMANTIC_SIMILARITY" },
      );
      result.embeddingDone = true;
    } catch (err) {
      console.error(`[creative-embedder] Image embedding failed for ${input.adId}:`, err);
    }
  }

  // 2. 카피 텍스트 임베딩
  if (input.adCopy && input.adCopy.trim().length > 5) {
    try {
      updates.text_embedding = await generateEmbedding(
        input.adCopy,
        { taskType: "SEMANTIC_SIMILARITY" },
      );
      result.textEmbeddingDone = true;
    } catch (err) {
      console.error(`[creative-embedder] Text embedding failed for ${input.adId}:`, err);
    }
  }

  // 3. creative_media에 임베딩 업데이트 (position별 특정 row)
  if (Object.keys(updates).length > 2) {
    // embedding_model + updated_at 외에 실제 임베딩이 있을 때만
    updates.embedded_at = new Date().toISOString();
    const position = input.position ?? 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("creative_media")
        .update(updates)
        .eq("creative_id", creative.id)
        .eq("position", position);

      if (error) {
        result.error = error.message;
        console.error(`[creative-embedder] Update failed for ${input.adId} pos=${position}:`, error);
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`[creative-embedder] DB error for ${input.adId} pos=${position}:`, err);
    }
  }

  return result;
}

/**
 * 임베딩이 없는 creative_media row들에 대해 임베딩만 실행
 * 배치 처리: batchSize개씩, delayMs 간격
 */
export async function embedMissingCreatives(
  batchSize = 50,
  delayMs = 500,
): Promise<{ processed: number; embedded: number; errors: number }> {
  const supabase = createServiceClient();

  // creative_media에서 임베딩 없는 행 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("creative_media")
    .select("id, creative_id, media_url, ad_copy, embedding, text_embedding")
    .or("embedding.is.null,text_embedding.is.null")
    .eq("is_active", true)
    .not("media_url", "is", null)
    .limit(batchSize);

  if (error || !rows) {
    console.error("[creative-embedder] Query failed:", error);
    return { processed: 0, embedded: 0, errors: 1 };
  }

  let embedded = 0;
  let errors = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    // 이미지 임베딩이 없으면 생성
    if (!row.embedding && row.media_url) {
      try {
        updates.embedding = await generateEmbedding(
          { imageUrl: row.media_url },
          { taskType: "SEMANTIC_SIMILARITY" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing embed failed (cm.id=${row.id}):`, err);
        errors++;
      }
    }

    // 텍스트 임베딩이 없으면 생성
    if (!row.text_embedding && row.ad_copy) {
      try {
        updates.text_embedding = await generateEmbedding(
          row.ad_copy,
          { taskType: "SEMANTIC_SIMILARITY" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing text embed failed (cm.id=${row.id}):`, err);
        errors++;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.embedding_model = EMBEDDING_MODEL;
      updates.embedded_at = new Date().toISOString();
      updates.updated_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from("creative_media")
        .update(updates)
        .eq("id", row.id);

      if (updateErr) {
        errors++;
      } else {
        embedded++;
      }
    }

    // 딜레이
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return { processed: rows.length, embedded, errors };
}
