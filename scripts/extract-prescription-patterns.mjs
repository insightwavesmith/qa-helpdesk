#!/usr/bin/env node
/**
 * 처방 패턴 추출 스크립트
 *
 * daily_ad_insights + creative_media.analysis_json을 JOIN하여
 * ATTRIBUTE_AXIS_MAP 14속성 × METRIC_GROUPS 지표별로 집계하고
 * prescription_patterns 테이블에 UPSERT.
 *
 * Usage:
 *   node scripts/extract-prescription-patterns.mjs [--dry-run] [--category CATEGORY] [--limit N]
 *
 * CLT 기반 confidence:
 *   N≥100: high  (작은 효과크기 감지 가능)
 *   N≥30:  medium (CLT 정규 근사 적용 가능)
 *   N<30:  low
 */

import { rawQuery, closePool } from './lib/db-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const CAT_IDX = process.argv.indexOf('--category');
const FILTER_CATEGORY = CAT_IDX !== -1 ? process.argv[CAT_IDX + 1] : null;
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 10000;

// ── ATTRIBUTE_AXIS_MAP (metric-groups.ts와 동기화) ────────────────────

const ATTRIBUTE_AXIS_MAP = [
  { attribute: 'hook.hook_type', axis: 'hook' },
  { attribute: 'hook.visual_style', axis: 'hook' },
  { attribute: 'hook.composition', axis: 'hook' },
  { attribute: 'visual.color_scheme', axis: 'visual' },
  { attribute: 'visual.product_visibility', axis: 'visual' },
  { attribute: 'text.headline_type', axis: 'text' },   // analysis_json의 실제 키
  { attribute: 'text.cta_text', axis: 'text' },
  { attribute: 'text.readability', axis: 'text' },
  { attribute: 'psychology.emotion', axis: 'psychology' },
  { attribute: 'psychology.social_proof_type', axis: 'psychology' },  // 실제 키
  { attribute: 'psychology.urgency', axis: 'psychology' },
  { attribute: 'psychology.authority', axis: 'psychology' },
  { attribute: 'quality.production_quality', axis: 'quality' },
  { attribute: 'quality.brand_consistency', axis: 'quality' },
];

// prescription_patterns.attribute에 저장할 키 (ATTRIBUTE_AXIS_MAP의 attribute)
const ATTRIBUTE_KEY_MAP = {
  'text.headline_type': 'text.headline',           // → display key
  'psychology.social_proof_type': 'psychology.social_proof',  // → display key
};

// ── METRIC_GROUPS (metric-groups.ts와 동기화) ─────────────────────────

const METRICS = [
  'video_p3s_rate', 'thruplay_rate', 'retention_rate',
  'reactions_per_10k', 'comments_per_10k', 'shares_per_10k',
  'saves_per_10k', 'engagement_per_10k',
  'ctr', 'click_to_checkout_rate', 'click_to_purchase_rate',
  'checkout_to_purchase_rate', 'reach_to_purchase_rate', 'roas',
];

// ── CLT 기반 confidence 결정 ─────────────────────────────────────────

function determineConfidence(n) {
  if (n >= 100) return 'high';
  if (n >= 30) return 'medium';
  return 'low';
}

// ── lift_ci_lower 계산 (95% 신뢰구간 하한) ───────────────────────────
// lift = (avg - overall_avg) / overall_avg × 100
// SE ≈ stddev / sqrt(N) → CI_lower = lift - 1.96 * SE_lift

function calculateLiftCiLower(attrAvg, overallAvg, stddev, n) {
  if (overallAvg === 0 || n === 0) return null;
  const lift = ((attrAvg - overallAvg) / overallAvg) * 100;
  if (stddev === null || stddev === undefined) return null;
  const seLift = (stddev / overallAvg / Math.sqrt(n)) * 100;
  return Math.round((lift - 1.96 * seLift) * 100) / 100;
}

// ── analysis_json에서 속성값 추출 ────────────────────────────────────

function getAttrValue(analysisJson, attrPath) {
  if (!analysisJson || typeof analysisJson !== 'object') return null;
  const parts = attrPath.split('.');
  let obj = analysisJson;
  for (const p of parts) {
    if (!obj || typeof obj !== 'object') return null;
    obj = obj[p];
  }
  return typeof obj === 'string' ? obj : null;
}

