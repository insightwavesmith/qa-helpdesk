/**
 * T3: 광고 소재 임베딩 파이프라인
 * 소재 이미지 → 이미지 임베딩, 카피 텍스트 → 텍스트 임베딩
 * ad_creative_embeddings 테이블에 저장
 */

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { crawlLandingPage } from "@/lib/lp-crawler";

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
 * 소재 이미지 + 카피 임베딩 → ad_creative_embeddings upsert
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

  // 기본 row 데이터 (임베딩 없이)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    ad_id: input.adId,
    account_id: input.accountId,
    source: input.source,
    brand_name: input.brandName || null,
    brand_id: input.brandId || null,
    category: input.category || null,
    media_url: input.mediaUrl,
    media_type: input.mediaType || null,
    ad_copy: input.adCopy,
    lp_url: input.lpUrl,
    creative_type: input.creativeType || null,
    media_hash: input.imageHash || null,
    embedding_model: EMBEDDING_MODEL,
    is_active: true,
    updated_at: new Date().toISOString(),
    // 성과 지표
    roas: input.roas ?? null,
    ctr: input.ctr ?? null,
    click_to_purchase_rate: input.clickToPurchaseRate ?? null,
    quality_ranking: input.qualityRanking ?? null,
  };

  // 1. 소재 이미지 임베딩
  if (input.mediaUrl) {
    try {
      const embedding = await generateEmbedding(
        { imageUrl: input.mediaUrl },
        { taskType: "RETRIEVAL_DOCUMENT" },
      );
      row.embedding = embedding;
      result.embeddingDone = true;
    } catch (err) {
      console.error(`[creative-embedder] Image embedding failed for ${input.adId}:`, err);
    }
  }

  // 2. 카피 텍스트 임베딩
  if (input.adCopy && input.adCopy.trim().length > 5) {
    try {
      const textEmbedding = await generateEmbedding(
        input.adCopy,
        { taskType: "RETRIEVAL_DOCUMENT" },
      );
      row.text_embedding = textEmbedding;
      result.textEmbeddingDone = true;
    } catch (err) {
      console.error(`[creative-embedder] Text embedding failed for ${input.adId}:`, err);
    }
  }

  // 3. LP 크롤링 + 임베딩 (LP URL이 있고, 아직 크롤링 안 된 경우)
  if (input.lpUrl) {
    try {
      const lpData = await crawlLandingPage(input.lpUrl);
      if (lpData) {
        row.lp_headline = lpData.headline || null;
        row.lp_price = lpData.price || null;
        row.lp_hash = lpData.ogImageUrl || null;
        row.lp_crawled_at = new Date().toISOString();

        // LP OG 이미지 임베딩
        if (lpData.ogImageUrl) {
          try {
            const lpEmbedding = await generateEmbedding(
              { imageUrl: lpData.ogImageUrl },
              { taskType: "RETRIEVAL_DOCUMENT" },
            );
            row.lp_embedding = lpEmbedding;
            result.lpEmbeddingDone = true;
          } catch (err) {
            console.error(`[creative-embedder] LP image embedding failed for ${input.adId}:`, err);
          }
        }

        // LP 텍스트 임베딩
        if (lpData.text && lpData.text.trim().length > 10) {
          try {
            const lpTextEmbedding = await generateEmbedding(
              lpData.text,
              { taskType: "RETRIEVAL_DOCUMENT" },
            );
            row.lp_text_embedding = lpTextEmbedding;
          } catch (err) {
            console.error(`[creative-embedder] LP text embedding failed for ${input.adId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[creative-embedder] LP crawl failed for ${input.lpUrl}:`, err);
    }
  }

  // 4. Upsert (ad_id 기준)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("ad_creative_embeddings")
      .upsert(row, { onConflict: "ad_id" });

    if (error) {
      result.error = error.message;
      console.error(`[creative-embedder] Upsert failed for ${input.adId}:`, error);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error(`[creative-embedder] DB error for ${input.adId}:`, err);
  }

  return result;
}

/**
 * 임베딩이 없는 기존 row들에 대해 임베딩만 실행
 * 배치 처리: batchSize개씩, delayMs 간격
 */
export async function embedMissingCreatives(
  batchSize = 50,
  delayMs = 500,
): Promise<{ processed: number; embedded: number; errors: number }> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("id, ad_id, media_url, ad_copy, lp_url, lp_crawled_at, embedding, text_embedding, lp_embedding")
    .or("embedding.is.null,text_embedding.is.null")
    .eq("is_active", true)
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
          { taskType: "RETRIEVAL_DOCUMENT" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing embed failed ${row.ad_id}:`, err);
        errors++;
      }
    }

    // 텍스트 임베딩이 없으면 생성
    if (!row.text_embedding && row.ad_copy) {
      try {
        updates.text_embedding = await generateEmbedding(
          row.ad_copy,
          { taskType: "RETRIEVAL_DOCUMENT" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing text embed failed ${row.ad_id}:`, err);
        errors++;
      }
    }

    // LP 임베딩 (아직 크롤링 안 된 경우)
    if (!row.lp_embedding && row.lp_url && !row.lp_crawled_at) {
      try {
        const lpData = await crawlLandingPage(row.lp_url);
        if (lpData?.ogImageUrl) {
          updates.lp_embedding = await generateEmbedding(
            { imageUrl: lpData.ogImageUrl },
            { taskType: "RETRIEVAL_DOCUMENT" },
          );
          updates.lp_headline = lpData.headline || null;
          updates.lp_price = lpData.price || null;
          updates.lp_crawled_at = new Date().toISOString();

          if (lpData.text && lpData.text.trim().length > 10) {
            updates.lp_text_embedding = await generateEmbedding(
              lpData.text,
              { taskType: "RETRIEVAL_DOCUMENT" },
            );
          }
        }
      } catch {
        // LP 크롤링 실패는 무시
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from("ad_creative_embeddings")
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
