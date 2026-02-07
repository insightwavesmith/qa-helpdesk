import { NextResponse } from 'next/server';
import { requireProtractorAccess, verifyAccountOwnership } from '@/app/api/protractor/_shared';
import { diagnoseAd, Verdict } from '@/lib/diagnosis';

// 테스트용 하드코딩 벤치마크 (Python 테스트 데이터 기반)
const TEST_BENCHMARKS: Record<string, Record<string, number>> = {
  quality_above: {
    avg_ctr: 2.0, avg_click_to_purchase_rate: 2.5,
    avg_lcp: 2.0, avg_fcp: 1.5,
    avg_bounce_1s_rate: 10.0, avg_bounce_10s_rate: 25.0,
    avg_avg_time_on_page: 60.0,
    avg_scroll_25_rate: 90.0, avg_scroll_50_rate: 70.0, avg_scroll_75_rate: 50.0,
    avg_review_click_rate: 8.0, avg_total_button_clicks: 200,
  },
  quality_average: {
    avg_ctr: 1.5, avg_click_to_purchase_rate: 1.5,
    avg_lcp: 3.0, avg_fcp: 2.5,
    avg_bounce_1s_rate: 20.0, avg_bounce_10s_rate: 40.0,
    avg_avg_time_on_page: 40.0,
    avg_scroll_25_rate: 75.0, avg_scroll_50_rate: 55.0, avg_scroll_75_rate: 35.0,
    avg_review_click_rate: 4.0, avg_total_button_clicks: 100,
  },
  quality_below: {
    avg_ctr: 0.8, avg_click_to_purchase_rate: 0.5,
    avg_lcp: 5.0, avg_fcp: 4.0,
    avg_bounce_1s_rate: 35.0, avg_bounce_10s_rate: 60.0,
    avg_avg_time_on_page: 20.0,
    avg_scroll_25_rate: 50.0, avg_scroll_50_rate: 30.0, avg_scroll_75_rate: 15.0,
    avg_review_click_rate: 1.0, avg_total_button_clicks: 30,
  },
  engagement_above: {
    avg_video_p3s_rate: 20.0, avg_thruplay_rate: 5.0, avg_retention_rate: 30.0,
    avg_reactions_per_10k: 100, avg_comments_per_10k: 3,
    avg_shares_per_10k: 5, avg_engagement_per_10k: 150,
  },
  engagement_average: {
    avg_video_p3s_rate: 15.0, avg_thruplay_rate: 3.0, avg_retention_rate: 20.0,
    avg_reactions_per_10k: 50, avg_comments_per_10k: 1,
    avg_shares_per_10k: 2, avg_engagement_per_10k: 80,
  },
  engagement_below: {
    avg_video_p3s_rate: 8.0, avg_thruplay_rate: 1.0, avg_retention_rate: 10.0,
    avg_reactions_per_10k: 20, avg_comments_per_10k: 0,
    avg_shares_per_10k: 0, avg_engagement_per_10k: 30,
  },
  conversion_above: {
    avg_ctr: 2.0, avg_click_to_cart_rate: 10.0, avg_click_to_checkout_rate: 5.0,
    avg_click_to_purchase_rate: 2.0, avg_cart_to_purchase_rate: 25.0,
    avg_checkout_to_purchase_rate: 35.0,
  },
  conversion_average: {
    avg_ctr: 1.5, avg_click_to_cart_rate: 7.0, avg_click_to_checkout_rate: 3.0,
    avg_click_to_purchase_rate: 1.5, avg_cart_to_purchase_rate: 20.0,
    avg_checkout_to_purchase_rate: 25.0,
  },
  conversion_below: {
    avg_ctr: 0.8, avg_click_to_cart_rate: 3.0, avg_click_to_checkout_rate: 1.0,
    avg_click_to_purchase_rate: 0.5, avg_cart_to_purchase_rate: 10.0,
    avg_checkout_to_purchase_rate: 15.0,
  },
};

export async function POST(request: Request) {
  // 1. 인증 확인 (student/member/admin)
  const auth = await requireProtractorAccess();
  if ('response' in auth) return auth.response;

  const { svc, user, profile } = auth;

  // 2. 요청 파싱
  const body = await request.json();
  const { accountId, limit = 5 } = body as { accountId?: string; limit?: number };

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  // 3. 계정 소유권 확인
  const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
  if (!hasAccess) {
    return NextResponse.json({ error: '해당 계정에 접근 권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 4. 벤치마크 조회 — 테스트 벤치마크 사용 (ad_insights_classified 테이블 없음)
    const benchmarks = TEST_BENCHMARKS;

    // 5. 해당 계정의 TOP N 광고 조회
    //    ad_insights_classified 테이블이 없으므로 빈 배열 반환
    const { data: ads } = await svc
      .from('ad_insights_classified' as never)
      .select('*')
      .eq('account_id', accountId)
      .order('spend', { ascending: false })
      .limit(limit);

    if (!ads || (ads as unknown[]).length === 0) {
      return NextResponse.json(
        { error: 'No ads found for this account' },
        { status: 404 },
      );
    }

    // 6. 각 광고 진단 실행
    const results = (ads as Record<string, unknown>[]).map((ad) => {
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
