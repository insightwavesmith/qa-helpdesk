import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const maxDuration = 300;

// Gemini 모델명
const MODEL = "gemini-2.0-pro-exp-02-05";

// ━━━ 벤치마크 요약 + 스코링 프롬프트 생성 ━━━
function buildScoringPrompt(
  element: Record<string, unknown>,
  benchmarks: Array<{
    element_type: string;
    element_value: string;
    avg_roas: number;
    avg_ctr: number;
    sample_count: number;
  }>,
  avgRoas: number,
  avgCtr: number,
  lpConsistency: number | null
): string {
  // 요소별 벤치마크 라인 생성
  const benchLines: string[] = [];
  const fields = ["hook_type", "style", "cta_type", "color_tone", "format"];

  for (const field of fields) {
    const val = element[field] as string | undefined;
    if (!val) continue;
    const match = benchmarks.find(
      (b) => b.element_type === field && b.element_value === val
    );
    if (match) {
      benchLines.push(
        `${field}="${val}": 평균 ROAS ${match.avg_roas?.toFixed(2) ?? "N/A"}, ` +
        `평균 CTR ${match.avg_ctr?.toFixed(4) ?? "N/A"}, ` +
        `샘플 ${match.sample_count ?? 0}건`
      );
    }
  }

  const lpStr =
    lpConsistency !== null && lpConsistency !== undefined
      ? `${(lpConsistency * 100).toFixed(1)}%`
      : "측정 안됨";

  return `당신은 메타 광고 소재 분석 전문가입니다. 아래 데이터를 기반으로 이 소재의 종합 점수와 개선 제안을 JSON으로 출력해줘.

## 소재 요소 분석:
${JSON.stringify(element, null, 2)}

## 실제 성과 데이터:
ROAS: ${avgRoas.toFixed(2)}, CTR: ${(avgCtr * 100).toFixed(2)}%

## 카테고리별 벤치마크:
${benchLines.join("\n") || "데이터 없음"}

## 소재↔LP 일관성 점수:
${lpStr}

정확한 JSON만 출력하고 다른 텍스트는 넣지 마.
{
  "overall_score": 72,
  "scores": {
    "visual_impact": 80,
    "message_clarity": 65,
    "cta_effectiveness": 70,
    "social_proof": 85,
    "lp_consistency": 56
  },
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "hook|visual|cta|social_proof|lp_consistency|text|color",
      "current": "현재 상태 설명",
      "benchmark": "벤치마크 대비 구체적 수치",
      "suggestion": "구체적 개선 방법",
      "expected_impact": "예상 효과"
    }
  ],
  "benchmark_comparison": {
    "roas_vs_avg": 1.2,
    "ctr_vs_avg": 0.8,
    "hook_type_rank": "상위 XX%",
    "style_rank": "상위 XX%"
  }
}

점수 기준: 90+ 최상위, 70-89 양호, 50-69 평균 이하, 50미만 전면 교체 권장.
제안 최소 2개 최대 5개, priority high부터. 벤치마크 수치 반드시 포함.`;
}

export async function POST(req: NextRequest) {
  // 관리자 인증
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  // 요청 바디 파싱
  const body = await req.json().catch(() => ({}));
  const batchSize: number = (body as Record<string, number>).batchSize || 20;
  const accountId: string | null =
    (body as Record<string, string | null>).accountId || null;

  // 1. 소재 요소 분석 결과 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("creative_element_analysis")
    .select("*")
    .limit(batchSize);
  if (accountId) query = query.eq("account_id", accountId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: elements, error: elemErr } = await query as any;

  if (elemErr) {
    return NextResponse.json({ error: elemErr.message }, { status: 500 });
  }

  if (!elements || elements.length === 0) {
    return NextResponse.json({ message: "분석된 소재 없음", scored: 0 });
  }

  // 2. 이미 점수 있는 소재 제외
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adIds = (elements as any[]).map((e: any) => e.ad_id);
  const { data: existing } = await (svc as any)
    .from("creative_intelligence_scores")
    .select("ad_id")
    .in("ad_id", adIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoredSet = new Set(((existing || []) as any[]).map((e: any) => e.ad_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toScore = (elements as any[]).filter((e: any) => !scoredSet.has(e.ad_id));

  if (toScore.length === 0) {
    return NextResponse.json({
      message: "모든 소재에 이미 점수가 있습니다",
      total: elements.length,
      skipped: scoredSet.size,
      scored: 0,
      errors: 0,
    });
  }

  // 3. 벤치마크 데이터 조회
  const { data: benchmarks } = await (svc as any)
    .from("creative_element_performance")
    .select("*");

  // 4. 실제 성과 데이터 조회
  const { data: insights } = await (svc as any)
    .from("daily_ad_insights")
    .select("ad_id, roas, ctr, purchases, clicks, spend")
    .in("ad_id", adIds)
    .gt("spend", 0);

  // 5. LP 일관성 점수 조회
  const { data: lpScores } = await (svc as any)
    .from("creative_lp_consistency")
    .select("ad_id, total_score")
    .in("ad_id", adIds);

  // Gemini API 키
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  let scored = 0;
  let errors = 0;

  // 6. 소재별 Gemini 점수 생성
  for (const element of toScore) {
    try {
      // 성과 데이터 집계
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adInsights = ((insights || []) as any[]).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (i: any) => i.ad_id === element.ad_id
      );
      const avgRoas =
        adInsights.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? adInsights.reduce((s: number, i: any) => s + (i.roas || 0), 0) /
            adInsights.length
          : 0;
      const avgCtr =
        adInsights.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? adInsights.reduce((s: number, i: any) => s + (i.ctr || 0), 0) /
            adInsights.length
          : 0;

      // LP 일관성 점수
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lpScore =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((lpScores || []) as any[]).find((l: any) => l.ad_id === element.ad_id)
          ?.total_score ?? null;

      // 프롬프트 생성
      const prompt = buildScoringPrompt(
        element as Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (benchmarks || []) as any[],
        avgRoas,
        avgCtr,
        lpScore
      );

      // Gemini 2.0 Pro 호출
      const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048 },
          }),
        }
      );

      if (!genRes.ok) {
        errors++;
        continue;
      }

      const genData = await genRes.json();
      const text: string =
        genData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // JSON 추출
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        errors++;
        continue;
      }

      const result = JSON.parse(jsonMatch[0]);

      // creative_intelligence_scores UPSERT
      const { error: insertErr } = await (svc as any)
        .from("creative_intelligence_scores")
        .upsert(
          {
            ad_id: element.ad_id,
            account_id: element.account_id || null,
            overall_score: result.overall_score ?? null,
            visual_impact_score: result.scores?.visual_impact ?? null,
            message_clarity_score: result.scores?.message_clarity ?? null,
            cta_effectiveness_score: result.scores?.cta_effectiveness ?? null,
            social_proof_score: result.scores?.social_proof ?? null,
            lp_consistency_score: result.scores?.lp_consistency ?? null,
            suggestions: result.suggestions ?? null,
            benchmark_comparison: result.benchmark_comparison ?? null,
            model_version: MODEL,
          },
          { onConflict: "ad_id" }
        );

      if (!insertErr) {
        scored++;
      } else {
        errors++;
      }

      // Pro 모델 rate limit 대응 — 1초 딜레이
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    message: "소재 점수 생성 완료",
    total: elements.length,
    skipped: scoredSet.size,
    scored,
    errors,
  });
}
