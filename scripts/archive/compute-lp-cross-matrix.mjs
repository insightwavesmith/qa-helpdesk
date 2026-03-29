#!/usr/bin/env node
/**
 * LP 3축 교차 매트릭스 분석 (레퍼런스 / 데이터 / 시선)
 *
 * lp_analysis에서 reference_based, data_based, eye_tracking이 모두 있는 LP를 대상으로
 * 3축 교차 점수를 계산하고, 결과를 lp_analysis.data_based JSONB의 cross_matrix 키에 저장.
 *
 * Usage:
 *   node scripts/compute-lp-cross-matrix.mjs [--dry-run]
 *
 * 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { sbGet, sbPatch } from "./lib/db-helpers.mjs";

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");

// ── 수학 헬퍼 ──
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

// ── 축별 점수 추출 ──

/**
 * 레퍼런스 축 점수 (0~100)
 * conversion_score가 있으면 그대로 사용, 없으면 reference_based 요소 갯수 기반
 */
function extractReferenceScore(row) {
  // conversion_score가 있으면 사용 (0~100 범위)
  if (row.conversion_score != null) {
    return clamp(row.conversion_score, 0, 100);
  }

  // reference_based JSONB에서 boolean 요소 카운트
  const rb = row.reference_based;
  if (!rb) return null;

  const booleanChecks = [
    rb.social_proof?.review_count > 0,
    rb.cta_structure?.type === "sticky",
    rb.urgency_scarcity?.timer === true,
    rb.trust_elements?.certification === true,
    (rb.cta_structure?.easy_pay?.length || 0) > 0,
    rb.trust_elements?.brand_story === true,
    (rb.social_proof?.types || []).includes("photo"),
    rb.conversion_psychology?.objection_handling === true,
  ];

  const trueCount = booleanChecks.filter(Boolean).length;
  // 8개 요소 중 몇 개 충족 → 0~100 변환
  return round2((trueCount / 8) * 100);
}

/**
 * 데이터 축 점수 (0~100)
 * data_based.conversion_rate + data_based.benchmark_percentile 기반
 */
function extractDataScore(row) {
  const db = row.data_based;
  if (!db) return null;

  // benchmark_percentile이 있으면 가장 정확한 위치 지표
  if (db.benchmark_percentile != null) {
    return clamp(db.benchmark_percentile, 0, 100);
  }

  // conversion_rate 기반 점수 (전환율 0~10% → 0~100 매핑)
  if (db.conversion_rate != null) {
    return clamp(round2(db.conversion_rate * 10), 0, 100);
  }

  return null;
}

/**
 * 시선 축 점수 (0~100)
 * fold_attention, cta_attention, cognitive_load 종합
 */
function extractEyeTrackingScore(row) {
  const et = row.eye_tracking;
  if (!et) return null;

  let score = 0;
  let factors = 0;

  // fold_attention (0~1) → 비중 40%
  if (et.fold_attention != null) {
    score += clamp(et.fold_attention, 0, 1) * 40;
    factors++;
  }

  // cta_attention (0~1) → 비중 35%
  if (et.cta_attention != null) {
    score += clamp(et.cta_attention, 0, 1) * 35 * (1 / 0.3); // 0.3 기준 정규화
    factors++;
  }

  // cognitive_load: low=30, medium=20, high=5 → 비중 25%
  if (et.cognitive_load) {
    const loadScoreMap = { low: 25, medium: 15, high: 5 };
    score += loadScoreMap[et.cognitive_load] || 10;
    factors++;
  }

  if (factors === 0) return null;
  return clamp(round2(score), 0, 100);
}

// ── 교차 매트릭스 분류 ──
function classifyCrossMatrix(refScore, dataScore, eyeScore) {
  const HIGH_THRESHOLD = 60;
  const LOW_THRESHOLD = 30;

  const isHigh = (s) => s >= HIGH_THRESHOLD;
  const isLow = (s) => s < LOW_THRESHOLD;

  const highCount = [refScore, dataScore, eyeScore].filter(isHigh).length;
  const lowCount = [refScore, dataScore, eyeScore].filter(isLow).length;

  if (highCount === 3) return "star"; // 3축 모두 높음 — 최고 성과 LP
  if (highCount === 2) return "strong"; // 2축 높음 — 강점 LP
  if (highCount === 1 && lowCount <= 1) return "mixed"; // 혼합 — 개선 여지 있음
  if (lowCount >= 2) return "weak"; // 2축 이상 낮음 — 개선 필요
  return "average"; // 평균
}

// ── 개선 제안 생성 ──
function generateInsights(refScore, dataScore, eyeScore) {
  const insights = [];

  // 축별 Gap 분석
  const scores = { reference: refScore, data: dataScore, eye_tracking: eyeScore };
  const sortedAxes = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const strongest = sortedAxes[0];
  const weakest = sortedAxes[sortedAxes.length - 1];

  if (strongest[1] - weakest[1] > 30) {
    insights.push(`${weakest[0]} 축이 상대적으로 약함 (${weakest[1]}점). ${strongest[0]} 축 수준(${strongest[1]}점)으로 개선 필요.`);
  }

  // 시선은 좋은데 전환이 안 되는 경우
  if (eyeScore > 60 && dataScore < 40) {
    insights.push("시선 유도는 좋으나 전환 성과가 낮음 — CTA 메시지/오퍼 개선 필요.");
  }

  // 레퍼런스 구조는 좋은데 시선이 분산되는 경우
  if (refScore > 60 && eyeScore < 40) {
    insights.push("구조 요소는 갖추었으나 시선 집중도 낮음 — 비주얼 계층 구조 재정비 필요.");
  }

  // 데이터 성과는 좋은데 구조가 약한 경우
  if (dataScore > 60 && refScore < 40) {
    insights.push("전환 성과는 좋으나 레퍼런스 요소 부족 — 리뷰/신뢰 요소 보강 시 추가 상승 가능.");
  }

  if (insights.length === 0) {
    insights.push("3축 균형 양호. 지속 모니터링 권장.");
  }

  return insights;
}

