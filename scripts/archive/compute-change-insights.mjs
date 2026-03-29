#!/usr/bin/env node
/**
 * change_log 기반 변화→성과 패턴 추출
 *
 * change_log 테이블에서 element_diff + performance_change가 모두 채워진 항목을 조회하여
 * 변화 유형별 평균 성과 변화를 계산한다.
 *
 * 출력 예: "리뷰 섹션 추가 → 전환율 +44%", "CTA 문구 변경 → CTR +12%"
 *
 * Usage:
 *   node scripts/compute-change-insights.mjs [--dry-run] [--out <파일경로>]
 *
 * Options:
 *   --dry-run   DB 업데이트 안 함, 콘솔 출력만
 *   --out <path> JSON 파일로 결과 저장 (기본: stdout만)
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sbGet, sbPost } from "./lib/db-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const OUT_IDX = process.argv.indexOf("--out");
const OUT_PATH = OUT_IDX !== -1 ? process.argv[OUT_IDX + 1] : null;

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

// ── 변화 유형 라벨 매핑 (한국어) ──
const CHANGE_TYPE_LABELS = {
  element_added: "요소 추가",
  element_removed: "요소 제거",
  element_modified: "요소 변경",
  new_version: "새 버전",
};

// ── element_diff에서 변화 항목 추출 ──
function extractChangeItems(elementDiff) {
  if (!elementDiff) return [];

  const items = [];

  // element_diff.changes 배열이 있는 경우
  if (Array.isArray(elementDiff.changes)) {
    for (const change of elementDiff.changes) {
      items.push({
        field: change.field || change.element || "unknown",
        type: change.type || "modified",
        from: change.from ?? null,
        to: change.to ?? null,
      });
    }
    return items;
  }

  // element_diff가 직접 key-value 쌍인 경우
  for (const [key, val] of Object.entries(elementDiff)) {
    if (key === "changes" || key === "metadata") continue;
    items.push({
      field: key,
      type: typeof val === "object" && val !== null ? (val.type || "modified") : "modified",
      from: typeof val === "object" && val !== null ? val.from : null,
      to: typeof val === "object" && val !== null ? val.to : val,
    });
  }

  return items;
}

// ── 성과 변화에서 주요 지표 추출 ──
function extractPerformanceMetrics(perfChange) {
  if (!perfChange || typeof perfChange !== "object") return null;

  return {
    roas_pct: perfChange.roas_pct ?? null,
    ctr_pct: perfChange.ctr_pct ?? null,
    purchases_pct: perfChange.purchases_pct ?? null,
    spend_pct: perfChange.spend_pct ?? null,
    clicks_pct: perfChange.clicks_pct ?? null,
    cpc_pct: perfChange.cpc_pct ?? null,
  };
}

// ── main ──
async function main() {
  console.log(`change_log 기반 변화→성과 패턴 추출${DRY_RUN ? " (dry-run)" : ""}`);
  console.log();

  // 1. change_log에서 element_diff + performance_change가 모두 채워진 항목 조회
  console.log("[1/4] change_log 조회 중 (element_diff + performance_change 채워진 항목)...");

  let logs;
  try {
    logs = await sbGet(
      `/change_log?select=id,entity_type,entity_id,account_id,change_type,element_diff,performance_change,confidence,change_detected_at` +
      `&element_diff=not.is.null&performance_change=not.is.null` +
      `&order=change_detected_at.desc&limit=1000`
    );
  } catch (err) {
    console.error("change_log 조회 실패:", err.message);
    console.log("change_log 테이블이 비어있거나 아직 데이터가 없을 수 있습니다.");
    logs = [];
  }

  console.log(`  조회된 항목: ${logs.length}건`);

  if (logs.length === 0) {
    console.log("  분석 가능한 change_log 데이터가 없습니다.");
    console.log("  track-performance 크론이 실행되어 performance_change가 채워진 후 다시 실행하세요.");

    // 빈 결과 저장
    const emptyResult = {
      generated_at: new Date().toISOString(),
      total_logs: 0,
      insights: [],
      note: "데이터 부족 — change_log에 element_diff + performance_change가 채워진 항목 없음",
    };

    if (OUT_PATH) {
      writeFileSync(resolve(__dirname, "..", OUT_PATH), JSON.stringify(emptyResult, null, 2));
      console.log(`  빈 결과 저장: ${OUT_PATH}`);
    }
    return;
  }

  // 2. 변화 유형별 그룹핑
  console.log("\n[2/4] 변화 유형별 그룹핑 중...");

  // field별로 성과 변화를 모은다
  const fieldBuckets = new Map();
  // change_type별로도 모은다
  const typeBuckets = new Map();

  let processedCount = 0;
  let skippedCount = 0;

  for (const log of logs) {
    const perfMetrics = extractPerformanceMetrics(log.performance_change);
    if (!perfMetrics) {
      skippedCount++;
      continue;
    }

    const changeItems = extractChangeItems(log.element_diff);
    if (changeItems.length === 0) {
      skippedCount++;
      continue;
    }

    processedCount++;

    // change_type별 버킷
    const changeType = log.change_type || "unknown";
    if (!typeBuckets.has(changeType)) {
      typeBuckets.set(changeType, { metrics: [], count: 0 });
    }
    const typeBucket = typeBuckets.get(changeType);
    typeBucket.metrics.push(perfMetrics);
    typeBucket.count++;

    // field별 버킷
    for (const item of changeItems) {
      const fieldKey = `${item.field}`;
      if (!fieldBuckets.has(fieldKey)) {
        fieldBuckets.set(fieldKey, {
          field: item.field,
          metrics: [],
          count: 0,
          examples: [],
        });
      }
      const bucket = fieldBuckets.get(fieldKey);
      bucket.metrics.push(perfMetrics);
      bucket.count++;
      if (bucket.examples.length < 3) {
        bucket.examples.push({
          from: item.from,
          to: item.to,
          roas_pct: perfMetrics.roas_pct,
          ctr_pct: perfMetrics.ctr_pct,
        });
      }
    }
  }

  console.log(`  처리: ${processedCount}건, 스킵: ${skippedCount}건`);
  console.log(`  변화 필드 유형: ${fieldBuckets.size}개`);
  console.log(`  변화 타입: ${typeBuckets.size}개`);

  // 3. 인사이트 계산
  console.log("\n[3/4] 인사이트 계산 중...");

  const insights = [];

  for (const [fieldKey, bucket] of fieldBuckets) {
    const avgRoasPct = round(avg(bucket.metrics.map((m) => m.roas_pct)));
    const avgCtrPct = round(avg(bucket.metrics.map((m) => m.ctr_pct)));
    const avgPurchasesPct = round(avg(bucket.metrics.map((m) => m.purchases_pct)));
    const avgCpcPct = round(avg(bucket.metrics.map((m) => m.cpc_pct)));

    // 신뢰도: 샘플 수 기반
    const confidence =
      bucket.count >= 20 ? "high" : bucket.count >= 5 ? "medium" : "low";

    // 주요 영향 지표 결정 (가장 큰 변화)
    const impacts = [
      { metric: "ROAS", pct: avgRoasPct },
      { metric: "CTR", pct: avgCtrPct },
      { metric: "구매 전환", pct: avgPurchasesPct },
      { metric: "CPC", pct: avgCpcPct },
    ].filter((i) => i.pct != null);

    const bestImpact = impacts.sort(
      (a, b) => Math.abs(b.pct) - Math.abs(a.pct)
    )[0];

    const description = bestImpact
      ? `${fieldKey} 변경 → ${bestImpact.metric} ${bestImpact.pct >= 0 ? "+" : ""}${bestImpact.pct}%`
      : `${fieldKey} 변경 → 데이터 부족`;

    insights.push({
      field: fieldKey,
      description,
      sample_size: bucket.count,
      confidence,
      avg_roas_change_pct: avgRoasPct,
      avg_ctr_change_pct: avgCtrPct,
      avg_purchases_change_pct: avgPurchasesPct,
      avg_cpc_change_pct: avgCpcPct,
      examples: bucket.examples,
    });
  }

  // impact 크기 순으로 정렬
  insights.sort((a, b) => {
    const aImpact = Math.max(
      Math.abs(a.avg_roas_change_pct || 0),
      Math.abs(a.avg_ctr_change_pct || 0)
    );
    const bImpact = Math.max(
      Math.abs(b.avg_roas_change_pct || 0),
      Math.abs(b.avg_ctr_change_pct || 0)
    );
    return bImpact - aImpact;
  });

  // change_type별 요약
  const typeSummary = {};
  for (const [typeKey, bucket] of typeBuckets) {
    const label = CHANGE_TYPE_LABELS[typeKey] || typeKey;
    typeSummary[label] = {
      count: bucket.count,
      avg_roas_pct: round(avg(bucket.metrics.map((m) => m.roas_pct))),
      avg_ctr_pct: round(avg(bucket.metrics.map((m) => m.ctr_pct))),
    };
  }

  // 4. 결과 출력 + 저장
  console.log("\n[4/4] 결과 출력...");
  console.log();
  console.log("━━━ 변화→성과 인사이트 ━━━");
  console.log(`총 분석 건수: ${processedCount}건`);
  console.log();

  if (insights.length === 0) {
    console.log("  인사이트 없음 (데이터 부족)");
  } else {
    console.log(
      `  ${"필드".padEnd(25)} ${"설명".padEnd(40)} ${"ROAS%".padEnd(10)} ${"CTR%".padEnd(10)} ${"샘플".padEnd(6)} ${"신뢰도"}`
    );
    console.log(`  ${"─".repeat(100)}`);

    for (const insight of insights) {
      const roasStr =
        insight.avg_roas_change_pct != null
          ? `${insight.avg_roas_change_pct >= 0 ? "+" : ""}${insight.avg_roas_change_pct}%`
          : "N/A";
      const ctrStr =
        insight.avg_ctr_change_pct != null
          ? `${insight.avg_ctr_change_pct >= 0 ? "+" : ""}${insight.avg_ctr_change_pct}%`
          : "N/A";

      console.log(
        `  ${insight.field.padEnd(25)} ${insight.description.padEnd(40)} ${roasStr.padEnd(10)} ${ctrStr.padEnd(10)} ${String(insight.sample_size).padEnd(6)} ${insight.confidence}`
      );
    }
  }

  console.log();
  console.log("변화 타입별 요약:");
  for (const [label, summary] of Object.entries(typeSummary)) {
    console.log(
      `  ${label}: ${summary.count}건, ROAS ${summary.avg_roas_pct != null ? (summary.avg_roas_pct >= 0 ? "+" : "") + summary.avg_roas_pct + "%" : "N/A"}, CTR ${summary.avg_ctr_pct != null ? (summary.avg_ctr_pct >= 0 ? "+" : "") + summary.avg_ctr_pct + "%" : "N/A"}`
    );
  }

  // 결과 JSON 구성
  const result = {
    generated_at: new Date().toISOString(),
    total_logs: processedCount,
    insights,
    type_summary: typeSummary,
  };

  // JSON 파일 출력
  if (OUT_PATH) {
    const outFullPath = resolve(__dirname, "..", OUT_PATH);
    writeFileSync(outFullPath, JSON.stringify(result, null, 2));
    console.log(`\n결과 저장: ${OUT_PATH}`);
  }

  // DB 저장 (change_insights 테이블이 있으면)
  if (!DRY_RUN && insights.length > 0) {
    console.log("\nchange_insights 테이블 저장 시도 중...");
    try {
      const rows = insights.map((insight) => ({
        field_name: insight.field,
        description: insight.description,
        sample_size: insight.sample_size,
        confidence: insight.confidence,
        avg_roas_change_pct: insight.avg_roas_change_pct,
        avg_ctr_change_pct: insight.avg_ctr_change_pct,
        avg_purchases_change_pct: insight.avg_purchases_change_pct,
        avg_cpc_change_pct: insight.avg_cpc_change_pct,
        examples: insight.examples,
        calculated_at: new Date().toISOString(),
      }));

      const saveResult = await sbPost("change_insights", rows);
      if (saveResult.ok) {
        console.log(`  change_insights 저장 완료: ${rows.length}건`);
      } else {
        // 테이블이 없을 수 있음 → JSON 파일로 대체
        console.log(
          `  change_insights 테이블 없음 또는 저장 실패 (${saveResult.status}). JSON 파일로 대체 저장합니다.`
        );
        if (!OUT_PATH) {
          const fallbackPath = resolve(__dirname, "..", "data", "change-insights.json");
          try {
            writeFileSync(fallbackPath, JSON.stringify(result, null, 2));
            console.log(`  대체 저장: data/change-insights.json`);
          } catch {
            // data 폴더 없으면 scripts 폴더에 저장
            const fallback2 = resolve(__dirname, "change-insights-output.json");
            writeFileSync(fallback2, JSON.stringify(result, null, 2));
            console.log(`  대체 저장: scripts/change-insights-output.json`);
          }
        }
      }
    } catch (err) {
      console.error("  DB 저장 실패:", err.message);
    }
  }

  console.log("\n변화→성과 인사이트 추출 완료.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
