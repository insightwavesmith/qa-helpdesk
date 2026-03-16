/**
 * POST /api/admin/seed-creatives
 * daily_ad_insights에서 고유 ad_id 추출 → Meta API로 소재 상세 수집
 * → ad_creative_embeddings INSERT → 임베딩 생성
 * 배치: 50개씩, rate limit 대비 딜레이
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { createServiceClient } from "@/lib/supabase/server";
import {
  fetchCreativeDetails,
  fetchImageUrlsByHash,
} from "@/lib/protractor/creative-image-fetcher";
import { embedCreative } from "@/lib/ad-creative-embedder";
import type { CreativeEmbedInput } from "@/lib/ad-creative-embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN 미설정" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const stats = {
    uniqueAds: 0,
    alreadyExists: 0,
    seeded: 0,
    embedded: 0,
    errors: [] as string[],
  };

  try {
    // 1. daily_ad_insights에서 고유 ad_id + account_id 추출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insights, error: insightErr } = await (supabase as any)
      .from("daily_ad_insights")
      .select("ad_id, ad_name, account_id, creative_type")
      .not("ad_id", "is", null)
      .order("date", { ascending: false });

    if (insightErr || !insights) {
      return NextResponse.json(
        { error: "daily_ad_insights 조회 실패", detail: insightErr?.message },
        { status: 500 },
      );
    }

    // 고유 ad_id 추출 (최신 행 우선)
    const adMap = new Map<
      string,
      { ad_id: string; ad_name: string; account_id: string; creative_type: string }
    >();
    for (const row of insights) {
      if (row.ad_id && !adMap.has(row.ad_id)) {
        adMap.set(row.ad_id, row);
      }
    }

    stats.uniqueAds = adMap.size;

    // 2. 이미 ad_creative_embeddings에 있는 ad_id 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from("ad_creative_embeddings")
      .select("ad_id");

    const existingSet = new Set(
      (existing || []).map((r: { ad_id: string }) => r.ad_id),
    );

    // 새로운 ad_id만 필터
    const newAds = [...adMap.values()].filter(
      (ad) => !existingSet.has(ad.ad_id),
    );
    stats.alreadyExists = adMap.size - newAds.length;

    if (newAds.length === 0) {
      return NextResponse.json({
        message: "시드할 새 소재 없음",
        ...stats,
      });
    }

    // 3. 계정별로 그룹핑 → Meta API 호출
    const byAccount = new Map<string, typeof newAds>();
    for (const ad of newAds) {
      const acc = ad.account_id || "unknown";
      if (!byAccount.has(acc)) byAccount.set(acc, []);
      byAccount.get(acc)!.push(ad);
    }

    const BATCH_SIZE = 50;

    for (const [accountId, ads] of byAccount) {
      const cleanId = accountId.replace(/^act_/, "");

      // Meta API: 크리에이티브 상세 조회
      const adIds = ads.map((a) => a.ad_id);
      let creativeDetails = new Map<
        string,
        { imageUrl: string | null; thumbnailUrl: string | null; adCopy: string | null; lpUrl: string | null; imageHash: string | null }
      >();
      let hashToUrl = new Map<string, string>();

      try {
        creativeDetails = await fetchCreativeDetails(adIds.slice(0, 200));

        // image_hash → URL 변환
        const hashes: string[] = [];
        for (const detail of creativeDetails.values()) {
          if (detail.imageHash) hashes.push(detail.imageHash);
        }
        if (hashes.length > 0) {
          hashToUrl = await fetchImageUrlsByHash(cleanId, hashes);
        }
      } catch (err) {
        stats.errors.push(
          `Meta API for ${cleanId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 4. 배치 upsert + 임베딩
      for (let i = 0; i < ads.length; i += BATCH_SIZE) {
        const batch = ads.slice(i, i + BATCH_SIZE);

        for (const ad of batch) {
          const detail = creativeDetails.get(ad.ad_id);

          const imageUrl =
            detail?.imageUrl ||
            (detail?.imageHash ? hashToUrl.get(detail.imageHash) : null) ||
            null;

          const input: CreativeEmbedInput = {
            adId: ad.ad_id,
            accountId: cleanId,
            source: "own",
            brandName: undefined,
            category: undefined,
            mediaUrl: imageUrl,
            mediaType: ad.creative_type === "VIDEO" ? "VIDEO" : "IMAGE",
            adCopy: detail?.adCopy || null,
            lpUrl: detail?.lpUrl || null,
            creativeType: ad.creative_type || undefined,
            imageHash: detail?.imageHash || undefined,
          };

          try {
            const result = await embedCreative(input);
            stats.seeded++;
            if (result.embeddingDone || result.textEmbeddingDone) {
              stats.embedded++;
            }
            if (result.error) {
              stats.errors.push(`ad ${ad.ad_id}: ${result.error}`);
            }
          } catch (err) {
            stats.errors.push(
              `embed ${ad.ad_id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // 배치 간 딜레이
        if (i + BATCH_SIZE < ads.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // 계정 간 딜레이
      await new Promise((r) => setTimeout(r, 2000));
    }

    return NextResponse.json({
      message: "seed-creatives 완료",
      ...stats,
    });
  } catch (err) {
    console.error("[seed-creatives] Fatal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), ...stats },
      { status: 500 },
    );
  }
}
