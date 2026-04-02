#!/usr/bin/env node
/**
 * 소재 점수 백분위 계산 스크립트
 *
 * creative_media.analysis_json을 카테고리별로 비교해
 * scores(visual_impact, message_clarity, cta_effectiveness, social_proof_score, overall)를
 * 계산하고 analysis_json.scores 필드를 업데이트한다.
 *
 * Usage:
 *   node scripts/compute-score-percentiles.mjs
 *   node scripts/compute-score-percentiles.mjs --dry-run
 *   node scripts/compute-score-percentiles.mjs --category 뷰티
 *
 * 전제 조건:
 *   - creative_media.analysis_json이 v3 스키마로 채워진 후 실행
 *   - creatives → ad_accounts → profiles.category 조인 가능
 *
 * B7 수정: profiles!inner → profiles (LEFT JOIN) — 카테고리 NULL 계정 누락 방지
 * B8 수정: PATCH 동시 처리 (10건씩 병렬)
 * B11 수정: scripts/lib/env.mjs 공용 파서 사용
 */

import { sbGet, sbPatch, rawQuery } from "./lib/db-helpers.mjs";

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const CAT_IDX = process.argv.indexOf("--category");
const FILTER_CATEGORY = CAT_IDX !== -1 ? process.argv[CAT_IDX + 1] : null;
const MIN_SAMPLE = 50; // 카테고리별 최소 샘플 수
const PATCH_CONCURRENCY = 10; // B8: 동시 PATCH 수

// ── 점수 계산 함수 ──

function qualityToScore(quality) {
  const map = { professional: 100, semi: 70, ugc: 50, low: 20 };
  return map[quality] ?? 50;
}

function contrastToScore(contrast) {
  const map = { high: 100, medium: 60, low: 30 };
  return map[contrast] ?? 60;
}

function readabilityToScore(readability) {
  const map = { high: 100, medium: 60, low: 20 };
  return map[readability] ?? 60;
}

function computeVisualImpact(analysis) {
  const ctaScore = (analysis?.attention?.cta_attention_score ?? 0.5) * 100;
  const prodScore = qualityToScore(analysis?.quality?.production_quality);
  const contScore = contrastToScore(analysis?.visual?.color?.contrast);
  return Math.round(ctaScore * 0.4 + prodScore * 0.3 + contScore * 0.3);
}

function computeMessageClarity(analysis) {
  let score = 0;
  const text = analysis?.text;
  if (text?.key_message && text.key_message !== "핵심 메시지 (한국어)") score += 25;
  if (text?.cta_text && text.cta_text !== "CTA 문구") score += 25;
  if (text?.headline_type && text.headline_type !== "none") score += 20;
  const readScore = readabilityToScore(analysis?.quality?.readability);
  score += Math.round(readScore * 0.3);
  return Math.min(100, score);
}

function computeCtaEffectiveness(analysis) {
  return Math.round((analysis?.attention?.cta_attention_score ?? 0.5) * 100);
}

function computeSocialProofScore(analysis) {
  const spType = analysis?.psychology?.social_proof_type;
  const hasSpType = spType && spType !== "none";

  const sp = analysis?.text?.social_proof;
  const hasSpText = sp && (sp.review_shown || sp.before_after || sp.testimonial || sp.numbers);

  if (hasSpType || hasSpText) return 80;
  return 20;
}

function computeOverall(vi, mc, cta, sp) {
  return Math.round(vi * 0.3 + mc * 0.25 + cta * 0.25 + sp * 0.2);
}

function percentileOf(value, sortedValues) {
  if (sortedValues.length === 0) return 50;
  const rank = sortedValues.filter((v) => v <= value).length;
  return Math.round((rank / sortedValues.length) * 100);
}

