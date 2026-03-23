/**
 * ═══════════════════════════════════════════════════════════════
 * embed-creatives — 분석 강화 (Gemini 임베딩 + 5축 분석 트리거)
 * ═══════════════════════════════════════════════════════════════
 *
 * 역할: collect-daily가 수집한 원시 소재 데이터에 AI 분석을 적용하는
 *       분석/강화 파이프라인.
 *
 * 소유 테이블 (이 크론이 UPSERT/갱신하는 테이블):
 *   - creative_media : 임베딩 벡터 생성 (embedding vector(3072))
 *
 * 동작 순서:
 *   1. ad_accounts에서 active 계정 조회
 *   2. 각 계정의 ACTIVE 광고 조회 (Meta API)
 *   3. 소재 이미지 URL + 카피 + LP URL 수집
 *   4. creative_media에 upsert (creatives FK 기반)
 *   5. 임베딩 없는 row만 Gemini 임베딩 실행
 *
 * collect-daily와의 역할 분리:
 *   - collect-daily : 원시 데이터 수집 (Meta API → DB). "무엇이 있는가?"
 *   - embed-creatives : 분석 강화 (Gemini → 임베딩/분석). "이것이 어떤 소재인가?"
 *
 * 배치 처리: 50개씩, 500ms 딜레이
 * Vercel Cron: 매일 1회
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAccountAds } from "@/lib/protractor/meta-collector";
import {
  fetchCreativeDetails,
  fetchImageUrlsByHash,
  extractImageHashes,
} from "@/lib/protractor/creative-image-fetcher";
import { embedCreative, embedMissingCreatives } from "@/lib/ad-creative-embedder";
import type { CreativeEmbedInput } from "@/lib/ad-creative-embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // 개발환경
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN 미설정", collected: 0, embedded: 0 },
      { status: 200 },
    );
  }

  const supabase = createServiceClient();
  const stats = {
    accounts: 0,
    adsCollected: 0,
    newCreatives: 0,
    embeddingResults: { processed: 0, embedded: 0, errors: 0 },
    errors: [] as string[],
  };

  const { searchParams } = new URL(req.url);
  const accountFilter = searchParams.get("account_id");

  try {
    // 1. active 광고 계정 조회
    let accountQuery = supabase
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true);
    if (accountFilter) accountQuery = accountQuery.eq("account_id", accountFilter);
    const { data: adAccounts, error: accountErr } = await accountQuery;

    if (accountErr || !adAccounts || adAccounts.length === 0) {
      return NextResponse.json({
        message: "활성 계정 없음",
        ...stats,
      });
    }

    stats.accounts = adAccounts.length;

    // 2. 각 계정의 ACTIVE 광고 수집
    for (const account of adAccounts) {
      const cleanId = account.account_id.replace(/^act_/, "");

      try {
        // Meta API에서 ACTIVE 광고 조회
        const ads = await fetchAccountAds(cleanId);
        if (ads.length === 0) continue;

        stats.adsCollected += ads.length;

        // image_hash → 이미지 URL 매핑
        const imageHashes = extractImageHashes(ads);
        const hashToUrl = imageHashes.length > 0
          ? await fetchImageUrlsByHash(cleanId, imageHashes)
          : new Map<string, string>();

        // 각 광고의 상세 크리에이티브 정보 조회
        const adIds = ads
          .map((ad) => ((ad.ad_id ?? ad.id) as string))
          .filter(Boolean);
        const creativeDetails = adIds.length > 0
          ? await fetchCreativeDetails(adIds)
          : new Map();

        // 3. creative_media에 upsert (via embedCreative)
        const BATCH_SIZE = 50;
        for (let i = 0; i < ads.length; i += BATCH_SIZE) {
          const batch = ads.slice(i, i + BATCH_SIZE);

          for (const ad of batch) {
            const adId = ((ad.ad_id ?? ad.id) as string) || "";
            if (!adId) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const creative = (ad as any).creative;
            const detail = creativeDetails.get(adId);

            // 이미지 URL: detail → hashToUrl → null
            const imageUrl =
              detail?.imageUrl ||
              (creative?.image_hash ? hashToUrl.get(creative.image_hash) : null) ||
              null;

            const input: CreativeEmbedInput = {
              adId,
              accountId: cleanId,
              source: "own",
              brandName: account.account_name || undefined,
              category: undefined,
              mediaUrl: imageUrl,
              mediaType: creative?.video_id ? "VIDEO" : "IMAGE",
              adCopy: detail?.adCopy || null,
              lpUrl: detail?.lpUrl || null,
              imageHash: creative?.image_hash || undefined,
            };

            try {
              const embedResult = await embedCreative(input);
              if (embedResult.embeddingDone || embedResult.textEmbeddingDone) {
                stats.newCreatives++;
              }
            } catch (err) {
              const msg = `ad ${adId}: ${err instanceof Error ? err.message : String(err)}`;
              stats.errors.push(msg);
            }
          }

          // 배치 간 딜레이
          if (i + BATCH_SIZE < ads.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        // 계정 간 딜레이
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        const msg = `account ${cleanId}: ${err instanceof Error ? err.message : String(err)}`;
        stats.errors.push(msg);
        console.error(`[embed-creatives] ${msg}`);
      }
    }

    // 4. 임베딩 없는 기존 row 보충
    try {
      stats.embeddingResults = await embedMissingCreatives(50, 500);
    } catch (err) {
      console.error("[embed-creatives] Missing embed phase failed:", err);
    }

    return NextResponse.json({
      message: "embed-creatives completed",
      ...stats,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[embed-creatives] Fatal error:", err);
    return NextResponse.json(
      { error: errorMessage, ...stats },
      { status: 500 },
    );
  }
}
