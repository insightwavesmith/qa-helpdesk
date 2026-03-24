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
import { getCreativeType } from "@/lib/protractor/creative-type";
import { extractCarouselCards } from "@/lib/protractor/carousel-cards";
import { embedCreative, embedMissingCreatives } from "@/lib/ad-creative-embedder";
import type { CreativeEmbedInput } from "@/lib/ad-creative-embedder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
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

            // 소재 유형 판별
            const adRecord = ad as Record<string, unknown>;
            const creativeType = getCreativeType(adRecord);

            if (creativeType === "CAROUSEL") {
              // CAROUSEL: 각 카드(position)별 독립 임베딩
              const cards = extractCarouselCards(adRecord);
              const cardList = cards.length > 0
                ? cards
                : [{ position: 0, imageHash: creative?.image_hash || null, imageUrl, videoId: null, lpUrl: detail?.lpUrl || null }];

              for (const card of cardList) {
                const cardImageUrl =
                  card.imageUrl ||
                  (card.imageHash ? hashToUrl.get(card.imageHash) || null : null);

                const input: CreativeEmbedInput = {
                  adId,
                  accountId: cleanId,
                  source: "own",
                  brandName: account.account_name || undefined,
                  category: undefined,
                  mediaUrl: cardImageUrl,
                  mediaType: card.videoId ? "VIDEO" : "IMAGE",
                  // 카피는 position=0 카드에만 (헤드라인은 광고 전체 카피)
                  adCopy: card.position === 0 ? (detail?.adCopy || null) : null,
                  lpUrl: card.lpUrl || detail?.lpUrl || null,
                  imageHash: card.imageHash || undefined,
                  creativeType,
                  position: card.position,
                };

                try {
                  const embedResult = await embedCreative(input);
                  if (embedResult.embeddingDone || embedResult.textEmbeddingDone) {
                    stats.newCreatives++;
                  }
                } catch (err) {
                  const msg = `ad ${adId} pos=${card.position}: ${err instanceof Error ? err.message : String(err)}`;
                  stats.errors.push(msg);
                }
              }
            } else {
              // IMAGE / VIDEO: position=0 단일 임베딩 (기존 동작 유지)
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
                creativeType,
                position: 0,
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

    // 4. content_hash 기반 임베딩 재사용 (비주얼 embedding만 — ad_copy가 달라도 이미지는 동일)
    // embedding이 없고 content_hash가 있는 row를 찾아, 동일 content_hash의 다른 row에서 복사
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: missingRows } = await (supabase as any)
        .from("creative_media")
        .select("id, content_hash, embedding, embedding_model, embedded_at")
        .is("embedding", null)
        .not("content_hash", "is", null)
        .eq("is_active", true)
        .limit(200);

      let hashReuseCount = 0;
      for (const row of (missingRows ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: donor } = await (supabase as any)
          .from("creative_media")
          .select("embedding, embedding_model, embedded_at")
          .eq("content_hash", row.content_hash)
          .not("embedding", "is", null)
          .neq("id", row.id)
          .limit(1)
          .maybeSingle();

        if (donor?.embedding) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("creative_media")
            .update({
              embedding: donor.embedding,
              embedding_model: donor.embedding_model,
              embedded_at: donor.embedded_at,
            })
            .eq("id", row.id);
          hashReuseCount++;
          console.log(`[embed-creatives] content_hash 임베딩 재사용: ${row.content_hash as string}`);
        }
      }
      if (hashReuseCount > 0) {
        console.log(`[embed-creatives] content_hash 재사용 완료: ${hashReuseCount}건`);
      }
    } catch (err) {
      console.error("[embed-creatives] content_hash 재사용 단계 실패 (무시):", err);
    }

    // 5. 임베딩 없는 기존 row 보충 (content_hash 재사용 후에도 embedding 없는 row)
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