// ── main ──
async function main() {
  console.log(`LP 3축 교차 매트릭스 분석${DRY_RUN ? " (dry-run)" : ""}`);
  console.log();

  const PAGE_SIZE = 1000;

  // ── 1. lp_analysis 조회 (3축 모두 NOT NULL인 레코드) ──
  console.log("lp_analysis 조회 중 (3축 모두 존재하는 LP)...");

  let allAnalysis = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/lp_analysis?select=id,lp_id,viewport,reference_based,data_based,eye_tracking,conversion_score` +
      `&reference_based=not.is.null` +
      `&data_based=not.is.null` +
      `&eye_tracking=not.is.null` +
      `&order=lp_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    allAnalysis.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`3축 모두 존재하는 lp_analysis: ${allAnalysis.length}건`);

  if (allAnalysis.length === 0) {
    console.log("교차 분석 대상 LP가 없습니다.");
    return;
  }

  // ── 2. 각 LP별 3축 점수 계산 ──
  console.log("3축 교차 점수 계산 중...");

  const results = [];
  let skipped = 0;

  for (const row of allAnalysis) {
    const refScore = extractReferenceScore(row);
    const dataScore = extractDataScore(row);
    const eyeScore = extractEyeTrackingScore(row);

    if (refScore === null || dataScore === null || eyeScore === null) {
      skipped++;
      continue;
    }

    const avgScore = round2((refScore + dataScore + eyeScore) / 3);
    const classification = classifyCrossMatrix(refScore, dataScore, eyeScore);
    const insights = generateInsights(refScore, dataScore, eyeScore);

    results.push({
      row,
      crossMatrix: {
        axes: {
          reference: round2(refScore),
          data: round2(dataScore),
          eye_tracking: round2(eyeScore),
        },
        combined_score: avgScore,
        classification,
        insights,
        computed_at: new Date().toISOString(),
      },
    });
  }

  console.log(`교차 점수 계산 완료: ${results.length}건 (스킵: ${skipped}건)`);

  // ── 3. 분류별 분포 출력 ──
  const distribution = {};
  for (const r of results) {
    const cls = r.crossMatrix.classification;
    distribution[cls] = (distribution[cls] || 0) + 1;
  }
  console.log();
  console.log("━━━ 분류 분포 ━━━");
  for (const [cls, count] of Object.entries(distribution)) {
    console.log(`  ${cls}: ${count}건`);
  }

  // ── 4. DB 저장 ──
  console.log();
  console.log(`lp_analysis.data_based.cross_matrix ${DRY_RUN ? "저장 (dry-run)" : "저장"} 중...`);

  let savedCount = 0;
  let errors = 0;

  for (const { row, crossMatrix } of results) {
    if (DRY_RUN) {
      savedCount++;
      continue;
    }

    // 기존 data_based에 cross_matrix 키 추가 (머지)
    const existingDataBased = row.data_based || {};
    const updatedDataBased = {
      ...existingDataBased,
      cross_matrix: crossMatrix,
    };

    const opResult = await sbPatch(
      "lp_analysis",
      `id=eq.${row.id}`,
      { data_based: updatedDataBased }
    );

    if (opResult.ok) {
      savedCount++;
    } else {
      console.error(`  X DB 저장 실패 (lp_id=${row.lp_id}): ${opResult.body}`);
      errors++;
    }
  }

  // ── 결과 출력 ──
  console.log();
  console.log("━━━ LP 3축 교차 매트릭스 결과 ━━━");
  console.log(`대상: ${allAnalysis.length}건`);
  console.log(`계산 완료: ${results.length}건`);
  console.log(`스킵: ${skipped}건`);
  if (DRY_RUN) {
    console.log(`저장: (dry-run — 실제 저장 안 함, 대상: ${savedCount}건)`);
  } else {
    console.log(`저장: ${savedCount}건`);
    if (errors > 0) console.log(`실패: ${errors}건`);
  }

  // 상위/하위 LP 샘플 출력
  if (results.length > 0) {
    console.log();
    const sorted = [...results].sort((a, b) => b.crossMatrix.combined_score - a.crossMatrix.combined_score);
    console.log("상위 5건:");
    for (const r of sorted.slice(0, 5)) {
      const { axes, combined_score, classification } = r.crossMatrix;
      console.log(`  lp_id=${r.row.lp_id.slice(0, 8)}... | ref=${axes.reference} data=${axes.data} eye=${axes.eye_tracking} | 종합=${combined_score} | ${classification}`);
    }
    console.log("하위 5건:");
    for (const r of sorted.slice(-5)) {
      const { axes, combined_score, classification } = r.crossMatrix;
      console.log(`  lp_id=${r.row.lp_id.slice(0, 8)}... | ref=${axes.reference} data=${axes.data} eye=${axes.eye_tracking} | 종합=${combined_score} | ${classification}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
