/**
 * T3: 광고 소재 임베딩 파이프라인
 * 소재 이미지 → 이미지 임베딩, 카피 텍스트 → 텍스트 임베딩
 * ad_creative_embeddings 테이블에 저장
 */

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { crawlSingle } from "@/lib/railway-crawler";
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
        { taskType: "SEMANTIC_SIMILARITY" },
      );
      row.embedding_3072 = embedding;
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
        { taskType: "SEMANTIC_SIMILARITY" },
      );
      row.text_embedding_3072 = textEmbedding;
      result.textEmbeddingDone = true;
    } catch (err) {
      console.error(`[creative-embedder] Text embedding failed for ${input.adId}:`, err);
    }
  }

  // 3. LP 크롤링 + 임베딩 (Railway → cheerio 폴백)
  if (input.lpUrl) {
    try {
      // Railway Playwright 크롤링 시도
      const railwayResult = await crawlSingle(input.lpUrl);

      if (railwayResult) {
        row.lp_headline = railwayResult.text.headline || null;
        row.lp_price = railwayResult.text.price || null;
        row.screenshot_hash = railwayResult.screenshotHash || null;
        row.lp_crawled_at = new Date().toISOString();

        // 스크린샷 base64 → Supabase Storage 저장
        if (railwayResult.screenshot) {
          const screenshotUrl = await uploadScreenshot(
            supabase,
            input.adId,
            "main",
            railwayResult.screenshot,
          );
          if (screenshotUrl) row.lp_screenshot_url = screenshotUrl;
        }
        if (railwayResult.ctaScreenshot) {
          const ctaUrl = await uploadScreenshot(
            supabase,
            input.adId,
            "cta",
            railwayResult.ctaScreenshot,
          );
          if (ctaUrl) row.lp_cta_screenshot_url = ctaUrl;
        }

        // 스크린샷 이미지 임베딩 (base64 → inline data)
        if (railwayResult.screenshot) {
          try {
            const lpEmbedding = await generateEmbedding(
              {
                imageUrl: `data:image/png;base64,${railwayResult.screenshot}`,
              },
              { taskType: "SEMANTIC_SIMILARITY" },
            );
            row.lp_embedding = lpEmbedding;
            result.lpEmbeddingDone = true;
          } catch (err) {
            console.error(`[creative-embedder] LP screenshot embedding failed for ${input.adId}:`, err);
          }
        }

        // LP 텍스트 임베딩 (headline + description)
        const lpText = [
          railwayResult.text.headline,
          railwayResult.text.description,
        ]
          .filter(Boolean)
          .join("\n");
        if (lpText.trim().length > 10) {
          try {
            row.lp_text_embedding = await generateEmbedding(lpText, {
              taskType: "SEMANTIC_SIMILARITY",
            });
          } catch (err) {
            console.error(`[creative-embedder] LP text embedding failed for ${input.adId}:`, err);
          }
        }
      } else {
        // Railway 실패 → cheerio 폴백
        console.warn(`[creative-embedder] Railway failed, falling back to cheerio for ${input.lpUrl}`);
        const lpData = await crawlLandingPage(input.lpUrl);
        if (lpData) {
          row.lp_headline = lpData.headline || null;
          row.lp_price = lpData.price || null;
          row.lp_hash = lpData.ogImageUrl || null;
          row.lp_crawled_at = new Date().toISOString();

          if (lpData.ogImageUrl) {
            try {
              row.lp_embedding = await generateEmbedding(
                { imageUrl: lpData.ogImageUrl },
                { taskType: "SEMANTIC_SIMILARITY" },
              );
              result.lpEmbeddingDone = true;
            } catch (err) {
              console.error(`[creative-embedder] LP OG image embedding failed for ${input.adId}:`, err);
            }
          }

          if (lpData.text && lpData.text.trim().length > 10) {
            try {
              row.lp_text_embedding = await generateEmbedding(lpData.text, {
                taskType: "SEMANTIC_SIMILARITY",
              });
            } catch (err) {
              console.error(`[creative-embedder] LP text embedding failed for ${input.adId}:`, err);
            }
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

  // 5. creative_media 듀얼 라이트 (best-effort)
  try {
    // ad_id → creatives.id 매핑
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creative } = await (supabase as any)
      .from("creatives")
      .select("id")
      .eq("ad_id", input.adId)
      .maybeSingle();

    if (creative?.id) {
      // creative_media에서 해당 creative_id 행 조회
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cmRow } = await (supabase as any)
        .from("creative_media")
        .select("id")
        .eq("creative_id", creative.id)
        .maybeSingle();

      if (cmRow?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cmUpdates: Record<string, any> = {
          embedding_model: EMBEDDING_MODEL,
          embedded_at: new Date().toISOString(),
        };
        if (row.embedding_3072) cmUpdates.embedding = row.embedding_3072;
        if (row.text_embedding_3072) cmUpdates.text_embedding = row.text_embedding_3072;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("creative_media")
          .update(cmUpdates)
          .eq("id", cmRow.id);
      }
    }
  } catch (err) {
    // creative_media 듀얼 라이트 실패는 무시 (ad_creative_embeddings는 이미 저장됨)
    console.warn(
      `[creative-embedder] creative_media 듀얼 라이트 스킵 (${input.adId}):`,
      err instanceof Error ? err.message : err,
    );
  }

  return result;
}

/**
 * base64 스크린샷을 Supabase Storage에 업로드
 * 반환: public URL (또는 null)
 */
async function uploadScreenshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  adId: string,
  type: "main" | "cta",
  base64Data: string,
): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const path = `lp-screenshots/${adId}/${type}.png`;

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error(`[creative-embedder] Storage upload failed:`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("creatives")
      .getPublicUrl(path);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error(`[creative-embedder] Screenshot upload error:`, err);
    return null;
  }
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
    .select("id, ad_id, media_url, ad_copy, lp_url, lp_crawled_at, embedding_3072, text_embedding_3072, lp_embedding")
    .or("embedding_3072.is.null,text_embedding_3072.is.null")
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
    if (!row.embedding_3072 && row.media_url) {
      try {
        updates.embedding_3072 = await generateEmbedding(
          { imageUrl: row.media_url },
          { taskType: "SEMANTIC_SIMILARITY" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing embed failed ${row.ad_id}:`, err);
        errors++;
      }
    }

    // 텍스트 임베딩이 없으면 생성
    if (!row.text_embedding_3072 && row.ad_copy) {
      try {
        updates.text_embedding_3072 = await generateEmbedding(
          row.ad_copy,
          { taskType: "SEMANTIC_SIMILARITY" },
        );
      } catch (err) {
        console.error(`[creative-embedder] Missing text embed failed ${row.ad_id}:`, err);
        errors++;
      }
    }

    // LP 임베딩 (아직 크롤링 안 된 경우) — Railway → cheerio 폴백
    if (!row.lp_embedding && row.lp_url && !row.lp_crawled_at) {
      try {
        const railwayResult = await crawlSingle(row.lp_url);
        if (railwayResult?.screenshot) {
          updates.lp_embedding = await generateEmbedding(
            { imageUrl: `data:image/png;base64,${railwayResult.screenshot}` },
            { taskType: "SEMANTIC_SIMILARITY" },
          );
          updates.lp_headline = railwayResult.text.headline || null;
          updates.lp_price = railwayResult.text.price || null;
          updates.screenshot_hash = railwayResult.screenshotHash || null;
          updates.lp_crawled_at = new Date().toISOString();

          const screenshotUrl = await uploadScreenshot(supabase, row.ad_id, "main", railwayResult.screenshot);
          if (screenshotUrl) updates.lp_screenshot_url = screenshotUrl;
          if (railwayResult.ctaScreenshot) {
            const ctaUrl = await uploadScreenshot(supabase, row.ad_id, "cta", railwayResult.ctaScreenshot);
            if (ctaUrl) updates.lp_cta_screenshot_url = ctaUrl;
          }

          const lpText = [railwayResult.text.headline, railwayResult.text.description].filter(Boolean).join("\n");
          if (lpText.trim().length > 10) {
            updates.lp_text_embedding = await generateEmbedding(lpText, { taskType: "SEMANTIC_SIMILARITY" });
          }
        } else {
          // Railway 실패 → cheerio 폴백
          const lpData = await crawlLandingPage(row.lp_url);
          if (lpData?.ogImageUrl) {
            updates.lp_embedding = await generateEmbedding(
              { imageUrl: lpData.ogImageUrl },
              { taskType: "SEMANTIC_SIMILARITY" },
            );
            updates.lp_headline = lpData.headline || null;
            updates.lp_price = lpData.price || null;
            updates.lp_crawled_at = new Date().toISOString();

            if (lpData.text && lpData.text.trim().length > 10) {
              updates.lp_text_embedding = await generateEmbedding(lpData.text, { taskType: "SEMANTIC_SIMILARITY" });
            }
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

  // creative_media 임베딩 보충 (ad_creative_embeddings에서 복사)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cmMissing } = await (supabase as any)
      .from("creative_media")
      .select("id, creative_id")
      .is("embedding", null)
      .eq("is_active", true)
      .limit(batchSize);

    if (cmMissing && cmMissing.length > 0) {
      for (const cm of cmMissing) {
        try {
          // creative_id → creatives.ad_id 매핑
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: creative } = await (supabase as any)
            .from("creatives")
            .select("ad_id")
            .eq("id", cm.creative_id)
            .maybeSingle();

          if (!creative?.ad_id) continue;

          // ad_creative_embeddings에서 임베딩 가져오기
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ace } = await (supabase as any)
            .from("ad_creative_embeddings")
            .select("embedding_3072, text_embedding_3072")
            .eq("ad_id", creative.ad_id)
            .maybeSingle();

          if (ace?.embedding_3072) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cmUpdates: Record<string, any> = {
              embedding: ace.embedding_3072,
              embedding_model: EMBEDDING_MODEL,
              embedded_at: new Date().toISOString(),
            };
            if (ace.text_embedding_3072) {
              cmUpdates.text_embedding = ace.text_embedding_3072;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("creative_media")
              .update(cmUpdates)
              .eq("id", cm.id);

            embedded++;
          }
        } catch (err) {
          console.warn(
            `[creative-embedder] CM 보충 스킵 (creative_id: ${cm.creative_id}):`,
            err instanceof Error ? err.message : err,
          );
          errors++;
        }

        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  } catch (err) {
    console.warn(
      `[creative-embedder] CM 보충 조회 실패:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { processed: rows.length, embedded, errors };
}
