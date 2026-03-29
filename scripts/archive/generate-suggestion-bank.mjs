#!/usr/bin/env node
/**
 * 제안 뱅크 생성 — "다음 수강생 제안에 활용"
 *
 * change_log의 변화→성과 데이터를 종합하여
 * 신뢰도 기반 제안 목록(Suggestion Bank)을 생성한다.
 *
 * 입력:
 *   - change_log (element_diff + performance_change)
 *   - compute-change-insights.mjs 출력 (있으면 참조)
 *   - compute-suggestion-tracking.mjs 출력 (있으면 참조)
 *
 * 출력:
 *   - ranked 제안 목록: { suggestion, avg_impact, confidence, sample_size }
 *   - lp_analysis.data_based.suggested_actions에 저장 (옵션)
 *
 * Usage:
 *   node scripts/generate-suggestion-bank.mjs [--dry-run] [--save-to-lp]
 *
 * Options:
 *   --dry-run     DB 업데이트 안 함
 *   --save-to-lp  lp_analysis.data_based에 suggested_actions 키로 저장
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sbGet, sbPatch } from "./lib/db-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const SAVE_TO_LP = process.argv.includes("--save-to-lp");

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

// ── 필드명 → 한국어 제안 문구 ──
const FIELD_SUGGESTION_MAP = {
  // LP 요소
  reviews_present: "리뷰 섹션 추가",
  sticky_cta: "고정 CTA 버튼 적용",
  urgency_timer: "긴급성 타이머 추가",
  trust_certification: "인증/신뢰 마크 추가",
  easy_pay_available: "간편결제 도입",
  brand_story: "브랜드 스토리 추가",
  photo_reviews: "포토 리뷰 추가",
  objection_handling: "반론 처리 섹션 추가",
  // 소재 요소
  hook_type: "훅 유형 변경",
  style: "소재 스타일 변경",
  cta_type: "CTA 유형 변경",
  cta_position: "CTA 위치 변경",
  color_tone: "색상 톤 변경",
  color_contrast: "색상 대비 변경",
  format: "소재 포맷 변경",
  human_presence: "인물 사용 변경",
  has_bgm: "BGM 추가/변경",
  // 소재 카피/이미지
  ad_copy: "광고 카피 변경",
  image: "소재 이미지 교체",
  video: "소재 영상 교체",
  headline: "헤드라인 변경",
  description: "설명 문구 변경",
  cta_text: "CTA 문구 변경",
};

function getSuggestionText(field) {
  return FIELD_SUGGESTION_MAP[field] || `${field} 변경`;
}

// ── 로컬 JSON 파일 로드 (있으면) ──
function loadJsonFile(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {
    // 파일 로드 실패는 무시
  }
  return null;
}

// ── main ──
async function main() {
  console.log(`제안 뱅크 생성${DRY_RUN ? " (dry-run)" : ""}`);
  console.log();

  // 1. 기존 분석 결과 로드 (있으면 참조)
  console.log("[1/5] 기존 분석 결과 확인 중...");

  const insightsData = loadJsonFile(
    resolve(__dirname, "change-insights-output.json")
  );
  const trackingData = loadJsonFile(
    resolve(__dirname, "suggestion-tracking-output.json")
  );

  if (insightsData) {
    console.log(`  change-insights: ${insightsData.insights?.length || 0}건 로드`);
  } else {
    console.log("  change-insights: 파일 없음 (change_log에서 직접 계산)");
  }

  if (trackingData) {
    console.log(`  suggestion-tracking: ${trackingData.suggestion_confidence?.length || 0}건 로드`);
  } else {
    console.log("  suggestion-tracking: 파일 없음 (change_log에서 직접 계산)");
  }

  // 2. change_log에서 직접 데이터 수집
  console.log("\n[2/5] change_log 직접 조회 중...");

  let logs = [];
  try {
    logs = await sbGet(
      `/change_log?select=id,entity_type,change_type,element_diff,performance_change,confidence` +
      `&performance_change=not.is.null&element_diff=not.is.null` +
      `&order=change_detected_at.desc&limit=1000`
    );
  } catch (err) {
    console.error("  change_log 조회 실패:", err.message);
  }

  console.log(`  change_log 항목: ${logs.length}건`);

  // 3. 데이터 통합 → 필드별 제안 구축
  console.log("\n[3/5] 필드별 제안 데이터 통합 중...");

  const suggestionMap = new Map();

  // 3-1. change_log 직접 데이터
  for (const log of logs) {
    if (!log.performance_change || !log.element_diff) continue;

    let fields = [];
    if (Array.isArray(log.element_diff.changes)) {
      fields = log.element_diff.changes.map((c) => c.field || c.element || "unknown");
    } else {
      fields = Object.keys(log.element_diff).filter(
        (k) => k !== "changes" && k !== "metadata"
      );
    }

    for (const field of fields) {
      if (!suggestionMap.has(field)) {
        suggestionMap.set(field, {
          roas_pcts: [],
          ctr_pcts: [],
          purchases_pcts: [],
          positive_count: 0,
          negative_count: 0,
          total: 0,
        });
      }
      const bucket = suggestionMap.get(field);
      bucket.total++;

      const pc = log.performance_change;
      if (pc.roas_pct != null) bucket.roas_pcts.push(pc.roas_pct);
      if (pc.ctr_pct != null) bucket.ctr_pcts.push(pc.ctr_pct);
      if (pc.purchases_pct != null) bucket.purchases_pcts.push(pc.purchases_pct);

      // 결과 판정
      const roasPct = pc.roas_pct ?? 0;
      const purchasesPct = pc.purchases_pct ?? 0;
      if (roasPct > 5 || purchasesPct > 5) bucket.positive_count++;
      else if (roasPct < -10 || purchasesPct < -10) bucket.negative_count++;
    }
  }

  // 3-2. 기존 분석 결과 병합 (있으면 보조 데이터로 활용)
  if (trackingData?.suggestion_confidence) {
    for (const item of trackingData.suggestion_confidence) {
      if (!suggestionMap.has(item.field)) {
        // change_log 직접 데이터에 없는 필드면 tracking 데이터 사용
        suggestionMap.set(item.field, {
          roas_pcts: item.avg_roas_change_pct != null ? [item.avg_roas_change_pct] : [],
          ctr_pcts: item.avg_ctr_change_pct != null ? [item.avg_ctr_change_pct] : [],
          purchases_pcts: item.avg_purchases_change_pct != null ? [item.avg_purchases_change_pct] : [],
          positive_count: item.positive || 0,
          negative_count: item.negative || 0,
          total: item.total || 0,
        });
      }
    }
  }

  console.log(`  통합된 필드: ${suggestionMap.size}개`);

  // 4. 제안 뱅크 생성
  console.log("\n[4/5] 제안 뱅크 생성 중...");

  const suggestionBank = [];

  for (const [field, bucket] of suggestionMap) {
    if (bucket.total === 0) continue;

    const avgRoasPct = round(avg(bucket.roas_pcts));
    const avgCtrPct = round(avg(bucket.ctr_pcts));
    const avgPurchasesPct = round(avg(bucket.purchases_pcts));

    // 가장 큰 영향 지표 선택
    const impacts = [
      { metric: "ROAS", pct: avgRoasPct },
      { metric: "CTR", pct: avgCtrPct },
      { metric: "전환율", pct: avgPurchasesPct },
    ].filter((i) => i.pct != null);

    const bestImpact = impacts.sort(
      (a, b) => Math.abs(b.pct) - Math.abs(a.pct)
    )[0];

    // 신뢰도 계산
    const successRate =
      bucket.total > 0 ? bucket.positive_count / bucket.total : 0;
    const sampleFactor = Math.min(bucket.total / 20, 1);
    const confidence = round(successRate * 0.6 + sampleFactor * 0.4);

    const suggestion = getSuggestionText(field);
    const avgImpact = bestImpact
      ? `${bestImpact.metric} ${bestImpact.pct >= 0 ? "+" : ""}${bestImpact.pct}%`
      : "데이터 부족";

    suggestionBank.push({
      suggestion,
      field,
      avg_impact: avgImpact,
      avg_roas_change_pct: avgRoasPct,
      avg_ctr_change_pct: avgCtrPct,
      avg_purchases_change_pct: avgPurchasesPct,
      confidence: round(confidence),
      sample_size: bucket.total,
      positive_rate: round(successRate * 100),
    });
  }

  // 신뢰도 × 영향도 순으로 정렬
  suggestionBank.sort((a, b) => {
    // 신뢰도 우선, 동일하면 영향도
    const aScore =
      a.confidence * 0.5 +
      Math.abs(a.avg_roas_change_pct || a.avg_ctr_change_pct || 0) * 0.005;
    const bScore =
      b.confidence * 0.5 +
      Math.abs(b.avg_roas_change_pct || b.avg_ctr_change_pct || 0) * 0.005;
    return bScore - aScore;
  });

  // 5. 결과 출력 + 저장
  console.log("\n[5/5] 결과 출력...");
  console.log();
  console.log("━━━ 제안 뱅크 (Suggestion Bank) ━━━");

  if (suggestionBank.length === 0) {
    console.log("  제안 데이터 없음 (change_log에 충분한 데이터가 쌓인 후 다시 실행하세요)");
  } else {
    console.log(
      `  ${"제안".padEnd(30)} ${"영향도".padEnd(20)} ${"신뢰도".padEnd(10)} ${"성공률".padEnd(10)} ${"샘플"}`
    );
    console.log(`  ${"─".repeat(85)}`);

    for (const item of suggestionBank) {
      console.log(
        `  ${item.suggestion.padEnd(30)} ${item.avg_impact.padEnd(20)} ${String(item.confidence).padEnd(10)} ${(item.positive_rate + "%").padEnd(10)} ${item.sample_size}`
      );
    }
  }

  // 결과 JSON
  const result = {
    generated_at: new Date().toISOString(),
    total_suggestions: suggestionBank.length,
    suggestions: suggestionBank,
  };

  // JSON 파일 저장
  const outPath = resolve(__dirname, "suggestion-bank-output.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n결과 저장: scripts/suggestion-bank-output.json`);

  // lp_analysis.data_based에 suggested_actions 저장 (--save-to-lp 옵션)
  if (SAVE_TO_LP && !DRY_RUN && suggestionBank.length > 0) {
    console.log("\nlp_analysis.data_based에 suggested_actions 저장 중...");

    try {
      // 모든 lp_analysis 조회
      const analyses = await sbGet(
        `/lp_analysis?select=id,lp_id,data_based&viewport=eq.mobile&limit=1000`
      );

      let updatedCount = 0;
      for (const row of analyses) {
        const dataBased = row.data_based || {};
        dataBased.suggested_actions = suggestionBank.slice(0, 10); // 상위 10개만
        dataBased.suggested_actions_updated_at = new Date().toISOString();

        const patchResult = await sbPatch(
          "lp_analysis",
          `id=eq.${row.id}`,
          { data_based: dataBased }
        );

        if (patchResult.ok) updatedCount++;
      }

      console.log(`  lp_analysis 업데이트: ${updatedCount}건`);
    } catch (err) {
      console.error("  lp_analysis 업데이트 실패:", err.message);
    }
  }

  console.log("\n제안 뱅크 생성 완료.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