// ── main ──
async function main() {
  console.log(`소재 점수 백분위 계산${DRY_RUN ? " (dry-run)" : ""}`);
  if (FILTER_CATEGORY) console.log(`카테고리 필터: ${FILTER_CATEGORY}`);
  console.log();

  // 1. creative_media에서 analysis_json NOT NULL 전체 조회
  const PAGE_SIZE = 1000;
  let cmRows = [];
  let offset = 0;

  console.log("creative_media 조회 중...");
  let hasAnalysisCol = true;
  try {
    while (true) {
      const batch = await rawQuery(`
        SELECT cm.id, cm.analysis_json, c.ad_id, c.account_id
        FROM creative_media cm
        INNER JOIN creatives c ON cm.creative_id = c.id
        WHERE cm.analysis_json IS NOT NULL
        ORDER BY cm.id ASC
        OFFSET $1 LIMIT $2
      `, [offset, PAGE_SIZE]);
      cmRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (e) {
    if (e.message.includes("analysis_json")) {
      console.log("  analysis_json 컬럼 미생성 — 스크립트를 analyze-five-axis.mjs --mode final 실행 후 다시 사용하세요.");
      hasAnalysisCol = false;
    } else {
      throw e;
    }
  }

  console.log(`조회 완료: ${cmRows.length}건`);

  if (!hasAnalysisCol || cmRows.length === 0) {
    console.log("분석된 소재가 없습니다. 먼저 analyze-five-axis.mjs --mode final을 실행하세요.");
    return;
  }

  // 2. ad_accounts.account_id → category 매핑 로드
  //    B7: profiles!inner → profiles (LEFT JOIN) — category NULL이어도 누락 안 됨
  console.log("카테고리 매핑 로드 중...");
  const accountCategoryMap = new Map();
  let aaOffset = 0;
  while (true) {
    const batch = await rawQuery(`
      SELECT aa.account_id, p.category
      FROM ad_accounts aa
      LEFT JOIN profiles p ON aa.user_id = p.id
      ORDER BY aa.id ASC
      OFFSET $1 LIMIT $2
    `, [aaOffset, PAGE_SIZE]);
    for (const r of batch) {
      // B7: profiles가 null이면 (LEFT JOIN), "기타"로 폴백
      const cat = r.category || "기타";
      accountCategoryMap.set(String(r.account_id), cat);
    }
    if (batch.length < PAGE_SIZE) break;
    aaOffset += PAGE_SIZE;
  }
  console.log(`카테고리 매핑: ${accountCategoryMap.size}개 계정`);

  // B7: 매핑 안 된 계정 진단
  const unmappedAccounts = new Set();
  for (const row of cmRows) {
    const aid = String(row.account_id || "");
    if (aid && !accountCategoryMap.has(aid)) unmappedAccounts.add(aid);
  }
  if (unmappedAccounts.size > 0) {
    console.log(`  ⚠ ad_accounts에 없는 계정 ${unmappedAccounts.size}개 → "기타" 처리`);
  }

  // 카테고리별 분류
  const byCategory = {};

  for (const row of cmRows) {
    const accountId = String(row.account_id || "");
    const category = accountCategoryMap.get(accountId) || "기타";

    if (FILTER_CATEGORY && category !== FILTER_CATEGORY) continue;

    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(row);

    if (!byCategory["전체"]) byCategory["전체"] = [];
    byCategory["전체"].push(row);
  }

  const categories = Object.keys(byCategory).filter((c) => c !== "전체");
  console.log(`카테고리: ${categories.join(", ")} (전체 포함 ${Object.keys(byCategory).length}개)`);
  console.log();

  // 3. 카테고리별 점수 분포 사전 계산
  const categoryScoreArrays = {};

  for (const [cat, rows] of Object.entries(byCategory)) {
    const arrays = {
      overall: [],
      visual_impact: [],
      message_clarity: [],
      cta_effectiveness: [],
      social_proof_score: [],
    };

    for (const row of rows) {
      const a = row.analysis_json;
      arrays.visual_impact.push(computeVisualImpact(a));
      arrays.message_clarity.push(computeMessageClarity(a));
      arrays.cta_effectiveness.push(computeCtaEffectiveness(a));
      arrays.social_proof_score.push(computeSocialProofScore(a));
      arrays.overall.push(
        computeOverall(
          computeVisualImpact(a),
          computeMessageClarity(a),
          computeCtaEffectiveness(a),
          computeSocialProofScore(a)
        )
      );
    }

    for (const key of Object.keys(arrays)) {
      arrays[key] = arrays[key].slice().sort((a, b) => a - b);
    }

    categoryScoreArrays[cat] = arrays;
  }

  // 4. 개별 소재 점수 계산 + DB 업데이트
  let success = 0;
  let errors = 0;
  let skipped = 0;

  const targetRows = FILTER_CATEGORY ? (byCategory[FILTER_CATEGORY] || []) : cmRows;
  console.log(`점수 계산 대상: ${targetRows.length}건\n`);

  // B8: 동시 PATCH 처리를 위한 행별 점수 사전 계산
  const rowUpdates = [];

  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i];
    const a = row.analysis_json;
    const accountId = String(row.account_id || "");
    const category = accountCategoryMap.get(accountId) || "기타";

    const vi = computeVisualImpact(a);
    const mc = computeMessageClarity(a);
    const cta = computeCtaEffectiveness(a);
    const sp = computeSocialProofScore(a);
    const overall = computeOverall(vi, mc, cta, sp);

    const catRows = byCategory[category] || [];
    const useCat = catRows.length >= MIN_SAMPLE ? category : "전체";
    const refArrays = categoryScoreArrays[useCat] || categoryScoreArrays["전체"];

    if (!refArrays) {
      skipped++;
      continue;
    }

    const overallPct = percentileOf(overall, refArrays.overall);
    const benchmarkCategory = catRows.length >= MIN_SAMPLE ? category : "전체";
    const benchmarkSampleSize = (byCategory[benchmarkCategory] || byCategory["전체"] || []).length;

    const suggestions = [];
    if (cta < 50) suggestions.push("CTA 문구를 더 명확하게 강화하세요");
    if (vi < 50) suggestions.push("시각적 임팩트를 높이세요 (색상 대비, 제품 가시성)");
    if (mc < 50) suggestions.push("핵심 메시지를 더 간결하게 작성하세요");
    if (sp < 50) suggestions.push("소셜 증명 요소를 추가하세요 (리뷰, 후기)");

    const scores = {
      overall,
      overall_percentile: overallPct,
      visual_impact: vi,
      message_clarity: mc,
      cta_effectiveness: cta,
      social_proof_score: sp,
      benchmark_category: benchmarkCategory,
      benchmark_sample_size: benchmarkSampleSize,
      suggestions,
    };

    if (i < 3 || i % 200 === 0) {
      console.log(
        `[${i + 1}/${targetRows.length}] id=${row.id}, cat=${category} → overall=${overall} (${overallPct}%ile)`
      );
    }

    rowUpdates.push({ row, a, scores });
  }

  // B8: 배치 병렬 PATCH
  if (DRY_RUN) {
    success = rowUpdates.length;
  } else {
    for (let i = 0; i < rowUpdates.length; i += PATCH_CONCURRENCY) {
      const batch = rowUpdates.slice(i, i + PATCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ row, a, scores }) => {
          const updatedJson = { ...a, scores };
          return sbPatch("creative_media", `id=eq.${row.id}`, {
            analysis_json: updatedJson,
          });
        })
      );

      for (const patch of results) {
        if (!patch.ok) {
          errors++;
        } else {
          success++;
        }
      }

      if ((i + PATCH_CONCURRENCY) % 200 === 0) {
        console.log(`  PATCH 진행: ${Math.min(i + PATCH_CONCURRENCY, rowUpdates.length)}/${rowUpdates.length}`);
      }
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`성공: ${success}건, 실패: ${errors}건, 스킵: ${skipped}건`);

  // 통계 요약
  if (!FILTER_CATEGORY && byCategory["전체"]) {
    const all = byCategory["전체"];
    const overallScores = all.map((r) => {
      const a = r.analysis_json;
      return computeOverall(
        computeVisualImpact(a),
        computeMessageClarity(a),
        computeCtaEffectiveness(a),
        computeSocialProofScore(a)
      );
    });
    const avg = Math.round(overallScores.reduce((s, v) => s + v, 0) / overallScores.length);
    console.log(`\n전체 overall 평균: ${avg}점`);
    for (const cat of categories) {
      const cnt = byCategory[cat]?.length || 0;
      console.log(`  ${cat}: ${cnt}건${cnt < MIN_SAMPLE ? " (샘플 부족 → 전체 기준 사용)" : ""}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
