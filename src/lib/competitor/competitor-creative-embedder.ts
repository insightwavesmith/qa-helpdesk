/**
 * T5: 경쟁사 소재 임베딩
 * SearchAPI.io에서 수집한 경쟁사 광고 → creative_media 저장
 * 기존 competitor-check 크론에서 호출
 */

import type { CompetitorAd } from "@/types/competitor";
import { embedCreative } from "@/lib/ad-creative-embedder";
import type { CreativeEmbedInput } from "@/lib/ad-creative-embedder";

interface EmbedCompetitorResult {
  total: number;
  embedded: number;
  skipped: number;
  errors: number;
}

/**
 * 경쟁사 광고 목록 → creative_media에 저장
 * source = 'competitor'
 */
export async function embedCompetitorAds(
  ads: CompetitorAd[],
  brandName: string,
  pageId: string | null,
  options?: { delayMs?: number },
): Promise<EmbedCompetitorResult> {
  const delayMs = options?.delayMs ?? 500;
  const result: EmbedCompetitorResult = {
    total: ads.length,
    embedded: 0,
    skipped: 0,
    errors: 0,
  };

  for (const ad of ads) {
    // 이미지/비디오 URL이 없으면 스킵
    const mediaUrl = ad.imageUrl || ad.videoPreviewUrl;
    if (!mediaUrl && !ad.body) {
      result.skipped++;
      continue;
    }

    const input: CreativeEmbedInput = {
      adId: ad.id, // ad_archive_id
      accountId: pageId || "",
      source: "competitor",
      brandName,
      mediaUrl,
      mediaType: ad.displayFormat === "VIDEO" ? "VIDEO"
        : ad.displayFormat === "CAROUSEL" ? "CAROUSEL"
        : "IMAGE",
      adCopy: ad.body || null,
      lpUrl: ad.linkUrl || null,
      creativeType: ad.displayFormat || undefined,
    };

    try {
      const embedResult = await embedCreative(input);
      if (embedResult.embeddingDone || embedResult.textEmbeddingDone) {
        result.embedded++;
      } else if (embedResult.error) {
        result.errors++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      console.error(`[competitor-embedder] Failed for ad ${ad.id}:`, err);
      result.errors++;
    }

    // 딜레이
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return result;
}
