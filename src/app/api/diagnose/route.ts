import { NextResponse } from 'next/server';
import { requireProtractorAccess, verifyAccountOwnership } from '@/app/api/protractor/_shared';
import { diagnoseAd, Verdict } from '@/lib/diagnosis';

/**
 * 벤치마크 EAV 행들을 진단 엔진이 기대하는 9그룹 형식으로 변환
 *
 * EAV 원본: { metric_name, avg_value, p75 }
 * 진단 엔진 기대:
 *   { quality_above: { avg_ctr: ..., }, quality_average: {...}, ... }
 *
 * 현재 DB에는 ranking_type 구분 없이 단일 벤치마크 → 3그룹으로 분배
 *   - above: p75 값 (상위 기준선)
 *   - average: avg_value 값
 *   - below: avg_value * 0.5 (추정)
 */
function transformBenchmarks(
  rows: { metric_name: string; avg_value: number | null; p75: number | null; p25: number | null }[],
): Record<string, Record<string, number>> {
  const rankingTypes = ['quality', 'engagement', 'conversion'];
  const result: Record<string, Record<string, number>> = {};

  for (const rt of rankingTypes) {
    result[`${rt}_above`] = {};
    result[`${rt}_average`] = {};
    result[`${rt}_below`] = {};
  }

  for (const row of rows) {
    const aboveVal = row.p75 ?? row.avg_value ?? 0;
    const avgVal = row.avg_value ?? 0;
    const belowVal = row.p25 ?? avgVal * 0.5;

    const key = `avg_${row.metric_name}`;

    for (const rt of rankingTypes) {
      result[`${rt}_above`][key] = aboveVal;
      result[`${rt}_average`][key] = avgVal;
      result[`${rt}_below`][key] = belowVal;
    }
  }

  return result;
}

export async function POST(request: Request) {
  // 1. 인증 확인
  const auth = await requireProtractorAccess();
  if ('response' in auth) return auth.response;

  const { svc, user, profile } = auth;

  // 2. 요청 파싱
  const body = await request.json();
  const { accountId, startDate, endDate, limit = 5 } = body as {
    accountId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  };

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  // 3. 계정 소유권 확인
  const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
  if (!hasAccess) {
    return NextResponse.json({ error: '해당 계정에 접근 권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 4. 벤치마크 조회 (실 데이터)
    const { data: latestBench } = await svc
      .from('benchmarks')
      .select('date')
      .order('calculated_at', { ascending: false })
      .limit(1);

    let benchmarks: Record<string, Record<string, number>> = {};
    if (latestBench && latestBench.length > 0) {
      const { data: benchRows } = await svc
        .from('benchmarks')
        .select('metric_name, avg_value, p75, p25')
        .eq('date', latestBench[0].date);

      if (benchRows) {
        benchmarks = transformBenchmarks(benchRows);
      }
    }

    // 5. TOP N 광고 조회 (daily_ad_insights 테이블)
    // select('*') returns all DB columns including those not in TypeScript types
    let query = svc
      .from('daily_ad_insights')
      .select('*')
      .eq('account_id', accountId)
      .order('spend', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data: rawData } = await query;
    // Cast to Record<string, unknown>[] to access all columns (DB has more columns than TS types)
    const rawInsights = rawData as unknown as Record<string, unknown>[] | null;

    if (!rawInsights || rawInsights.length === 0) {
      return NextResponse.json(
        { error: 'No ads found for this account' },
        { status: 404 },
      );
    }

    // ad_id별로 그루핑 (기간 합산) → spend DESC → TOP N
    const adMap = new Map<string, Record<string, unknown>>();
    const sumKeys = ['impressions', 'reach', 'clicks', 'spend', 'purchases', 'purchase_value'];
    const rateKeys = [
      'video_p3s_rate', 'thruplay_rate', 'retention_rate',
      'reactions_per_10k', 'comments_per_10k', 'shares_per_10k', 'engagement_per_10k',
      'click_to_cart_rate', 'click_to_checkout_rate', 'click_to_purchase_rate',
      'cart_to_purchase_rate', 'checkout_to_purchase_rate',
    ];

    for (const row of rawInsights) {
      const adId = row.ad_id as string;
      const existing = adMap.get(adId);
      if (!existing) {
        adMap.set(adId, { ...row });
      } else {
        for (const k of sumKeys) {
          existing[k] = ((existing[k] as number) || 0) + ((row[k] as number) || 0);
        }
        // 비율 지표는 최근 값 유지
        for (const k of rateKeys) {
          if (row[k] != null) existing[k] = row[k];
        }
        // roas, ctr 재계산
        const totalSpend = existing.spend as number;
        const totalClicks = existing.clicks as number;
        const totalImpressions = existing.impressions as number;
        const totalRevenue = existing.purchase_value as number;
        existing.ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        existing.roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      }
    }

    const topAds = Array.from(adMap.values())
      .sort((a, b) => ((b.spend as number) || 0) - ((a.spend as number) || 0))
      .slice(0, limit);

    // 6. 각 광고 진단 실행
    const results = topAds.map((ad) => {
      const diagnosis = diagnoseAd(ad, benchmarks, null);
      return {
        ad_id: diagnosis.adId,
        ad_name: diagnosis.adName,
        overall_verdict: diagnosis.overallVerdict,
        one_line_diagnosis: diagnosis.oneLineDiagnosis,
        parts: diagnosis.parts.map((p) => ({
          part_num: p.partNum,
          part_name: p.partName,
          verdict: p.verdict,
          metrics: p.metrics
            .filter((m) => m.verdict !== Verdict.UNKNOWN)
            .map((m) => ({
              name: m.metricName,
              my_value: m.myValue,
              above_avg: m.aboveAvg,
              verdict: m.verdict,
            })),
        })),
      };
    });

    return NextResponse.json({
      account_id: accountId,
      diagnoses: results,
      has_lp_data: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
