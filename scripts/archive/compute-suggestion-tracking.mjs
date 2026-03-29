#!/usr/bin/env node
/**
 * 제안→결과 추적 (순환 학습 루프 닫기)
 *
 * change_log에서 performance_before / performance_after가 있는 항목을 분석하여
 * 각 요소 변경이 실제로 긍정/부정 결과를 가져왔는지 추적한다.
 *
 * "리뷰 추가 → 전환율 +44%" 같은 제안을 했을 때, 실제로 추가한 사람의 성과가
 * 어떻게 변했는지 추적하는 스크립트.
 *
 * Usage:
 *   node scripts/compute-suggestion-tracking.mjs [--dry-run] [--min-days 3]
 *
 * Options:
 *   --dry-run     DB 업데이트 안 함
 *   --min-days N  before/after 각각 최소 N일 데이터 필요 (기본: 3)
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sbGet } from "./lib/db-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const MIN_DAYS_IDX = process.argv.indexOf("--min-days");
const MIN_DAYS = MIN_DAYS_IDX !== -1 ? parseInt(process.argv[MIN_DAYS_IDX + 1], 10) : 3;

// ── 수학 헬퍼 ──
function avg(arr) {
  const valid = arr.filter((v) => v != null && !isNaN(v) && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function round(v, d = 2) {
  if (v == null) return null;
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

// ── 결과 판정 ──
function classifyOutcome(perfChange) {
  if (!perfChange || typeof perfChange !== "object") return "unknown";

  const roasPct = perfChange.roas_pct ?? 0;
  const purchasesPct = perfChange.purchases_pct ?? 0;
  const ctrPct = perfChange.ctr_pct ?? 0;

  // 주요 지표(ROAS, 구매)가 모두 양수 → positive
  // 하나라도 크게 음수(-10% 이상) → negative
  // 나머지 → neutral

  const positiveSignals = [
    roasPct > 5,
    purchasesPct > 5,
    ctrPct > 5,
  ].filter(Boolean).length;

  const negativeSignals = [
    roasPct < -10,
    purchasesPct < -10,
    ctrPct < -10,
  ].filter(Boolean).length;

  if (positiveSignals >= 2) return "positive";
  if (negativeSignals >= 1) return "negative";
  if (positiveSignals >= 1) return "slightly_positive";
  return "neutral";
}

// ── element_diff에서 변화 항목 추출 ──
function extractChangeFields(elementDiff) {
  if (!elementDiff) return [];

  if (Array.isArray(elementDiff.changes)) {
    return elementDiff.changes.map((c) => c.field || c.element || "unknown");
  }

  return Object.keys(elementDiff).filter(
    (k) => k !== "changes" && k !== "metadata"
  );
}

// ── main ──
async function main() {
  console.log(`제안→결과 추적${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`최소 데이터 일수: ${MIN_DAYS}일`);
  console.log();

  // 1. change_log에서 before/after 모두 있는 항목 조회
  console.log("[1/4] change_log 조회 중 (performance_before + performance_after 채워진 항목)...");

  let logs;
  try {
    logs = await sbGet(
      `/change_log?select=id,entity_type,entity_id,account_id,change_type,element_diff,performance_before,performance_after,performance_change,confidence,change_detected_at` +
      `&performance_before=not.is.null&performance_after=not.is.null` +
      `&order=change_detected_at.desc&limit=1000`
    );
  } catch (err) {
    console.error("change_log 조회 실패:", err.message);
    logs = [];
  }

  console.log(`  조회된 항목: ${logs.length}건`);

  if (logs.length === 0) {
    console.log("  추적 가능한 데이터가 없습니다.");
    console.log("  track-performance 크론 실행 후 다시 시도하세요.");
    return;
  }

  // 2. 필터링: before/after에 충분한 데이터가 있는 항목만
  console.log("\n[2/4] 데이터 품질 필터링 중...");

  const qualifiedLogs = logs.filter((log) => {
    const before = log.performance_before;
    const after = log.performance_after;

    // 빈 객체 체크 (ad_id 없어서 빈값으로 마킹된 경우)
    if (!before || !after) return false;
    if (Object.keys(before).length === 0 || Object.keys(after).length === 0) return false;

    // 최소 데이터 일수 체크
    const beforeDays = before.days ?? 0;
    const afterDays = after.days ?? 0;
    return beforeDays >= MIN_DAYS && afterDays >= MIN_DAYS;
  });

  console.log(`  품질 통과: ${qualifiedLogs.length}건 / ${logs.length}건`);

  if (qualifiedLogs.length === 0) {
    console.log("  충분한 품질의 데이터가 없습니다.");
    return;
  }

  // 3. 변화 유형별 결과 추적
  console.log("\n[3/4] 변화 유형별 결과 추적 중...");

  // field별 결과 추적
  const fieldTracking = new Map();
  // change_type별 결과 추적
  const typeTracking = new Map();

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const log of qualifiedLogs) {
    const outcome = classifyOutcome(log.performance_change);

    if (outcome === "positive" || outcome === "slightly_positive") positiveCount++;
    else if (outcome === "negative") negativeCount++;
    else neutralCount++;

    const changeType = log.change_type || "unknown";
    const fields = extractChangeFields(log.element_diff);

    // change_type 추적
    if (!typeTracking.has(changeType)) {
      typeTracking.set(changeType, {
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
        roas_pcts: [],
        ctr_pcts: [],
      });
    }
    const typeBucket = typeTracking.get(changeType);
    typeBucket.total++;
    if (outcome === "positive" || outcome === "slightly_positive") typeBucket.positive++;
    else if (outcome === "negative") typeBucket.negative++;
    else typeBucket.neutral++;
    if (log.performance_change?.roas_pct != null) typeBucket.roas_pcts.push(log.performance_change.roas_pct);
    if (log.performance_change?.ctr_pct != null) typeBucket.ctr_pcts.push(log.performance_change.ctr_pct);

    // field 추적
    for (const field of fields) {
      if (!fieldTracking.has(field)) {
        fieldTracking.set(field, {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
          roas_pcts: [],
          ctr_pcts: [],
          purchases_pcts: [],
        });
      }
      const bucket = fieldTracking.get(field);
      bucket.total++;
      if (outcome === "positive" || outcome === "slightly_positive") bucket.positive++;
      else if (outcome === "negative") bucket.negative++;
      else bucket.neutral++;
      if (log.performance_change?.roas_pct != null) bucket.roas_pcts.push(log.performance_change.roas_pct);
      if (log.performance_change?.ctr_pct != null) bucket.ctr_pcts.push(log.performance_change.ctr_pct);
      if (log.performance_change?.purchases_pct != null) bucket.purchases_pcts.push(log.performance_change.purchases_pct);
    }
  }

  // 4. 신뢰도 점수 계산 + 결과 출력
  console.log("\n[4/4] 신뢰도 점수 계산 + 결과 출력...");
  console.log();
  console.log("━━━ 제안→결과 추적 ━━━");
  console.log(`총 분석: ${qualifiedLogs.length}건`);
  console.log(`긍정: ${positiveCount}건, 부정: ${negativeCount}건, 중립: ${neutralCount}건`);
  console.log();

  // field별 신뢰도 점수 계산
  const suggestionConfidence = [];

  for (const [field, bucket] of fieldTracking) {
    const successRate = bucket.total > 0
      ? round((bucket.positive / bucket.total) * 100)
      : 0;

    // 신뢰도 점수: (긍정 비율 × 0.6) + (샘플 수 보정 × 0.4)
    const sampleFactor = Math.min(bucket.total / 20, 1); // 20건 이상이면 최대
    const confidenceScore = round(
      (successRate / 100) * 0.6 + sampleFactor * 0.4
    );

    const avgRoasPct = round(avg(bucket.roas_pcts));
    const avgCtrPct = round(avg(bucket.ctr_pcts));
    const avgPurchasesPct = round(avg(bucket.purchases_pcts));

    suggestionConfidence.push({
      field,
      total: bucket.total,
      positive: bucket.positive,
      negative: bucket.negative,
      neutral: bucket.neutral,
      success_rate: successRate,
      confidence_score: confidenceScore,
      avg_roas_change_pct: avgRoasPct,
      avg_ctr_change_pct: avgCtrPct,
      avg_purchases_change_pct: avgPurchasesPct,
    });
  }

  // 신뢰도 순으로 정렬
  suggestionConfidence.sort((a, b) => b.confidence_score - a.confidence_score);

  console.log("필드별 제안 신뢰도:");
  console.log(
    `  ${"필드".padEnd(25)} ${"성공률".padEnd(10)} ${"신뢰도".padEnd(10)} ${"ROAS%".padEnd(10)} ${"CTR%".padEnd(10)} ${"샘플"}`
  );
  console.log(`  ${"─".repeat(80)}`);

  for (const item of suggestionConfidence) {
    console.log(
      `  ${item.field.padEnd(25)} ${(item.success_rate + "%").padEnd(10)} ${String(item.confidence_score).padEnd(10)} ${(item.avg_roas_change_pct != null ? (item.avg_roas_change_pct >= 0 ? "+" : "") + item.avg_roas_change_pct + "%" : "N/A").padEnd(10)} ${(item.avg_ctr_change_pct != null ? (item.avg_ctr_change_pct >= 0 ? "+" : "") + item.avg_ctr_change_pct + "%" : "N/A").padEnd(10)} ${item.total}`
    );
  }

  console.log();
  console.log("변화 타입별 결과:");
  for (const [type, bucket] of typeTracking) {
    const successRate =
      bucket.total > 0
        ? round((bucket.positive / bucket.total) * 100)
        : 0;
    console.log(
      `  ${type}: 전체 ${bucket.total}건, 긍정 ${bucket.positive}건, 성공률 ${successRate}%`
    );
  }

  // 결과 저장
  const result = {
    generated_at: new Date().toISOString(),
    total_tracked: qualifiedLogs.length,
    summary: { positive: positiveCount, negative: negativeCount, neutral: neutralCount },
    suggestion_confidence: suggestionConfidence,
    type_tracking: Object.fromEntries(
      [...typeTracking].map(([k, v]) => [
        k,
        {
          total: v.total,
          positive: v.positive,
          negative: v.negative,
          neutral: v.neutral,
          avg_roas_pct: round(avg(v.roas_pcts)),
          avg_ctr_pct: round(avg(v.ctr_pcts)),
        },
      ])
    ),
  };

  // JSON 파일 저장
  const outPath = resolve(__dirname, "suggestion-tracking-output.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n결과 저장: scripts/suggestion-tracking-output.json`);

  console.log("\n제안→결과 추적 완료.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