// ── 메인 ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[extract-patterns] 시작 (dry_run=${DRY_RUN}, category=${FILTER_CATEGORY ?? 'ALL'})`);

  // 1. daily_ad_insights + creative_media + creatives JOIN으로 데이터 수집
  let sql = `
    SELECT
      dai.*,
      cm.analysis_json,
      cr.category
    FROM daily_ad_insights dai
    JOIN creative_media cm ON cm.creative_id = dai.creative_id
    JOIN creatives cr ON cr.id = dai.creative_id
    WHERE cm.analysis_json IS NOT NULL
  `;
  const params = [];

  if (FILTER_CATEGORY) {
    sql += ` AND cr.category = $${params.length + 1}`;
    params.push(FILTER_CATEGORY);
  }

  sql += ` LIMIT ${LIMIT}`;

  console.log('[extract-patterns] 데이터 조회 중...');
  const rows = await rawQuery(sql, params);
  console.log(`[extract-patterns] ${rows.length}개 레코드 로드`);

  if (rows.length === 0) {
    console.log('[extract-patterns] 데이터 없음. 종료.');
    await closePool();
    return;
  }

  // 2. 전체 평균 계산 (lift 기준선)
  const overallAvgs = {};
  const overallStddevs = {};
  for (const metric of METRICS) {
    const values = rows.map(r => Number(r[metric])).filter(v => !isNaN(v) && v !== null);
    if (values.length > 0) {
      overallAvgs[metric] = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, v) => a + Math.pow(v - overallAvgs[metric], 2), 0) / values.length;
      overallStddevs[metric] = Math.sqrt(variance);
    }
  }

  // 3. 속성별 집계
  // key: `${attribute}::${value}::${category}` → { metric → [values] }
  const aggregationMap = new Map();

  for (const row of rows) {
    const { analysis_json, category } = row;
    const catKey = category ?? 'ALL';

    for (const { attribute, axis } of ATTRIBUTE_AXIS_MAP) {
      const value = getAttrValue(analysis_json, attribute);
      if (!value) continue;

      // 카테고리별 + 전체(NULL) 두 가지로 집계
      for (const catScope of [catKey, 'ALL']) {
        const mapKey = `${attribute}::${value}::${catScope}`;

        if (!aggregationMap.has(mapKey)) {
          aggregationMap.set(mapKey, {
            attribute: ATTRIBUTE_KEY_MAP[attribute] ?? attribute,
            value,
            axis,
            category: catScope === 'ALL' ? null : catScope,
            metrics: {},
          });
        }

        const entry = aggregationMap.get(mapKey);

        for (const metric of METRICS) {
          const v = Number(row[metric]);
          if (!isNaN(v) && row[metric] !== null) {
            if (!entry.metrics[metric]) entry.metrics[metric] = [];
            entry.metrics[metric].push(v);
          }
        }
      }
    }
  }

  console.log(`[extract-patterns] ${aggregationMap.size}개 조합 집계 완료`);

  // 4. 패턴 계산 + UPSERT
  let upserted = 0;
  let skipped = 0;
  const errors = [];

  for (const [, entry] of aggregationMap) {
    for (const metric of METRICS) {
      const values = entry.metrics[metric];
      if (!values || values.length === 0) continue;

      const n = values.length;
      const avg = values.reduce((a, b) => a + b, 0) / n;
      const sorted = [...values].sort((a, b) => a - b);
      const median = n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];

      const overallAvg = overallAvgs[metric] ?? 0;
      const liftVsAverage = overallAvg > 0
        ? Math.round(((avg - overallAvg) / overallAvg) * 10000) / 100
        : null;

      const variance = values.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / n;
      const stddev = Math.sqrt(variance);
      const liftCiLower = overallAvg > 0
        ? calculateLiftCiLower(avg, overallAvg, stddev, n)
        : null;

      const confidence = determineConfidence(n);

      const pattern = {
        attribute: entry.attribute,
        value: entry.value,
        axis: entry.axis,
        metric,
        avg_value: Math.round(avg * 10000) / 10000,
        median_value: Math.round(median * 10000) / 10000,
        sample_count: n,
        confidence,
        lift_vs_average: liftVsAverage,
        lift_ci_lower: liftCiLower,
        category: entry.category,
        source: 'internal',
        calculated_at: new Date().toISOString(),
      };

      if (DRY_RUN) {
        if (upserted < 3) {
          console.log('[DRY-RUN] 샘플:', JSON.stringify(pattern, null, 2));
        }
        upserted++;
        continue;
      }

      try {
        await rawQuery(`
          INSERT INTO prescription_patterns
            (attribute, value, axis, metric, avg_value, median_value, sample_count,
             confidence, lift_vs_average, lift_ci_lower, category, source, calculated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (attribute, value, metric, category, source)
          DO UPDATE SET
            axis = EXCLUDED.axis,
            avg_value = EXCLUDED.avg_value,
            median_value = EXCLUDED.median_value,
            sample_count = EXCLUDED.sample_count,
            confidence = EXCLUDED.confidence,
            lift_vs_average = EXCLUDED.lift_vs_average,
            lift_ci_lower = EXCLUDED.lift_ci_lower,
            calculated_at = EXCLUDED.calculated_at
        `, [
          pattern.attribute, pattern.value, pattern.axis, pattern.metric,
          pattern.avg_value, pattern.median_value, pattern.sample_count,
          pattern.confidence, pattern.lift_vs_average, pattern.lift_ci_lower,
          pattern.category, pattern.source, pattern.calculated_at,
        ]);
        upserted++;
      } catch (e) {
        errors.push(e.message);
        skipped++;
      }
    }
  }

  console.log(`\n[extract-patterns] 완료`);
  console.log(`  upserted: ${upserted}`);
  console.log(`  skipped: ${skipped}`);
  if (errors.length > 0) {
    console.log(`  errors (첫 3개):`, errors.slice(0, 3));
  }

  await closePool();
}

main().catch(e => {
  console.error('[extract-patterns] 치명적 오류:', e);
  process.exit(1);
});
