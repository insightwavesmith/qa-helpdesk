/**
 * L3 요소별 성과 벤치마크 계산
 *
 * creative_element_analysis + daily_ad_insights를 JOIN하여
 * 각 요소 타입/값 조합의 평균 ROAS, CTR, 전환율, P75 ROAS를 계산하고
 * creative_element_performance 테이블에 upsert한다.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sbGet, sbPost } = require('./lib/supabase.js');

// ━━━ 통계 헬퍼 ━━━

/** 배열의 평균값 (null/undefined/NaN 제외) */
function avg(values) {
  const valid = values.filter((v) => v != null && !isNaN(v) && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** 75th percentile 계산 */
function percentile75(values) {
  const valid = values.filter((v) => v != null && !isNaN(v) && isFinite(v));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.75);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/** 0으로 나누기 방지 */
function safeDivide(numerator, denominator) {
  if (!denominator || denominator === 0) return null;
  return numerator / denominator;
}

// ━━━ 분석 대상 요소 정의 ━━━

/** 문자열 값을 갖는 요소 필드 */
const STRING_FIELDS = [
  { field: 'hook_type', name: 'hook_type' },
  { field: 'style', name: 'style' },
  { field: 'cta_type', name: 'cta_type' },
  { field: 'cta_position', name: 'cta_position' },
  { field: 'color_tone', name: 'color_tone' },
  { field: 'color_contrast', name: 'color_contrast' },
  { field: 'format', name: 'format' },
];

/** boolean 값을 갖는 요소 필드 */
const BOOL_FIELDS = [
  { field: 'human_presence', name: 'human_presence' },
  { field: 'has_bgm', name: 'has_bgm' },
];

// ━━━ 메인 export ━━━
export async function runBenchmark({ dryRun = false } = {}) {
  console.log('벤치마크 계산 시작 (Layer 3 — Performance Correlation)');
  if (dryRun) console.log('  [DRY RUN 모드 — DB 저장 안 함]');

  // 1. creative_element_analysis 전체 조회
  console.log('\n[1/4] creative_element_analysis 조회 중...');
  const elements = await sbGet(
    '/creative_element_analysis?select=ad_id,account_id,format,hook_type,style,cta_type,cta_position,color_tone,color_contrast,human_presence,has_bgm&limit=9999'
  );
  console.log(`  ${elements.length}건 조회됨`);

  if (elements.length === 0) {
    console.log('  creative_element_analysis 데이터 없음. analyze 먼저 실행 필요.');
    return { computed: 0, success: 0, errors: 0 };
  }

  // 2. daily_ad_insights 조회 (spend > 0인 행만)
  console.log('\n[2/4] daily_ad_insights 조회 중 (spend > 0)...');
  const insights = await sbGet(
    '/daily_ad_insights?select=ad_id,spend,roas,ctr,purchases,clicks&spend=gt.0&limit=99999'
  );
  console.log(`  ${insights.length}건 조회됨`);

  if (insights.length === 0) {
    console.log('  daily_ad_insights 성과 데이터 없음. 성과 데이터 수집 후 재실행 필요.');
    return { computed: 0, success: 0, errors: 0 };
  }

  // 3. ad_id → 성과 데이터 맵 구축 (JS에서 JOIN)
  console.log('\n[3/4] 성과 데이터 집계 중...');
  const perfMap = new Map();

  for (const row of insights) {
    const adId = row.ad_id;
    if (!adId) continue;

    if (!perfMap.has(adId)) {
      perfMap.set(adId, {
        totalSpend: 0,
        totalRevenue: 0,
        ctrValues: [],
        totalPurchases: 0,
        totalClicks: 0,
        rowCount: 0,
      });
    }

    const entry = perfMap.get(adId);
    const spend = row.spend || 0;
    entry.totalSpend += spend;
    // revenue = spend × ROAS (가중평균 ROAS 계산용)
    if (row.roas != null && row.roas > 0) entry.totalRevenue += spend * row.roas;
    if (row.ctr != null && row.ctr > 0) entry.ctrValues.push(row.ctr);
    entry.totalPurchases += row.purchases || 0;
    entry.totalClicks += row.clicks || 0;
    entry.rowCount++;
  }

  // ad_id별 집계 완료 후 최종 지표 계산
  const adPerf = new Map();
  for (const [adId, entry] of perfMap) {
    adPerf.set(adId, {
      spend: entry.totalSpend,
      avg_roas: safeDivide(entry.totalRevenue, entry.totalSpend),
      avg_ctr: avg(entry.ctrValues),
      // 전환율: 총 구매 / 총 클릭 * 100 (%)
      conversion_rate: safeDivide(entry.totalPurchases * 100, entry.totalClicks),
    });
  }

  console.log(`  성과 데이터 보유 광고: ${adPerf.size}개`);

  // 성과 데이터와 JOIN되는 element 행 필터링 (최소 광고비 10,000원 미만 제외)
  const MIN_SPEND = 10000; // 최소 광고비 10,000원 미만 제외
  const joinedElements = elements.filter((el) => {
    const perf = adPerf.get(el.ad_id);
    return perf && perf.spend >= MIN_SPEND;
  });
  const filteredOut = elements.filter((el) => adPerf.has(el.ad_id)).length - joinedElements.length;
  if (filteredOut > 0) {
    console.log(`  광고비 ${MIN_SPEND.toLocaleString()}원 미만 제외: ${filteredOut}건`);
  }
  console.log(`  JOIN 성공 (요소 보유 + 성과 보유): ${joinedElements.length}건`);

  if (joinedElements.length === 0) {
    console.log('  JOIN 결과 없음. ad_id 불일치 또는 성과 데이터 미수집 상태일 수 있음.');
    return { computed: 0, success: 0, errors: 0 };
  }

  // 4. 요소 타입별 벤치마크 계산
  console.log('\n[4/4] 요소별 벤치마크 계산 중...');

  // element_type + element_value → 성과 수집 구조
  // Map key: "{element_type}||{element_value}"
  const buckets = new Map();

  function addToBucket(elementType, elementValue, perf) {
    // null/undefined/빈 문자열 값은 제외
    if (elementValue == null || elementValue === '') return;

    const key = `${elementType}||${String(elementValue)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        element_type: elementType,
        element_value: String(elementValue),
        roasValues: [],
        ctrValues: [],
        convRateValues: [],
        adIds: new Set(),
      });
    }
    const bucket = buckets.get(key);
    bucket.adIds.add(perf._adId);
    if (perf.avg_roas != null) bucket.roasValues.push(perf.avg_roas);
    if (perf.avg_ctr != null) bucket.ctrValues.push(perf.avg_ctr);
    if (perf.conversion_rate != null) bucket.convRateValues.push(perf.conversion_rate);
  }

  for (const el of joinedElements) {
    const perf = adPerf.get(el.ad_id);
    if (!perf) continue;
    const perfWithId = { ...perf, _adId: el.ad_id };

    // 문자열 필드 처리
    for (const { field, name } of STRING_FIELDS) {
      addToBucket(name, el[field], perfWithId);
    }

    // boolean 필드 처리 (true/false 문자열로 저장)
    for (const { field, name } of BOOL_FIELDS) {
      const val = el[field];
      if (val != null) {
        // has_bgm은 video 포맷에만 의미 있음
        if (field === 'has_bgm' && el.format !== 'video') continue;
        addToBucket(name, String(val), perfWithId);
      }
    }
  }

  // 버킷 → upsert 행 변환
  const upsertRows = [];
  for (const [, bucket] of buckets) {
    const sampleCount = bucket.adIds.size;
    if (sampleCount === 0) continue;

    upsertRows.push({
      element_type: bucket.element_type,
      element_value: bucket.element_value,
      sample_count: sampleCount,
      avg_roas: avg(bucket.roasValues),
      avg_ctr: avg(bucket.ctrValues),
      avg_conversion_rate: avg(bucket.convRateValues),
      p75_roas: percentile75(bucket.roasValues),
      updated_at: new Date().toISOString(),
    });
  }

  // 결과 요약 출력
  console.log(`\n  계산 완료: ${upsertRows.length}개 (element_type, element_value) 조합`);
  console.log('\n  ── 요소별 Top ROAS ──');

  // 요소 타입별 그룹핑 후 정렬 출력
  const grouped = {};
  for (const row of upsertRows) {
    if (!grouped[row.element_type]) grouped[row.element_type] = [];
    grouped[row.element_type].push(row);
  }

  for (const [elementType, rows] of Object.entries(grouped)) {
    rows.sort((a, b) => (b.avg_roas || 0) - (a.avg_roas || 0));
    console.log(`\n  [${elementType}]`);
    console.log(`  ${'값'.padEnd(20)} ${'avg_ROAS'.padEnd(10)} ${'p75_ROAS'.padEnd(10)} ${'avg_CTR'.padEnd(10)} ${'전환율(%)'.padEnd(12)} ${'샘플수'}`);
    console.log(`  ${'─'.repeat(75)}`);
    for (const r of rows) {
      const roasStr = r.avg_roas != null ? r.avg_roas.toFixed(3) : 'N/A';
      const p75Str = r.p75_roas != null ? r.p75_roas.toFixed(3) : 'N/A';
      const ctrStr = r.avg_ctr != null ? (r.avg_ctr * 100).toFixed(2) + '%' : 'N/A';
      const convStr = r.avg_conversion_rate != null ? r.avg_conversion_rate.toFixed(2) + '%' : 'N/A';
      console.log(
        `  ${String(r.element_value).padEnd(20)} ${roasStr.padEnd(10)} ${p75Str.padEnd(10)} ${ctrStr.padEnd(10)} ${convStr.padEnd(12)} ${r.sample_count}`
      );
    }
  }

  // DB upsert (dry-run이 아닌 경우)
  let successCount = 0;
  let errorCount = 0;

  if (!dryRun && upsertRows.length > 0) {
    console.log(`\n  creative_element_performance upsert 중 (${upsertRows.length}행)...`);

    // 배치 크기 50으로 나눠서 upsert
    const BATCH_SIZE = 50;

    for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
      const batch = upsertRows.slice(i, i + BATCH_SIZE);
      const result = await sbPost('creative_element_performance', batch, 'element_type,element_value');
      if (result.ok) {
        successCount += batch.length;
      } else {
        errorCount += batch.length;
        console.log(`    upsert 실패 (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${result.status} ${result.text.slice(0, 200)}`);
      }
    }

    console.log(`  upsert 완료 — 성공: ${successCount}, 실패: ${errorCount}`);
  } else if (dryRun) {
    console.log('\n  [DRY RUN] DB 저장 스킵됨.');
    successCount = upsertRows.length; // dry-run은 모두 성공으로 간주
  }

  console.log('\n벤치마크 계산 완료.');
  return { computed: upsertRows.length, success: successCount, errors: errorCount };
}
