import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";
import {
  fetchActiveAdsets,
  fetchCombinedReach,
  makePairKey,
  type OverlapPair,
} from "@/lib/protractor/overlap-utils";

export const maxDuration = 300;

// ── 타입 ────────────────────────────────────────────────────────
// OverlapPair는 overlap-utils.ts에서 re-export
export type { OverlapPair };

interface OverlapResponse {
  overall_rate: number;
  total_unique: number;
  individual_sum: number;
  cached_at: string;
  pairs: OverlapPair[];
  truncated?: boolean;
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

    // ── DB 조회 우선 ──────────────────────────────────────────
    if (!force) {
      const { data: dbData } = await svc
        .from("daily_overlap_insights" as never)
        .select("*")
        .eq("account_id", accountId)
        .gte("date", dateStart)
        .lte("date", dateEnd)
        .order("date", { ascending: false })
        .limit(1);

      if (dbData && (dbData as Record<string, unknown>[]).length > 0) {
        const row = (dbData as Record<string, unknown>[])[0];
        return NextResponse.json({
          overall_rate: Number(row.overall_rate) || 0,
          total_unique: Number(row.total_unique_reach) || 0,
          individual_sum: Number(row.individual_sum) || 0,
          cached_at: (row.collected_at as string) || new Date().toISOString(),
          pairs: (row.pairs || []) as OverlapPair[],
        } satisfies OverlapResponse);
      }

      // DB에 없으면 기존 adset_overlap_cache 확인
      const ttlCutoff = new Date();
      ttlCutoff.setHours(ttlCutoff.getHours() - CACHE_TTL_HOURS);

      const { data: cachedRows } = await svc
        .from("adset_overlap_cache" as never)
        .select("adset_pair, overlap_data, cached_at")
        .eq("account_id", accountId)
        .eq("period_start", dateStart)
        .eq("period_end", dateEnd)
        .gte("cached_at", ttlCutoff.toISOString());

      if (cachedRows && (cachedRows as unknown[]).length > 0) {
        return buildResponseFromCache(
          cachedRows as {
            adset_pair: string;
            overlap_data: Record<string, unknown>;
            cached_at: string;
          }[]
        );
      }
    }

    // ── 폴백: DB에 데이터 없을 때 Meta API + 계산 ────────────
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
    let totalUnique: number;
    try {
      totalUnique = await fetchCombinedReach(
        accountId,
        activeAdsets.map((a) => a.id),
        dateStart,
        dateEnd
      );
    } catch {
      // 전체 reach 조회 실패 시 개별합으로 대체 (중복률 0%)
      totalUnique = individualSum;
    }

    const overallRate =
      individualSum > 0
        ? Math.max(0, ((individualSum - totalUnique) / individualSum) * 100)
        : 0;

    // 4) pair별 overlap (Meta API — 조합 수만큼 호출)
    const pairs: OverlapPair[] = [];
    const now = new Date().toISOString();

    // 조합 수가 많으면 상위 reach adset만 처리 (최대 8개 → 28조합)
    const sortedAdsets = [...activeAdsets].sort(
      (a, b) => (reachByAdset[b.id] ?? 0) - (reachByAdset[a.id] ?? 0)
    );
    const cappedAdsets = sortedAdsets.slice(0, 8);
    const adsetsTruncated = activeAdsets.length > 8;

    const startTime = Date.now();
    let deadlineHit = false;
    for (let i = 0; i < cappedAdsets.length && !deadlineHit; i++) {
      for (let j = i + 1; j < cappedAdsets.length; j++) {
        if (Date.now() - startTime > 55_000) {
          deadlineHit = true;
          break;
        }
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

    // 전체 결과 캐시 저장 (실패해도 응답에 영향 없음)
    try {
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
    } catch {
      // 캐시 저장 실패는 무시 (테이블 미존재 등)
    }

    // overlap_rate 내림차순 정렬
    pairs.sort((a, b) => b.overlap_rate - a.overlap_rate);

    const truncated = adsetsTruncated || deadlineHit;
    const response: OverlapResponse = {
      overall_rate: Math.round(overallRate * 10) / 10,
      total_unique: totalUnique,
      individual_sum: individualSum,
      cached_at: now,
      pairs,
      ...(truncated ? { truncated: true } : {}),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("overlap API error:", e);
    const msg = (e as Error).message || "";

    // Meta API 토큰 미설정
    if (msg.includes("META_ACCESS_TOKEN")) {
      return NextResponse.json(
        { error: "Meta API 연결이 설정되지 않았습니다. 관리자에게 문의하세요." },
        { status: 503 }
      );
    }

    // Meta API 오류 (토큰 만료, 권한 부족 등)
    if (msg.includes("Meta API")) {
      const isTokenError =
        msg.includes("validating access token") ||
        msg.includes("expired") ||
        msg.includes("Session has expired") ||
        msg.includes("Invalid OAuth");
      return NextResponse.json(
        {
          error: isTokenError
            ? "Meta API 토큰이 만료되었습니다. 광고계정을 다시 연결해주세요."
            : "Meta API 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        },
        { status: isTokenError ? 401 : 502 }
      );
    }

    // 타임아웃
    if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("TimeoutError")) {
      return NextResponse.json(
        { error: "Meta API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
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
