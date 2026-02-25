import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";

// ── 타입 ────────────────────────────────────────────────────────
interface OverlapPair {
  adset_a_name: string;
  adset_b_name: string;
  campaign_a: string;
  campaign_b: string;
  overlap_rate: number;
}

interface OverlapResponse {
  overall_rate: number;
  total_unique: number;
  individual_sum: number;
  cached_at: string;
  pairs: OverlapPair[];
}

interface AdsetInfo {
  id: string;
  name: string;
  campaignName: string;
}

// ── 헬퍼: Meta Graph API 호출 ───────────────────────────────────
const META_API = "https://graph.facebook.com/v21.0";

function getToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");
  return token;
}

async function metaGet(path: string, params: Record<string, string>) {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set("access_token", getToken());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta API: ${data.error.message ?? "Unknown error"}`);
  }
  return data;
}

// ── 활성 OUTCOME_SALES 캠페인의 광고세트 목록 ──────────────────
async function fetchActiveAdsets(accountId: string): Promise<AdsetInfo[]> {
  // 1) 활성 캠페인 (OUTCOME_SALES)
  const campaignsData = await metaGet(`act_${accountId}/campaigns`, {
    effective_status: '["ACTIVE"]',
    fields: "id,name,objective",
    limit: "100",
  });

  const salesCampaigns = (
    (campaignsData.data ?? []) as {
      id: string;
      name: string;
      objective: string;
    }[]
  ).filter((c) => c.objective === "OUTCOME_SALES");

  if (salesCampaigns.length === 0) return [];

  // 2) 각 캠페인의 활성 광고세트
  const adsets: AdsetInfo[] = [];
  for (const campaign of salesCampaigns) {
    const adsetsData = await metaGet(`${campaign.id}/adsets`, {
      effective_status: '["ACTIVE"]',
      fields: "id,name",
      limit: "100",
    });
    for (const adset of (adsetsData.data ?? []) as {
      id: string;
      name: string;
    }[]) {
      adsets.push({
        id: adset.id,
        name: adset.name,
        campaignName: campaign.name,
      });
    }
  }

  return adsets;
}

// ── 조합 reach 조회 (Meta Insights API) ─────────────────────────
async function fetchCombinedReach(
  accountId: string,
  adsetIds: string[],
  dateStart: string,
  dateEnd: string
): Promise<number> {
  const filtering = JSON.stringify([
    {
      field: "adset.id",
      operator: "IN",
      value: adsetIds,
    },
  ]);

  const data = await metaGet(`act_${accountId}/insights`, {
    filtering,
    fields: "reach",
    time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
    level: "account",
  });

  const rows = (data.data ?? []) as { reach?: string }[];
  return rows.length > 0 ? parseInt(rows[0].reach ?? "0", 10) : 0;
}

// ── 날짜 차이 계산 ──────────────────────────────────────────────
function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// ── adset_pair 키 생성 (항상 정렬) ──────────────────────────────
function makePairKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}

// ── 캐시 TTL: 24시간 ───────────────────────────────────────────
const CACHE_TTL_HOURS = 24;

// ── GET /api/protractor/overlap ─────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { user, profile, svc } = auth;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");
    const dateStart = searchParams.get("date_start");
    const dateEnd = searchParams.get("date_end");
    const force = searchParams.get("force") === "true";

    // 파라미터 검증
    if (!accountId || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: "account_id, date_start, date_end는 필수입니다." },
        { status: 400 }
      );
    }

    // 기간 7일 미만 체크
    if (daysBetween(dateStart, dateEnd) < 7) {
      return NextResponse.json(
        { error: "7일 이상 기간을 선택해주세요." },
        { status: 400 }
      );
    }

    // 계정 소유권 확인
    const hasAccess = await verifyAccountOwnership(
      svc,
      user.id,
      profile.role,
      accountId
    );
    if (!hasAccess) {
      return NextResponse.json(
        { error: "해당 계정에 대한 접근 권한이 없습니다." },
        { status: 403 }
      );
    }

    // ── 캐시 확인 ─────────────────────────────────────────────
    if (!force) {
      const ttlCutoff = new Date();
      ttlCutoff.setHours(ttlCutoff.getHours() - CACHE_TTL_HOURS);

      const { data: cachedRows } = await svc
        .from("adset_overlap_cache" as never)
        .select("adset_pair, overlap_data, cached_at")
        .eq("account_id", accountId)
        .eq("period_start", dateStart)
        .eq("period_end", dateEnd)
        .gte("cached_at", ttlCutoff.toISOString());

      if (cachedRows && cachedRows.length > 0) {
        return buildResponseFromCache(
          cachedRows as {
            adset_pair: string;
            overlap_data: Record<string, unknown>;
            cached_at: string;
          }[]
        );
      }
    }

    // ── 캐시 MISS: Meta API + 계산 ───────────────────────────
    // 1) 활성 광고세트 목록
    const adsets = await fetchActiveAdsets(accountId);
    if (adsets.length === 0) {
      return NextResponse.json(
        { error: "활성 캠페인이 없습니다." },
        { status: 404 }
      );
    }

    // 2) 개별 reach — DB에서 조회 (rate limit 대응)
    const { data: reachRows } = await svc
      .from("daily_ad_insights")
      .select("adset_id, reach")
      .eq("account_id", accountId)
      .gte("date", dateStart)
      .lte("date", dateEnd)
      .in(
        "adset_id",
        adsets.map((a) => a.id)
      );

    const reachByAdset: Record<string, number> = {};
    for (const row of (reachRows ?? []) as {
      adset_id: string;
      reach: number | null;
    }[]) {
      if (!row.adset_id) continue;
      reachByAdset[row.adset_id] =
        (reachByAdset[row.adset_id] ?? 0) + (row.reach ?? 0);
    }

    // reach가 0인 adset 제외
    const activeAdsets = adsets.filter((a) => (reachByAdset[a.id] ?? 0) > 0);
    if (activeAdsets.length === 0) {
      return NextResponse.json(
        {
          overall_rate: 0,
          total_unique: 0,
          individual_sum: 0,
          cached_at: new Date().toISOString(),
          pairs: [],
        } satisfies OverlapResponse,
        { status: 200 }
      );
    }

    const individualSum = activeAdsets.reduce(
      (sum, a) => sum + (reachByAdset[a.id] ?? 0),
      0
    );

    // 3) 전체 합산 unique reach (Meta API 1회)
    const totalUnique = await fetchCombinedReach(
      accountId,
      activeAdsets.map((a) => a.id),
      dateStart,
      dateEnd
    );

    const overallRate =
      individualSum > 0
        ? Math.max(0, ((individualSum - totalUnique) / individualSum) * 100)
        : 0;

    // 4) pair별 overlap (Meta API — 조합 수만큼 호출)
    const pairs: OverlapPair[] = [];
    const now = new Date().toISOString();

    // 조합 수가 많으면 상위 reach adset만 처리 (최대 15개 → 105조합)
    const sortedAdsets = [...activeAdsets].sort(
      (a, b) => (reachByAdset[b.id] ?? 0) - (reachByAdset[a.id] ?? 0)
    );
    const cappedAdsets = sortedAdsets.slice(0, 15);

    for (let i = 0; i < cappedAdsets.length; i++) {
      for (let j = i + 1; j < cappedAdsets.length; j++) {
        const a = cappedAdsets[i];
        const b = cappedAdsets[j];
        const reachA = reachByAdset[a.id] ?? 0;
        const reachB = reachByAdset[b.id] ?? 0;
        const pairSum = reachA + reachB;

        if (pairSum === 0) continue;

        try {
          const combinedUnique = await fetchCombinedReach(
            accountId,
            [a.id, b.id],
            dateStart,
            dateEnd
          );
          const pairOverlap = Math.max(
            0,
            ((pairSum - combinedUnique) / pairSum) * 100
          );

          pairs.push({
            adset_a_name: a.name,
            adset_b_name: b.name,
            campaign_a: a.campaignName,
            campaign_b: b.campaignName,
            overlap_rate: Math.round(pairOverlap * 10) / 10,
          });

          // pair별 캐시 저장
          await svc.from("adset_overlap_cache" as never).upsert(
            {
              account_id: accountId,
              adset_pair: makePairKey(a.id, b.id),
              period_start: dateStart,
              period_end: dateEnd,
              overlap_data: {
                overlap_rate: Math.round(pairOverlap * 10) / 10,
                reach_a: reachA,
                reach_b: reachB,
                combined_unique: combinedUnique,
                adset_a_name: a.name,
                adset_b_name: b.name,
                campaign_a: a.campaignName,
                campaign_b: b.campaignName,
              },
              cached_at: now,
            } as never,
            { onConflict: "account_id,adset_pair,period_start,period_end" }
          );
        } catch {
          // 개별 pair 실패 시 건너뛰기 (rate limit 등)
          continue;
        }
      }
    }

    // 전체 결과 캐시 저장
    await svc.from("adset_overlap_cache" as never).upsert(
      {
        account_id: accountId,
        adset_pair: "__overall__",
        period_start: dateStart,
        period_end: dateEnd,
        overlap_data: {
          overall_rate: Math.round(overallRate * 10) / 10,
          total_unique: totalUnique,
          individual_sum: individualSum,
        },
        cached_at: now,
      } as never,
      { onConflict: "account_id,adset_pair,period_start,period_end" }
    );

    // overlap_rate 내림차순 정렬
    pairs.sort((a, b) => b.overlap_rate - a.overlap_rate);

    const response: OverlapResponse = {
      overall_rate: Math.round(overallRate * 10) / 10,
      total_unique: totalUnique,
      individual_sum: individualSum,
      cached_at: now,
      pairs,
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("overlap API error:", e);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ── 캐시에서 응답 조립 ──────────────────────────────────────────
function buildResponseFromCache(
  rows: {
    adset_pair: string;
    overlap_data: Record<string, unknown>;
    cached_at: string;
  }[]
): NextResponse {
  const overallRow = rows.find((r) => r.adset_pair === "__overall__");
  const pairRows = rows.filter((r) => r.adset_pair !== "__overall__");

  const pairs: OverlapPair[] = pairRows
    .map((r) => ({
      adset_a_name: (r.overlap_data.adset_a_name as string) ?? "",
      adset_b_name: (r.overlap_data.adset_b_name as string) ?? "",
      campaign_a: (r.overlap_data.campaign_a as string) ?? "",
      campaign_b: (r.overlap_data.campaign_b as string) ?? "",
      overlap_rate: (r.overlap_data.overlap_rate as number) ?? 0,
    }))
    .sort((a, b) => b.overlap_rate - a.overlap_rate);

  const response: OverlapResponse = {
    overall_rate: (overallRow?.overlap_data.overall_rate as number) ?? 0,
    total_unique: (overallRow?.overlap_data.total_unique as number) ?? 0,
    individual_sum: (overallRow?.overlap_data.individual_sum as number) ?? 0,
    cached_at: overallRow?.cached_at ?? rows[0]?.cached_at ?? "",
    pairs,
  };

  return NextResponse.json(response);
}
