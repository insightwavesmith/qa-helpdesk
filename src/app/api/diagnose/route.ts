import { NextResponse } from 'next/server';
import { requireProtractorAccess, verifyAccountOwnership } from '@/app/api/protractor/_shared';
import { diagnoseAd, Verdict, type GCPBenchmarks } from '@/lib/diagnosis';

export async function POST(request: Request) {
  // 1. 인증 확인
  const auth = await requireProtractorAccess();
  if ('response' in auth) return auth.response;

  const { svc, user, profile } = auth;

  // 2. 요청 파싱
  let body: { accountId?: string; startDate?: string; endDate?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문 파싱 실패' }, { status: 400 });
  }
  const { accountId, startDate, endDate, limit = 5 } = body;

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  // 3. 계정 소유권 확인
  const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
  if (!hasAccess) {
    return NextResponse.json({ error: '해당 계정에 접근 권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 4. 벤치마크 조회 — wide format, ABOVE_AVERAGE 그룹만
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benchSvc = svc as any;

    const { data: latestBench } = await benchSvc
      .from('benchmarks')
      .select('calculated_at')
      .order('calculated_at', { ascending: false })
      .limit(1);

    // GCPBenchmarks: { VIDEO: { engagement: { above_avg: {...} }, conversion: {...} }, ... }
    const gcpBenchmarks: GCPBenchmarks = {};

    if (latestBench && latestBench.length > 0) {
      const latestAt = (latestBench[0].calculated_at as string).slice(0, 10);
      const { data: benchRows } = await benchSvc
        .from('benchmarks')
        .select('*')
        .eq('ranking_group', 'ABOVE_AVERAGE')
        .gte('calculated_at', latestAt);

      if (benchRows) {
        for (const row of benchRows as Record<string, unknown>[]) {
          const ct = (row.creative_type as string) ?? 'VIDEO';
          const rt = (row.ranking_type as string) ?? 'engagement';

          if (!gcpBenchmarks[ct]) gcpBenchmarks[ct] = {};

          gcpBenchmarks[ct][rt as 'engagement' | 'conversion'] = {
            above_avg: {
              video_p3s_rate: row.video_p3s_rate as number | null,
              thruplay_rate: row.thruplay_rate as number | null,
              retention_rate: row.retention_rate as number | null,
              reactions_per_10k: row.reactions_per_10k as number | null,
              comments_per_10k: row.comments_per_10k as number | null,
              shares_per_10k: row.shares_per_10k as number | null,
              saves_per_10k: row.saves_per_10k as number | null,
              engagement_per_10k: row.engagement_per_10k as number | null,
              ctr: row.ctr as number | null,
              click_to_checkout_rate: row.click_to_checkout_rate as number | null,
              click_to_purchase_rate: row.click_to_purchase_rate as number | null,
              checkout_to_purchase_rate: row.checkout_to_purchase_rate as number | null,
              reach_to_purchase_rate: row.reach_to_purchase_rate as number | null,
              roas: row.roas as number | null,
            },
            sample_count: row.sample_count as number | undefined,
          };
        }
      }
    }

    // 5. TOP N 광고 조회 (daily_ad_insights 테이블)
    let query = svc
      .from('daily_ad_insights')
      .select('*')
      .eq('account_id', accountId)
      .order('spend', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data: rawData } = await query;
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
      'reactions_per_10k', 'comments_per_10k', 'shares_per_10k',
      'saves_per_10k', 'engagement_per_10k',
      'click_to_checkout_rate', 'click_to_purchase_rate',
      'checkout_to_purchase_rate', 'reach_to_purchase_rate',
    ];

    for (const row of rawInsights) {
      const adId = row.ad_id as string;
      if (!adId) continue;
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
        // ctr, roas 재계산
        const totalSpend = existing.spend as number;
        const totalClicks = existing.clicks as number;
        const totalImpressions = existing.impressions as number;
        const totalRevenue = existing.purchase_value as number;
        existing.ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        existing.roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
        const totalPurchases = existing.purchases as number;
        // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
        existing.reach_to_purchase_rate = totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : 0;
      }
    }

    const topAds = Array.from(adMap.values())
      .sort((a, b) => ((b.spend as number) || 0) - ((a.spend as number) || 0))
      .slice(0, limit);

    // 6. 각 광고 진단 실행
    const results = topAds.map((ad) => {
      const adCreativeType = ((ad.creative_type as string) ?? 'VIDEO').toUpperCase();
      const diagnosis = diagnoseAd(ad, gcpBenchmarks, adCreativeType);
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
              // threshold = aboveAvg × 0.75, for DiagnosticPanel display
              average_avg: m.aboveAvg != null ? m.aboveAvg * 0.75 : null,
              verdict: m.verdict,
            })),
        })),
      };
    });

    return NextResponse.json({
      account_id: accountId,
      diagnoses: results,
      has_benchmark_data: Object.keys(gcpBenchmarks).length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
