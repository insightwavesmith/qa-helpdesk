/**
 * GET /api/protractor/account-prescription?account_id=xxx
 * 계정 수준 처방 요약 Top 3
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AJ = Record<string, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id 필수" }, { status: 400 });
  }

  const svc = createServiceClient();

  // 계정의 소재 조회
  const { data: creatives } = await svc
    .from("creatives")
    .select("id")
    .eq("account_id", accountId);

  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ prescriptions: [] });
  }

  const creativeIds = (creatives as AJ[]).map((c) => c.id as string);

  // creative_media에서 analysis_json + 성과 데이터
  const { data: mediaRows } = await svc
    .from("creative_media")
    .select("creative_id, analysis_json")
    .in("creative_id", creativeIds)
    .not("analysis_json", "is", null);

  const { data: perfRows } = await svc
    .from("creative_performance")
    .select("creative_id, roas, ctr")
    .in("creative_id", creativeIds);

  const total = (mediaRows ?? []).length;
  if (total === 0) {
    return NextResponse.json({ prescriptions: [] });
  }

  // 분석 집계
  const hookCounts: Record<string, { count: number; totalRoas: number }> = {};
  const styleCounts: Record<string, number> = {};
  let ctaCount = 0;

  const perfMap = new Map<string, { roas: number; ctr: number }>();
  for (const p of (perfRows ?? []) as AJ[]) {
    perfMap.set(p.creative_id, { roas: p.roas ?? 0, ctr: p.ctr ?? 0 });
  }

  for (const row of (mediaRows ?? []) as AJ[]) {
    const aj = row.analysis_json as AJ;
    if (!aj) continue;

    const hookType = aj?.hook?.hook_type ?? "unknown";
    const perf = perfMap.get(row.creative_id);
    if (!hookCounts[hookType])
      hookCounts[hookType] = { count: 0, totalRoas: 0 };
    hookCounts[hookType].count++;
    hookCounts[hookType].totalRoas += perf?.roas ?? 0;

    const style = aj?.hook?.visual_style ?? "unknown";
    styleCounts[style] = (styleCounts[style] ?? 0) + 1;

    if (aj?.cta?.has_clear_cta) ctaCount++;
  }

  // 가장 많은 훅 유형 중 ROAS가 낮은 것 찾기
  const hookEntries = Object.entries(hookCounts).sort(
    (a, b) => b[1].count - a[1].count
  );

  // 가장 많은 스타일 (과밀)
  const styleEntries = Object.entries(styleCounts).sort((a, b) => b[1] - a[1]);
  const topStylePct = styleEntries.length > 0
    ? Math.round((styleEntries[0][1] / total) * 100)
    : 0;

  // 최고 ROAS 훅
  const bestHook = Object.entries(hookCounts)
    .map(([k, v]) => ({ hook: k, avgRoas: v.totalRoas / v.count }))
    .sort((a, b) => b.avgRoas - a.avgRoas)[0];

  // 처방 생성
  const prescriptions: Array<{
    rank: number;
    title: string;
    description: string;
    urgency: string;
    difficulty: string;
  }> = [];

  // 처방 1: 다양성 확보 (과밀 감지 시)
  if (topStylePct >= 50 && styleEntries.length > 0) {
    prescriptions.push({
      rank: 1,
      title: `소재 다양성 확보 — ${styleEntries[0][0]} 과밀 해소`,
      description: `소재 ${topStylePct}%가 ${styleEntries[0][0]}에 집중.${bestHook ? ` ${bestHook.hook}(ROAS ${bestHook.avgRoas.toFixed(2)}) 소재를 3-5개 추가 제작하여 클러스터 분산` : ""}`,
      urgency: "긴급",
      difficulty: "보통",
    });
  } else {
    prescriptions.push({
      rank: 1,
      title: "소재 다양성 확보",
      description: "클러스터 분석 결과 기반으로 소재 비중 조정 권장",
      urgency: "긴급",
      difficulty: "보통",
    });
  }

  // 처방 2: CTA 강화
  const ctaPct = Math.round((ctaCount / total) * 100);
  prescriptions.push({
    rank: 2,
    title: "CTA 일괄 강화 — 결과+혜택 결합형",
    description: `${total}개 소재 중 명확한 CTA가 있는 건 ${ctaCount}개(${ctaPct}%). 전체적으로 "결과 + 혜택" 결합형 CTA 적용`,
    urgency: "🖱 행동",
    difficulty: "쉬움",
  });

  // 처방 3: 타겟 다각화
  prescriptions.push({
    rank: 3,
    title: "타겟 다각화 — PDA 프레임 적용",
    description:
      hookEntries.length > 0
        ? `${hookEntries[0][0]} 편중 → 다른 페르소나·욕구·인식 수준으로 확장 필요`
        : "PDA 프레임 기반 다각화 필요",
    urgency: "PDA",
    difficulty: "보통",
  });

  return NextResponse.json({ prescriptions });
}
