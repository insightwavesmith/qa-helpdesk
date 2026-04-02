#!/usr/bin/env node
/**
 * Andromeda 유사도 계산
 *
 * 같은 계정 내 활성 소재 간 4축 가중 Jaccard 유사도 계산.
 * 유사도 ≥ 0.60인 쌍을 analysis_json.andromeda_signals.similar_creatives에 저장.
 *
 * Usage:
 *   node scripts/compute-andromeda-similarity.mjs [--limit N] [--dry-run] [--account-id UUID]
 */

import { sbGet, sbPatch, rawQuery } from "./lib/db-helpers.mjs";

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;
const ACCOUNT_IDX = process.argv.indexOf("--account-id");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;
// B9: --threshold CLI 옵션 (기본 0.40, 기존 0.60에서 하향)
const THRESH_IDX = process.argv.indexOf("--threshold");
const SIMILARITY_THRESHOLD = THRESH_IDX !== -1 ? parseFloat(process.argv[THRESH_IDX + 1]) : 0.40;

// ── Jaccard 유사도 (하이픈 구분 토큰) ──
function fingerprintSimilarity(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  const tokens1 = new Set(fp1.split("-"));
  const tokens2 = new Set(fp2.split("-"));
  const intersection = [...tokens1].filter((t) => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── 4축 가중 유사도 ──
function andromedaSimilarity(a, b) {
  const hasAudio =
    a.audio_fingerprint != null &&
    a.audio_fingerprint !== "" &&
    b.audio_fingerprint != null &&
    b.audio_fingerprint !== "";

  const visual = fingerprintSimilarity(a.visual_fingerprint, b.visual_fingerprint);
  const text = fingerprintSimilarity(a.text_fingerprint, b.text_fingerprint);
  const audio = hasAudio
    ? fingerprintSimilarity(a.audio_fingerprint, b.audio_fingerprint)
    : 0;
  const structure = fingerprintSimilarity(a.structure_fingerprint, b.structure_fingerprint);

  if (hasAudio) {
    // 영상: 40/30/15/15
    return visual * 0.4 + text * 0.3 + audio * 0.15 + structure * 0.15;
  } else {
    // 이미지: audio 제외 → 나머지 재분배 (47/35/18)
    return visual * 0.47 + text * 0.35 + structure * 0.18;
  }
}

// ── 각 축별 Jaccard > 0.50인 축 반환 ──
function overlapAxes(a, b) {
  const axes = [];
  if (fingerprintSimilarity(a.visual_fingerprint, b.visual_fingerprint) > 0.5)
    axes.push("visual");
  if (fingerprintSimilarity(a.text_fingerprint, b.text_fingerprint) > 0.5)
    axes.push("text");
  if (
    a.audio_fingerprint &&
    b.audio_fingerprint &&
    fingerprintSimilarity(a.audio_fingerprint, b.audio_fingerprint) > 0.5
  )
    axes.push("audio");
  if (fingerprintSimilarity(a.structure_fingerprint, b.structure_fingerprint) > 0.5)
    axes.push("structure");
  return axes;
}

// ── main ──
async function main() {
  console.log(`Andromeda 유사도 계산${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`유사도 임계값: ${SIMILARITY_THRESHOLD} (--threshold로 변경 가능)`);
  if (FILTER_ACCOUNT) console.log(`계정 필터: ${FILTER_ACCOUNT}`);
  if (LIMIT) console.log(`계정 수 제한: ${LIMIT}개`);
  console.log();

  const PAGE_SIZE = 1000;

  // 1. creative_media에서 andromeda_signals가 있는 활성 소재 조회
  console.log("creative_media 조회 중...");
  let cmRows = [];
  let offset = 0;

  while (true) {
    const params = [offset, PAGE_SIZE];
    let accountFilter = '';
    if (FILTER_ACCOUNT) { accountFilter = ' WHERE c.account_id = $3'; params.push(FILTER_ACCOUNT); }
    const batch = await rawQuery(`
      SELECT cm.id, cm.creative_id, cm.analysis_json, cm.media_type, c.account_id
      FROM creative_media cm
      INNER JOIN creatives c ON cm.creative_id = c.id
      ${accountFilter}
      ORDER BY cm.id ASC
      OFFSET $1 LIMIT $2
    `, params);

    // andromeda_signals 있는 것만 필터 (PostgREST JSON 필터 문법 호환성 위해 클라이언트 필터)
    const filtered = batch.filter(
      (r) => r.analysis_json?.andromeda_signals != null
    );
    cmRows.push(...filtered);

    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`andromeda_signals 있는 활성 소재: ${cmRows.length}건`);

  if (cmRows.length === 0) {
    console.log("계산할 소재가 없습니다. analyze-five-axis.mjs를 먼저 실행해서 andromeda_signals를 생성하세요.");
    return;
  }

  // 2. account_id별로 그룹핑
  const byAccount = {};
  for (const row of cmRows) {
    const accountId = row.account_id;
    if (!accountId) continue;
    if (!byAccount[accountId]) byAccount[accountId] = [];
    byAccount[accountId].push(row);
  }

  let accountList = Object.keys(byAccount);
  console.log(`총 계정: ${accountList.length}개`);

  // --limit 옵션: 처리 계정 수 제한
  if (LIMIT && LIMIT < accountList.length) {
    accountList = accountList.slice(0, LIMIT);
    console.log(`처리 계정 제한 적용: ${LIMIT}개`);
  }

  let totalPairs = 0;
  let pairs60 = 0;
  let pairs80 = 0;
  let updateCount = 0;
  let errors = 0;

  // 3. 계정별 pairwise 비교
  for (const accountId of accountList) {
    const items = byAccount[accountId];
    if (items.length < 2) {
      console.log(`계정 ${accountId}: 소재 ${items.length}건 — 비교 대상 없음, 스킵`);
      continue;
    }

    console.log(`\n계정 ${accountId}: ${items.length}건 pairwise 비교 중...`);

    const accountPairs = (items.length * (items.length - 1)) / 2;
    totalPairs += accountPairs;

    // 각 소재에 대한 similar_creatives 맵 초기화
    const similarMap = new Map(); // id → []
    for (const item of items) {
      similarMap.set(item.id, []);
    }

    // pairwise 비교
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const sigA = a.analysis_json.andromeda_signals;
        const sigB = b.analysis_json.andromeda_signals;

        const sim = andromedaSimilarity(sigA, sigB);

        // B9: 임계값을 CLI 옵션으로 변경 가능 (기본 0.40)
        if (sim >= SIMILARITY_THRESHOLD) {
          pairs60++;
          if (sim >= 0.8) pairs80++;

          const axes = overlapAxes(sigA, sigB);
          const simRounded = Math.round(sim * 1000) / 1000;

          similarMap.get(a.id).push({
            creative_id: b.creative_id,
            similarity: simRounded,
            overlap_axes: axes,
          });
          similarMap.get(b.id).push({
            creative_id: a.creative_id,
            similarity: simRounded,
            overlap_axes: axes,
          });
        }
      }
    }

    // 4. similar_creatives 업데이트
    if (DRY_RUN) {
      const withSimilar = [...similarMap.values()].filter((v) => v.length > 0).length;
      console.log(
        `  [dry-run] 유사도 ≥ ${SIMILARITY_THRESHOLD} 쌍 발견: ${[...similarMap.values()].reduce((s, v) => s + v.length, 0) / 2}쌍` +
        `, 업데이트 대상: ${withSimilar}건`
      );
      updateCount += items.length;
      continue;
    }

    for (const item of items) {
      const similarCreatives = similarMap.get(item.id) ?? [];
      const currentJson = item.analysis_json || {};
      const currentSignals = currentJson.andromeda_signals || {};

      const updatedSignals = {
        ...currentSignals,
        similar_creatives: similarCreatives,
      };

      const updatedJson = {
        ...currentJson,
        andromeda_signals: updatedSignals,
      };

      const patch = await sbPatch("creative_media", `id=eq.${item.id}`, {
        analysis_json: updatedJson,
      });

      if (!patch.ok) {
        console.error(`  X DB 저장 실패 (id=${item.id}): ${patch.body}`);
        errors++;
      } else {
        updateCount++;
      }
    }

    console.log(`  계정 ${accountId} 완료: ${items.length}건 업데이트`);
  }

  // 5. 결과 출력
  console.log();
  console.log("━━━ Andromeda 유사도 결과 ━━━");
  console.log(`처리 계정: ${accountList.length}개`);
  console.log(`비교 쌍: ${totalPairs.toLocaleString()}개`);
  console.log(`유사도 ≥ ${SIMILARITY_THRESHOLD}: ${pairs60}쌍`);
  console.log(`유사도 ≥ 0.80: ${pairs80}쌍`);
  if (DRY_RUN) {
    console.log(`업데이트: (dry-run — 실제 저장 안 함)`);
  } else {
    console.log(`업데이트: ${updateCount}건`);
    if (errors > 0) console.log(`실패: ${errors}건`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
