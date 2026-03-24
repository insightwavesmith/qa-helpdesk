/**
 * ═══════════════════════════════════════════════════════════════
 * collect-daily — 원시 데이터 수집 (Meta API → DB)
 * ═══════════════════════════════════════════════════════════════
 *
 * 역할: Meta 광고 API에서 일일 성과 데이터를 수집하여 DB에 저장하는
 *       데이터 수집 파이프라인의 진입점.
 *
 * 소유 테이블 (이 크론이 UPSERT 하는 테이블):
 *   - daily_ad_insights   : 일별 광고 성과 지표 (spend, impressions, clicks, ROAS 등)
 *   - creatives           : 소재 마스터 (ad_id, creative_type, lp_id 등)
 *   - creative_media      : 소재 미디어 메타데이터 (media_url은 process-media가 채움)
 *   - landing_pages       : LP 정규화 테이블 (canonical_url, domain, page_type)
 *
 * 하지 않는 것:
 *   - 미디어 파일 다운로드 (→ process-media가 담당)
 *   - 임베딩 벡터 생성 (→ embed-creatives가 담당)
 *   - 5축 분석 실행 (→ embed-creatives가 트리거)
 *   - 벤치마크 계산 (→ collect-benchmarks가 담당)
 *
 * Vercel Cron: 매일 4회 배치 실행 (batch 1~4)
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import {
  normalizeRanking, extractLpUrl,
  calculateMetrics,
  checkMetaPermission, fetchAccountAds,
} from "@/lib/collect-daily-utils";
import { getCreativeType } from "@/lib/protractor/creative-type";
import { extractCarouselCards } from "@/lib/protractor/carousel-cards";
import { normalizeUrl, classifyUrl } from "@/lib/lp-normalizer";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── 수집 결과 타입 ──────────────────────────────────────────
export interface CollectDailyResult {
  message: string;
  date: string;
  accounts: number;
  results: Record<string, unknown>[];
}

// ── 핵심 수집 로직 (크론 + 수동수집 공용) ───────────────────
export async function runCollectDaily(dateParam?: string, batch?: number, accountId?: string): Promise<CollectDailyResult> {
  const svc = createServiceClient();
  // 배치 번호가 있으면 cron_runs에 배치 이름으로 기록
  const cronName = batch ? `collect-daily-${batch}` : "collect-daily";
  const cronRunId = await startCronRun(cronName);

  // KST(UTC+9) 기준 어제 날짜
  const yesterday = dateParam ?? (() => {
    const now = new Date(Date.now() + 9 * 3600_000); // UTC → KST
    now.setDate(now.getDate() - 1); // 어제
    return now.toISOString().slice(0, 10);
  })();

  let hasPartialError = false;

  try {
    // 1. Supabase ad_accounts 테이블에서 등록된 활성 계정만 조회
    // created_at 정렬로 배치 분할 시 일관된 순서 보장
    const { data: adAccountRows, error: adAccountsErr } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .order("created_at");

    if (adAccountsErr) {
      throw new Error(`ad_accounts 조회 실패: ${adAccountsErr.message}`);
    }
    if (!adAccountRows || adAccountRows.length === 0) {
      return { message: "등록된 활성 계정 없음", date: yesterday, accounts: 0, results: [] };
    }

    const accounts = adAccountRows.map((a) => ({
      account_id: a.account_id.replace(/^act_/, ""),
      account_name: a.account_name ?? "",
    }));

    // 단일 계정 필터 (테스트/디버깅용)
    let filteredAccounts = accounts;
    if (accountId) {
      filteredAccounts = accounts.filter((a) => a.account_id === accountId);
      console.log(`[collect-daily] account filter: ${accountId} → ${filteredAccounts.length}건`);
    } else if (batch != null && batch >= 1 && batch <= 4) {
      const BATCH_SIZE = 10;
      const offset = (batch - 1) * BATCH_SIZE;
      if (batch === 4) {
        // batch 4는 나머지 전부
        filteredAccounts = accounts.slice(offset);
      } else {
        filteredAccounts = accounts.slice(offset, offset + BATCH_SIZE);
      }
      console.log(`[collect-daily] batch ${batch}: ${filteredAccounts.length}건 (전체 ${accounts.length}건 중 offset=${offset})`);
    }

    // ── Meta API 권한 사전 체크 ──
    // 각 계정에 대해 API 접근 가능 여부를 미리 확인하고,
    // 권한 없는 계정은 ad_accounts.meta_status='permission_denied'로 마킹 후 스킵
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN not set");

    const permittedAccounts: typeof filteredAccounts = [];
    const deniedIds: string[] = [];

    for (const account of filteredAccounts) {
      // 숫자 ID가 아닌 더미 계정 스킵
      if (!/^\d+$/.test(account.account_id)) {
        console.log(`[collect-daily] 잘못된 account_id 스킵: ${account.account_id}`);
        deniedIds.push(account.account_id);
        continue;
      }

      const perm = await checkMetaPermission(account.account_id, token);
      if (perm.ok) {
        permittedAccounts.push(account);
      } else {
        console.log(`[collect-daily] 권한 없음 스킵: ${account.account_id} (${account.account_name}) — ${perm.error}`);
        deniedIds.push(account.account_id);
      }
    }

    // 권한 없는 계정 일괄 마킹
    if (deniedIds.length > 0) {
      await svc
        .from("ad_accounts")
        .update({ meta_status: "permission_denied", updated_at: new Date().toISOString() })
        .in("account_id", deniedIds);
      console.log(`[collect-daily] ${deniedIds.length}개 계정 permission_denied 마킹`);
    }

    // 권한 있는 계정 중 이전에 denied였던 것은 상태 복구
    const permittedIds = permittedAccounts.map((a) => a.account_id);
    if (permittedIds.length > 0) {
      await svc
        .from("ad_accounts")
        .update({ meta_status: "ok", updated_at: new Date().toISOString() })
        .in("account_id", permittedIds)
        .eq("meta_status", "permission_denied");
    }

    console.log(`[collect-daily] 권한 체크 완료: ${permittedAccounts.length}개 허용, ${deniedIds.length}개 거부`);

    const results: Record<string, unknown>[] = [];

    for (const account of permittedAccounts) {
      const accountResult: Record<string, unknown> = {
        account_id: account.account_id,
        meta_ads: 0,
      };

      // ── Meta 광고 데이터 수집 (GCP 방식) ──
      try {
        const ads = await fetchAccountAds(account.account_id, dateParam ?? undefined);

        if (ads.length > 0) {
          console.log(`[collect-daily] Sample ad keys [${account.account_id}]:`, Object.keys(ads[0]));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = ads.map((ad: any) => {
            const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
            const metrics = calculateMetrics(insight);
            const creativeType = getCreativeType(ad);

            return {
              date: yesterday,
              account_id: account.account_id,
              account_name: account.account_name,
              campaign_id: ad.campaign_id ?? null,
              campaign_name: ad.campaign_name ?? null,
              adset_id: ad.adset_id ?? null,
              adset_name: ad.adset_name ?? null,
              ad_id: (ad.ad_id ?? ad.id) as string | null,
              ad_name: (ad.ad_name ?? ad.name) as string | null,
              creative_type: creativeType,
              quality_ranking: normalizeRanking(insight.quality_ranking as string),
              engagement_ranking: normalizeRanking(insight.engagement_rate_ranking as string),
              conversion_ranking: normalizeRanking(insight.conversion_rate_ranking as string),
              ...metrics,
              collected_at: new Date().toISOString(),
              // raw JSONB — Meta API 응답 원본 저장
              raw_insight: insight,
              raw_ad: { id: ad.id, name: ad.name, creative: ad.creative, campaign_id: ad.campaign_id, campaign_name: ad.campaign_name, adset_id: ad.adset_id, adset_name: ad.adset_name },
            };
          });

          const { error: insertErr } = await svc
            .from("daily_ad_insights")
            .upsert(rows as never[], { onConflict: "account_id,date,ad_id" });

          if (insertErr) {
            console.error(
              `daily_ad_insights insert error [${account.account_id}]:`,
              insertErr
            );
          } else {
            accountResult.meta_ads = rows.length;
          }

          // ── 정규화 테이블 UPSERT (landing_pages → creatives → creative_media) ──
          try {
            // Step 1: LP URL 수집 + 정규화 + landing_pages UPSERT
            const lpUrlMap = new Map<string, { canonical: string; hostname: string; account_id: string }>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ad of ads as any[]) {
              const rawLpUrl = extractLpUrl(ad);
              if (!rawLpUrl) continue;
              const norm = normalizeUrl(rawLpUrl);
              if (!norm) continue;
              lpUrlMap.set(norm.canonical, { ...norm, account_id: account.account_id });
            }

            let canonicalToLpId = new Map<string, string>();

            if (lpUrlMap.size > 0) {
              const lpRows = Array.from(lpUrlMap.values()).map((lp) => {
                const { page_type, platform } = classifyUrl(lp.canonical, lp.hostname);
                return {
                  account_id: lp.account_id,
                  canonical_url: lp.canonical,
                  domain: lp.hostname,
                  page_type,
                  platform,
                  is_active: true,
                  updated_at: new Date().toISOString(),
                };
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: lpErr } = await (svc as any)
                .from("landing_pages")
                .upsert(lpRows, { onConflict: "canonical_url" });
              if (lpErr) {
                console.error(`[collect-daily] v2 landing_pages upsert error [${account.account_id}]:`, lpErr);
              } else {
                console.log(`[collect-daily] v2 landing_pages: ${lpRows.length}건 upserted`);
              }

              // canonical_url → lp_id 매핑 조회
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: lpIdData } = await (svc as any)
                .from("landing_pages")
                .select("id, canonical_url")
                .in("canonical_url", Array.from(lpUrlMap.keys()));

              canonicalToLpId = new Map<string, string>(
                (lpIdData ?? []).map((lp: { canonical_url: string; id: string }) => [lp.canonical_url, lp.id])
              );
            }

            // Step 2: creatives UPSERT (lp_id FK 포함, LP 없으면 null)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v2CreativeRows = (ads as any[]).map((ad: any) => {
              const adId = (ad.ad_id ?? ad.id) as string;
              if (!adId) return null;
              const creativeType = getCreativeType(ad);
              const rawLpUrl = extractLpUrl(ad);
              let lpId: string | null = null;
              if (rawLpUrl) {
                const norm = normalizeUrl(rawLpUrl);
                if (norm) lpId = canonicalToLpId.get(norm.canonical) ?? null;
              }
              return {
                ad_id: adId,
                account_id: account.account_id,
                creative_type: creativeType,
                source: "member",
                is_member: true,
                brand_name: account.account_name || null,
                is_active: true,
                lp_url: rawLpUrl || null,
                lp_id: lpId,
                updated_at: new Date().toISOString(),
                raw_creative: ad.creative || null,
              };
            }).filter(Boolean);

            if (v2CreativeRows.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: v2CreativeErr } = await (svc as any)
                .from("creatives")
                .upsert(v2CreativeRows, { onConflict: "ad_id" });
              if (v2CreativeErr) {
                console.error(`[collect-daily] v2 creatives upsert error [${account.account_id}]:`, v2CreativeErr);
              } else {
                console.log(`[collect-daily] v2 creatives: ${v2CreativeRows.length}건 upserted`);
              }
            }

            // Step 3: creative_media UPSERT
            if (v2CreativeRows.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const adIds = v2CreativeRows.map((r: any) => r.ad_id as string);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: creativeIdData } = await (svc as any)
                .from("creatives")
                .select("id, ad_id")
                .in("ad_id", adIds);

              const adIdToCreativeId = new Map<string, string>(
                (creativeIdData ?? []).map((c: { ad_id: string; id: string }) => [c.ad_id, c.id])
              );

              // 기존 creative_media에서 storage_url 조회 (이미 다운로드된 미디어 보존)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: existingMedia } = await (svc as any)
                .from("creative_media")
                .select("creative_id, position, storage_url, media_url")
                .in("creative_id", Array.from(adIdToCreativeId.values()));
              const existingMap = new Map<string, { storage_url: string | null; media_url: string | null }>(
                (existingMedia ?? []).map((r: any) => [`${r.creative_id}_${r.position ?? 0}`, { storage_url: r.storage_url, media_url: r.media_url }])
              );

              const mediaRows: Record<string, unknown>[] = [];
              for (const ad of ads as any[]) {
                const adId = (ad.ad_id ?? ad.id) as string;
                const creativeId = adIdToCreativeId.get(adId);
                if (!creativeId) continue;

                const creative = ad.creative;
                const creativeType = getCreativeType(ad as any);

                if (creativeType === "CAROUSEL") {
                  const cards = extractCarouselCards(ad as Record<string, unknown>);
                  if (cards.length > 0) {
                    for (const card of cards) {
                      const key = `${creativeId}_${card.position}`;
                      const existing = existingMap.get(key);
                      mediaRows.push({
                        creative_id: creativeId,
                        media_type: card.videoId ? "VIDEO" : "IMAGE",
                        media_url: existing?.media_url || card.imageUrl || null,
                        media_hash: card.imageHash || null,
                        storage_url: existing?.storage_url || null,
                        raw_creative: creative || null,
                        position: card.position,
                        card_total: cards.length,
                      });
                    }
                  } else {
                    const imageHash = creative?.image_hash;
                    const videoId = creative?.video_id;
                    const key = `${creativeId}_0`;
                    const existing = existingMap.get(key);
                    mediaRows.push({
                      creative_id: creativeId,
                      media_type: videoId ? "VIDEO" : "IMAGE",
                      media_url: existing?.media_url || null,
                      media_hash: imageHash || null,
                      storage_url: existing?.storage_url || null,
                      raw_creative: creative || null,
                      position: 0,
                      card_total: 1,
                    });
                  }
                } else {
                  const imageHash = creative?.image_hash;
                  const videoId = creative?.video_id;
                  const key = `${creativeId}_0`;
                  const existing = existingMap.get(key);
                  mediaRows.push({
                    creative_id: creativeId,
                    media_type: videoId ? "VIDEO" : "IMAGE",
                    media_url: existing?.media_url || null,
                    media_hash: imageHash || null,
                    storage_url: existing?.storage_url || null,
                    raw_creative: creative || null,
                    position: 0,
                    card_total: 1,
                  });
                }
              }

              if (mediaRows.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: mediaErr } = await (svc as any)
                  .from("creative_media")
                  .upsert(mediaRows, { onConflict: "creative_id,position" });
                if (mediaErr) {
                  console.error(`[collect-daily] creative_media upsert error [${account.account_id}]:`, mediaErr);
                } else {
                  console.log(`[collect-daily] creative_media: ${mediaRows.length}건 upserted`);
                }
              }
            }
          } catch (v2Err) {
            console.error(`[collect-daily] v2 UPSERT 실패 (기존 로직 영향 없음) [${account.account_id}]:`, v2Err);
          }
        }
      } catch (e) {
        accountResult.meta_error = e instanceof Error ? e.message : String(e);
        console.error(`Meta error [${account.account_id}]:`, e);
        hasPartialError = true;
      }

      results.push(accountResult);
    }

    const totalRecords = results.reduce((sum, r) => sum + (typeof r.meta_ads === "number" ? r.meta_ads : 0), 0);

    await completeCronRun(
      cronRunId,
      hasPartialError ? "partial" : "success",
      totalRecords,
      hasPartialError ? "일부 계정 실패" : undefined
    );

    return {
      message: "collect-daily completed",
      date: yesterday,
      accounts: filteredAccounts.length,
      results,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? (e as { message: string }).message : "Unknown error";
    console.error("collect-daily fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    throw new Error(errorMessage);
  }
}

// ── GET /api/cron/collect-daily ──────────────────────────────
// Vercel Cron: 매일 18:00 UTC (KST 다음날 03:00)
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? undefined;
  // 수동 호출 시 batch 파라미터로 특정 배치만 실행 가능 (예: ?batch=2)
  const batchParam = searchParams.get("batch");
  const batch = batchParam ? parseInt(batchParam, 10) : undefined;

  try {
    const result = await runCollectDaily(dateParam, batch);
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
