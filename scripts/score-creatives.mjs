#!/usr/bin/env node
/**
 * 소재 종합 점수 + 개선 제안 생성 스크립트 — Layer 4 (Benchmark & Suggestion)
 * 모델: Gemini 2.0 Pro
 *
 * Usage: node scripts/score-creatives.mjs [--limit N] [--account-id xxx]
 *   --limit N          : 최대 N건 처리 (기본값: 999)
 *   --account-id xxx   : 특정 광고계정만 처리
 *
 * 플로우:
 * 1. creative_element_analysis 조회 (분석 완료된 소재)
 * 2. creative_intelligence_scores 조회 (이미 점수 부여된 소재 제외)
 * 3. creative_element_performance 벤치마크 데이터 조회
 * 4. daily_ad_insights 실제 성과 데이터 조회
 * 5. creative_lp_consistency LP 일관성 점수 조회
 * 6. 각 소재별 Gemini 2.0 Pro 호출 → 점수 + 제안 생성
 * 7. creative_intelligence_scores UPSERT
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// CLI 인수 파싱
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 999;

const accountIdx = args.indexOf("--account-id");
const ACCOUNT_ID = accountIdx >= 0 ? args[accountIdx + 1] : null;

// .env.local 읽기
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash";

if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

// ━━━ Supabase REST 헬퍼 ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, row, onConflict = "ad_id") {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

// ━━━ 벤치마크 요약 문자열 생성 ━━━
function buildBenchmarkSummary(elementRow, benchmarks) {
  const lines = [];

  // 확인할 요소 필드 목록
  const fields = ["hook_type", "style", "cta_type", "color_tone", "format"];

  for (const field of fields) {
    const val = elementRow[field];
    if (!val) continue;

    const bench = benchmarks.find(
      (b) => b.element_type === field && b.element_value === val
    );
    if (bench) {
      lines.push(
        `${field}="${val}": 평균 ROAS ${bench.avg_roas?.toFixed(2) ?? "N/A"}, ` +
        `평균 CTR ${bench.avg_ctr?.toFixed(4) ?? "N/A"}, ` +
        `샘플 ${bench.sample_count ?? 0}건`
      );
    }
  }

  return lines.length > 0 ? lines.join("\n") : "벤치마크 데이터 없음";
}

// ━━━ 성과 데이터 집계 ━━━
function aggregateInsights(insightsForAd) {
  if (!insightsForAd || insightsForAd.length === 0) {
    return { avgRoas: 0, avgCtr: 0, totalSpend: 0, totalPurchases: 0 };
  }

  const count = insightsForAd.length;
  const avgRoas = insightsForAd.reduce((s, i) => s + (i.roas || 0), 0) / count;
  const avgCtr = insightsForAd.reduce((s, i) => s + (i.ctr || 0), 0) / count;
  const totalSpend = insightsForAd.reduce((s, i) => s + (i.spend || 0), 0);
  const totalPurchases = insightsForAd.reduce((s, i) => s + (i.purchases || 0), 0);

  return { avgRoas, avgCtr, totalSpend, totalPurchases };
}

// ━━━ Gemini 스코링 프롬프트 생성 ━━━
function buildScoringPrompt(elementRow, benchmarkSummary, perf, lpConsistency) {
  const conversionRate =
    perf.totalPurchases > 0 && perf.avgCtr > 0
      ? (perf.totalPurchases / (perf.totalSpend > 0 ? perf.totalSpend : 1)).toFixed(4)
      : "0";

  const lpStr =
    lpConsistency !== null && lpConsistency !== undefined
      ? `${(lpConsistency * 100).toFixed(1)}%`
      : "측정 안됨";

  return `당신은 메타 광고 소재 분석 전문가입니다. 아래 데이터를 기반으로 이 소재의 종합 점수와 개선 제안을 JSON으로 출력해줘.

## 소재 요소 분석:
${JSON.stringify(elementRow, null, 2)}

## 실제 성과 데이터:
ROAS: ${perf.avgRoas.toFixed(2)}, CTR: ${(perf.avgCtr * 100).toFixed(2)}%, 전환율: ${conversionRate}

## 카테고리별 벤치마크 (동종 소재 평균):
${benchmarkSummary}

## 소재↔LP 일관성 점수:
${lpStr}

## 출력 형식 (정확한 JSON만, 다른 텍스트 없이):
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
      "benchmark": "벤치마크 대비 상황 (구체적 수치 포함)",
      "suggestion": "구체적 개선 방법",
      "expected_impact": "예상 효과 (CTR +XX% 등)"
    }
  ],
  "benchmark_comparison": {
    "roas_vs_avg": 1.2,
    "ctr_vs_avg": 0.8,
    "hook_type_rank": "상위 30%",
    "style_rank": "상위 50%"
  }
}

점수 기준:
- 90+: 최상위 성과 소재
- 70-89: 양호, 개선 여지 있음
- 50-69: 평균 이하, 즉각 개선 필요
- 50 미만: 성과 저조, 전면 교체 권장

제안은 최소 2개, 최대 5개. priority가 high인 것부터.
벤치마크 수치를 반드시 포함 (예: "ROAS 상위 소재 83%가 첫 3초 문제 제기형 후킹 사용").`;
}

// ━━━ Gemini 2.0 Pro 호출 ━━━
async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // JSON 파싱 (responseMimeType=application/json이면 text 자체가 JSON)
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`JSON 추출 실패: ${text.slice(0, 200)}`);
    return JSON.parse(jsonMatch[0]);
  }
}

// ━━━ 메인 ━━━
async function main() {
  console.log("소재 점수 + 제안 생성 시작 (Gemini 2.0 Pro)");
  console.log(`  limit: ${LIMIT}, account-id: ${ACCOUNT_ID || "전체"}`);

  // 1. 이미 점수 부여된 소재 목록 조회
  const scored = await sbGet("/creative_intelligence_scores?select=ad_id&limit=9999");
  const scoredSet = new Set(scored.map((r) => r.ad_id));
  console.log(`  기존 점수 보유: ${scoredSet.size}건`);

  // 2. 소재 요소 분석 결과 조회
  let elemPath = `/creative_element_analysis?select=*&limit=${LIMIT}`;
  if (ACCOUNT_ID) elemPath += `&account_id=eq.${encodeURIComponent(ACCOUNT_ID)}`;
  const elements = await sbGet(elemPath);
  console.log(`  소재 요소 분석 결과: ${elements.length}건`);

  // 3. 미점수 소재만 필터
  const toScore = elements.filter((e) => !scoredSet.has(e.ad_id));
  console.log(`  점수 생성 대상: ${toScore.length}건 (${scoredSet.size}건 스킵)`);

  if (toScore.length === 0) {
    console.log("  처리할 소재 없음. 종료.");
    return;
  }

  // 4. 벤치마크 데이터 조회
  const benchmarks = await sbGet("/creative_element_performance?select=*&limit=9999");
  console.log(`  벤치마크 데이터: ${benchmarks.length}건`);

  // 5. 실제 성과 데이터 조회 (대상 소재에 한정)
  const adIds = toScore.map((e) => e.ad_id);
  // Supabase REST에서 in 필터: ?ad_id=in.(id1,id2,...) — URL 길이 제한 고려, 배치 처리
  const BATCH = 100;
  const allInsights = [];
  for (let i = 0; i < adIds.length; i += BATCH) {
    const chunk = adIds.slice(i, i + BATCH);
    const inVal = encodeURIComponent(`(${chunk.join(",")})`);
    const rows = await sbGet(
      `/daily_ad_insights?select=ad_id,roas,ctr,purchases,clicks,spend&ad_id=in.${inVal}&spend=gt.0&limit=99999`
    );
    allInsights.push(...rows);
  }
  console.log(`  성과 데이터: ${allInsights.length}건`);

  // 6. LP 일관성 점수 조회
  const allConsistency = [];
  for (let i = 0; i < adIds.length; i += BATCH) {
    const chunk = adIds.slice(i, i + BATCH);
    const inVal = encodeURIComponent(`(${chunk.join(",")})`);
    const rows = await sbGet(
      `/creative_lp_consistency?select=ad_id,total_score&ad_id=in.${inVal}&limit=9999`
    );
    allConsistency.push(...rows);
  }
  console.log(`  LP 일관성 점수: ${allConsistency.length}건`);

  // ad_id → insights/consistency 매핑 (조회 효율화)
  const insightsByAd = {};
  for (const row of allInsights) {
    if (!insightsByAd[row.ad_id]) insightsByAd[row.ad_id] = [];
    insightsByAd[row.ad_id].push(row);
  }
  const consistencyByAd = {};
  for (const row of allConsistency) {
    consistencyByAd[row.ad_id] = row.total_score;
  }

  // 7. 소재별 점수 생성
  let okCount = 0;
  let errCount = 0;

  for (let i = 0; i < toScore.length; i++) {
    const element = toScore[i];
    console.log(`\n[${i + 1}/${toScore.length}] ${element.ad_id}`);

    try {
      // 성과 집계
      const perf = aggregateInsights(insightsByAd[element.ad_id] || []);
      const lpConsistency = consistencyByAd[element.ad_id] ?? null;

      // 벤치마크 요약
      const benchmarkSummary = buildBenchmarkSummary(element, benchmarks);

      // 프롬프트 생성
      const prompt = buildScoringPrompt(element, benchmarkSummary, perf, lpConsistency);

      // Gemini 호출
      const result = await callGemini(prompt);

      // creative_intelligence_scores UPSERT
      const scoreRow = {
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
      };

      const dbResult = await sbPost("creative_intelligence_scores", scoreRow);
      if (dbResult.ok) {
        okCount++;
        console.log(
          `  점수: ${result.overall_score ?? "N/A"}, ` +
          `제안: ${result.suggestions?.length ?? 0}건`
        );
      } else {
        errCount++;
        console.log(`  DB 저장 실패: status=${dbResult.status}`);
      }
    } catch (e) {
      errCount++;
      console.log(`  에러: ${e.message}`);
    }

    // Pro 모델 rate limit 대응 — 1초 딜레이
    if (i < toScore.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`성공: ${okCount}건, 에러: ${errCount}건, 스킵(기존): ${scoredSet.size}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
