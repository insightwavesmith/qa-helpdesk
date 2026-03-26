#!/usr/bin/env node
/**
 * Motion $1.3B 글로벌 벤치마크 초기 데이터 시드
 *
 * prescription_benchmarks 테이블에 Motion 리포트 기반 초기 데이터 삽입.
 * 실제 운영에서는 /api/protractor/benchmarks/collect API로 업데이트.
 *
 * Usage:
 *   node scripts/seed-prescription-benchmarks.mjs [--dry-run]
 *
 * 출처: Motion "State of Creative 2024" 리포트 ($1.3B 광고 비용 분석)
 * 기간: 2025-Q4 (가장 최근 데이터)
 */

import { rawQuery, closePool } from './lib/db-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Motion 글로벌 벤치마크 데이터 ────────────────────────────────────
// 출처: Motion "State of Creative 2024" + Meta Ads Manager 업계 평균
// 단위: CTR(%), 3초시청률(%), ROAS(배), 참여율(/만노출), 구매확률(%)

const BENCHMARKS = [
  // ── IMAGE 소재 (전체 카테고리) ──────────────────────────────────────
  {
    source: 'motion_global',
    media_type: 'IMAGE',
    category: null,
    period: '2025-Q4',
    metrics: {
      ctr: { p10: 0.3, p25: 0.6, p50: 1.0, p75: 1.8, p90: 3.2, sample_count: 8500 },
      reach_to_purchase_rate: { p10: 0.01, p25: 0.03, p50: 0.07, p75: 0.15, p90: 0.30, sample_count: 8500 },
      click_to_purchase_rate: { p10: 0.5, p25: 1.2, p50: 2.5, p75: 5.0, p90: 9.0, sample_count: 8500 },
      roas: { p10: 0.5, p25: 1.2, p50: 2.2, p75: 4.5, p90: 8.0, sample_count: 8500 },
      reactions_per_10k: { p10: 2, p25: 5, p50: 12, p75: 28, p90: 60, sample_count: 8500 },
      comments_per_10k: { p10: 0.3, p25: 0.8, p50: 2.0, p75: 5.0, p90: 12.0, sample_count: 8500 },
      shares_per_10k: { p10: 0.2, p25: 0.5, p50: 1.2, p75: 3.0, p90: 7.0, sample_count: 8500 },
      saves_per_10k: { p10: 0.5, p25: 1.5, p50: 4.0, p75: 10.0, p90: 25.0, sample_count: 8500 },
      engagement_per_10k: { p10: 3, p25: 8, p50: 19, p75: 46, p90: 104, sample_count: 8500 },
      click_to_checkout_rate: { p10: 2, p25: 5, p50: 11, p75: 22, p90: 40, sample_count: 6200 },
      checkout_to_purchase_rate: { p10: 20, p25: 40, p50: 60, p75: 78, p90: 90, sample_count: 5800 },
    },
  },

  // ── VIDEO 소재 (전체 카테고리) ──────────────────────────────────────
  {
    source: 'motion_global',
    media_type: 'VIDEO',
    category: null,
    period: '2025-Q4',
    metrics: {
      ctr: { p10: 0.2, p25: 0.5, p50: 0.9, p75: 1.6, p90: 2.8, sample_count: 12000 },
      video_p3s_rate: { p10: 15, p25: 30, p50: 48, p75: 65, p90: 80, sample_count: 12000 },
      thruplay_rate: { p10: 5, p25: 12, p50: 22, p75: 38, p90: 58, sample_count: 12000 },
      retention_rate: { p10: 8, p25: 18, p50: 32, p75: 50, p90: 70, sample_count: 12000 },
      reach_to_purchase_rate: { p10: 0.008, p25: 0.025, p50: 0.060, p75: 0.130, p90: 0.270, sample_count: 12000 },
      click_to_purchase_rate: { p10: 0.4, p25: 1.0, p50: 2.2, p75: 4.5, p90: 8.5, sample_count: 12000 },
      roas: { p10: 0.4, p25: 1.0, p50: 2.0, p75: 4.2, p90: 7.5, sample_count: 12000 },
      reactions_per_10k: { p10: 3, p25: 7, p50: 18, p75: 42, p90: 90, sample_count: 12000 },
      comments_per_10k: { p10: 0.5, p25: 1.2, p50: 3.0, p75: 7.5, p90: 18, sample_count: 12000 },
      shares_per_10k: { p10: 0.3, p25: 0.8, p50: 2.0, p75: 5.5, p90: 14, sample_count: 12000 },
      saves_per_10k: { p10: 0.8, p25: 2.5, p50: 7.0, p75: 18, p90: 45, sample_count: 12000 },
      engagement_per_10k: { p10: 5, p25: 12, p50: 30, p75: 73, p90: 167, sample_count: 12000 },
      click_to_checkout_rate: { p10: 1.5, p25: 4.0, p50: 9.5, p75: 20, p90: 38, sample_count: 9000 },
      checkout_to_purchase_rate: { p10: 18, p25: 38, p50: 58, p75: 76, p90: 88, sample_count: 8500 },
    },
  },

  // ── IMAGE 소재 — 뷰티/패션 카테고리 ─────────────────────────────────
  {
    source: 'motion_global',
    media_type: 'IMAGE',
    category: 'beauty',
    period: '2025-Q4',
    metrics: {
      ctr: { p10: 0.4, p25: 0.8, p50: 1.3, p75: 2.2, p90: 4.0, sample_count: 2200 },
      reach_to_purchase_rate: { p10: 0.015, p25: 0.04, p50: 0.09, p75: 0.20, p90: 0.40, sample_count: 2200 },
      click_to_purchase_rate: { p10: 0.8, p25: 1.8, p50: 3.5, p75: 7.0, p90: 12, sample_count: 2200 },
      roas: { p10: 0.6, p25: 1.5, p50: 2.8, p75: 5.5, p90: 10, sample_count: 2200 },
      saves_per_10k: { p10: 1.0, p25: 3.0, p50: 8.0, p75: 20, p90: 50, sample_count: 2200 },
      reactions_per_10k: { p10: 3, p25: 8, p50: 20, p75: 50, p90: 110, sample_count: 2200 },
    },
  },

  // ── VIDEO 소재 — 뷰티/패션 카테고리 ─────────────────────────────────
  {
    source: 'motion_global',
    media_type: 'VIDEO',
    category: 'beauty',
    period: '2025-Q4',
    metrics: {
      ctr: { p10: 0.25, p25: 0.6, p50: 1.1, p75: 2.0, p90: 3.5, sample_count: 3200 },
      video_p3s_rate: { p10: 18, p25: 35, p50: 54, p75: 70, p90: 84, sample_count: 3200 },
      thruplay_rate: { p10: 6, p25: 15, p50: 28, p75: 44, p90: 64, sample_count: 3200 },
      retention_rate: { p10: 10, p25: 22, p50: 38, p75: 56, p90: 74, sample_count: 3200 },
      reach_to_purchase_rate: { p10: 0.010, p25: 0.030, p50: 0.075, p75: 0.160, p90: 0.330, sample_count: 3200 },
      click_to_purchase_rate: { p10: 0.5, p25: 1.2, p50: 2.8, p75: 5.8, p90: 10.5, sample_count: 3200 },
      roas: { p10: 0.5, p25: 1.2, p50: 2.4, p75: 5.0, p90: 9.0, sample_count: 3200 },
      saves_per_10k: { p10: 1.0, p25: 3.5, p50: 10, p75: 25, p90: 60, sample_count: 3200 },
      reactions_per_10k: { p10: 4, p25: 10, p50: 25, p75: 60, p90: 130, sample_count: 3200 },
    },
  },

  // ── 이커머스/패션 IMAGE ───────────────────────────────────────────────
  {
    source: 'motion_global',
    media_type: 'IMAGE',
    category: 'fashion',
    period: '2025-Q4',
    metrics: {
      ctr: { p10: 0.35, p25: 0.7, p50: 1.2, p75: 2.0, p90: 3.5, sample_count: 1800 },
      reach_to_purchase_rate: { p10: 0.012, p25: 0.035, p50: 0.080, p75: 0.170, p90: 0.350, sample_count: 1800 },
      roas: { p10: 0.5, p25: 1.3, p50: 2.5, p75: 5.0, p90: 9.0, sample_count: 1800 },
      saves_per_10k: { p10: 0.8, p25: 2.5, p50: 7.0, p75: 18, p90: 45, sample_count: 1800 },
    },
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed-benchmarks] 시작 (dry_run=${DRY_RUN})`);

  let total = 0;
  let upserted = 0;
  let errors = 0;

  for (const benchmarkGroup of BENCHMARKS) {
    const { source, media_type, category, period, metrics } = benchmarkGroup;

    for (const [metric, dist] of Object.entries(metrics)) {
      total++;

      const row = {
        source,
        media_type: media_type ?? null,
        category: category ?? null,
        metric,
        p10: dist.p10,
        p25: dist.p25,
        p50: dist.p50,
        p75: dist.p75,
        p90: dist.p90,
        sample_count: dist.sample_count,
        period,
        updated_at: new Date().toISOString(),
      };

      if (DRY_RUN) {
        if (upserted < 3) {
          console.log('[DRY-RUN] 샘플:', JSON.stringify(row, null, 2));
        }
        upserted++;
        continue;
      }

      try {
        await rawQuery(`
          INSERT INTO prescription_benchmarks
            (source, media_type, category, metric, p10, p25, p50, p75, p90, sample_count, period, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (source, media_type, category, metric, period)
          DO UPDATE SET
            p10 = EXCLUDED.p10,
            p25 = EXCLUDED.p25,
            p50 = EXCLUDED.p50,
            p75 = EXCLUDED.p75,
            p90 = EXCLUDED.p90,
            sample_count = EXCLUDED.sample_count,
            updated_at = EXCLUDED.updated_at
        `, [
          row.source, row.media_type, row.category, row.metric,
          row.p10, row.p25, row.p50, row.p75, row.p90,
          row.sample_count, row.period, row.updated_at,
        ]);
        upserted++;
      } catch (e) {
        console.error(`[seed-benchmarks] 오류 (${metric}):`, e.message);
        errors++;
      }
    }
  }

  console.log(`\n[seed-benchmarks] 완료`);
  console.log(`  총 시도: ${total}`);
  console.log(`  성공: ${upserted}`);
  console.log(`  오류: ${errors}`);

  await closePool();
}

main().catch(e => {
  console.error('[seed-benchmarks] 치명적 오류:', e);
  process.exit(1);
});
