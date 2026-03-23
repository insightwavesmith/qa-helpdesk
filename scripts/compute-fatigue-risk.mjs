#!/usr/bin/env node
/**
 * 소재 피로도 위험 계산 스크립트
 *
 * account_id별 활성 소재의 임베딩 벡터를 비교하여
 * analysis_json.quality.creative_fatigue_risk를 계산하고 업데이트한다.
 *
 * 참조: src/lib/creative-analyzer.ts의 cosineSimilarity/getRisk 로직 이식
 *
 * 임계값:
 *   high: ≥ 0.85 (같은 시각 패턴, 오디언스 피로 위험)
 *   medium: ≥ 0.70
 *   low: < 0.70
 *
 * Usage:
 *   node scripts/compute-fatigue-risk.mjs
 *   node scripts/compute-fatigue-risk.mjs --dry-run
 *   node scripts/compute-fatigue-risk.mjs --account 123456789
 *
 * 전제 조건:
 *   - creative_media.analysis_json이 v3 스키마로 채워진 후 실행
 *   - creative_media.embedding 벡터 필요
 *
 * B5 수정: ad_id String 강제 변환으로 타입 불일치 방지 + 디버그 로그
 * B6 수정: 계정별 임베딩 로드 → 메모리 사용량 제어
 * B11 수정: scripts/lib/env.mjs 공용 파서 사용
 */

import { getSupabaseConfig } from "./lib/env.mjs";

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const ACCOUNT_IDX = process.argv.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;

// ── 환경변수 (B11: 공용 파서) ──
const { SB_URL, SB_KEY } = getSupabaseConfig();

// ── Supabase 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

// ── 코사인 유사도 계산 (creative-analyzer.ts 로직 이식) ──
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * 유사도 → 피로도 위험 등급 (creative-analyzer.ts getRisk 로직 기반)
 */
function getRisk(similarity) {
  if (similarity >= 0.85) return "high";
  if (similarity >= 0.70) return "medium";
  return "low";
}

/**
 * 임베딩 벡터를 JSON 문자열 또는 배열에서 파싱
 */
function parseEmbedding(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

/**
 * B6: 특정 계정의 임베딩만 로드 (메모리 절약)
 * @returns {Map<string, number[]>} ad_id(String) → embedding vector
 */
async function loadAccountEmbeddings(accountId, PAGE_SIZE) {
  const embeddingMap = new Map();
  let offset = 0;
  while (true) {
    const q =
      `/creative_media?select=creative_id,embedding,creatives!inner(ad_id,account_id)` +
      `&creatives.account_id=eq.${accountId}&embedding=not.is.null&order=creative_id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
    const batch = await sbGet(q);
    for (const r of batch) {
      const vec = parseEmbedding(r.embedding);
      // B5: String 강제 변환으로 타입 불일치 방지
      if (vec && r.creatives?.ad_id) embeddingMap.set(String(r.creatives.ad_id), vec);
    }
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return embeddingMap;
}

// ── main ──
async function main() {
  console.log(`소재 피로도 위험 계산${DRY_RUN ? " (dry-run)" : ""}`);
  if (FILTER_ACCOUNT) console.log(`계정 필터: ${FILTER_ACCOUNT}`);
  console.log();

  const PAGE_SIZE = 1000;

  // 1. creative_media에서 analysis_json NOT NULL + is_active=true 소재 조회
  console.log("creative_media 조회 중...");
  let cmRows = [];
  let offset = 0;
  let hasAnalysisCol = true;

  try {
    while (true) {
      let q =
        `/creative_media?select=id,analysis_json,is_active,creatives!inner(ad_id,account_id)` +
        `&analysis_json=not.is.null&is_active=eq.true&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
      if (FILTER_ACCOUNT) q += `&creatives.account_id=eq.${FILTER_ACCOUNT}`;
      const batch = await sbGet(q);
      cmRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (e) {
    if (e.message.includes("analysis_json") || e.message.includes("is_active")) {
      console.log("  analysis_json/is_active 컬럼 미생성 — 기본 컬럼으로 재시도");
      hasAnalysisCol = false;
      cmRows = [];
      offset = 0;
      try {
        while (true) {
          let q =
            `/creative_media?select=id,creatives!inner(ad_id,account_id)` +
            `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
          if (FILTER_ACCOUNT) q += `&creatives.account_id=eq.${FILTER_ACCOUNT}`;
          const batch = await sbGet(q);
          cmRows.push(...batch);
          if (batch.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
      } catch (e2) {
        console.error(`creative_media 조회 실패: ${e2.message}`);
        return;
      }
    } else {
      throw e;
    }
  }

  console.log(`creative_media (활성${hasAnalysisCol ? ", 분석됨" : ""}): ${cmRows.length}건`);

  if (cmRows.length === 0) {
    console.log("계산할 소재가 없습니다.");
    return;
  }

  // 2. account_id별로 그룹핑
  const byAccount = {};
  for (const row of cmRows) {
    const accountId = row.creatives?.account_id;
    if (!accountId) continue;
    if (!byAccount[accountId]) byAccount[accountId] = [];
    byAccount[accountId].push({
      id: row.id,
      // B5: String 강제 변환
      adId: String(row.creatives?.ad_id ?? ""),
      analysis_json: row.analysis_json,
    });
  }

  const accountList = Object.keys(byAccount);
  console.log(`처리 계정: ${accountList.length}개`);

  let success = 0;
  let errors = 0;
  let skipped = 0;
  let noEmbedding = 0;

  // 3. 계정별 임베딩 로드 + pairwise 코사인 유사도 계산
  //    B6: 계정별로 임베딩 로드/해제하여 메모리 절약
  for (const accountId of accountList) {
    const items = byAccount[accountId];
    console.log(`\n계정 ${accountId}: ${items.length}건 처리 중...`);

    // B6: 이 계정의 임베딩만 로드 (이전: 전체 계정 한 번에 로드)
    const embeddingMap = await loadAccountEmbeddings(accountId, PAGE_SIZE);
    console.log(`  임베딩 로드: ${embeddingMap.size}건`);

    // B5: String 키로 매칭 + 디버그 로그
    const accountEmbeddings = [];
    let unmatchedCount = 0;
    for (const item of items) {
      const vec = embeddingMap.get(item.adId) ?? null;
      if (vec) {
        accountEmbeddings.push({ item, vec });
      } else {
        unmatchedCount++;
      }
    }

    // B5: 매칭 실패 진단 로그
    if (unmatchedCount > 0 && embeddingMap.size > 0) {
      const sampleAdIds = items.slice(0, 3).map((i) => i.adId);
      const sampleEmbKeys = [...embeddingMap.keys()].slice(0, 3);
      console.log(
        `  ⚠ ad_id 매칭 실패 ${unmatchedCount}건 ` +
        `(creative_media ad_id 예: ${sampleAdIds.join(", ")} / ` +
        `embeddings ad_id 예: ${sampleEmbKeys.join(", ")})`
      );
    }

    if (accountEmbeddings.length < 2) {
      console.log(`  임베딩 2건 미만, 스킵 (임베딩 있는 소재: ${accountEmbeddings.length}건)`);
      skipped += items.length;
      continue;
    }

    console.log(`  임베딩 유효: ${accountEmbeddings.length}건`);

    // 각 소재에 대해 가장 유사한 소재 찾기
    for (let i = 0; i < accountEmbeddings.length; i++) {
      const { item, vec } = accountEmbeddings[i];

      let maxSim = 0;
      let mostSimilarAdId = null;

      for (let j = 0; j < accountEmbeddings.length; j++) {
        if (i === j) continue;
        const sim = cosineSimilarity(vec, accountEmbeddings[j].vec);
        if (sim > maxSim) {
          maxSim = sim;
          mostSimilarAdId = accountEmbeddings[j].item.adId;
        }
      }

      const fatigueRisk = getRisk(maxSim);
      const currentJson = item.analysis_json || {};

      if (i < 3) {
        console.log(
          `  [${i + 1}/${accountEmbeddings.length}] ad=${item.adId}, ` +
          `maxSim=${maxSim.toFixed(3)}, risk=${fatigueRisk}, mostSimilar=${mostSimilarAdId}`
        );
      }

      if (DRY_RUN) {
        success++;
        continue;
      }

      // analysis_json.quality 업데이트
      const updatedQuality = {
        ...(currentJson.quality || {}),
        creative_fatigue_risk: fatigueRisk,
        most_similar_ad_id: mostSimilarAdId,
        similarity_score: Math.round(maxSim * 1000) / 1000,
      };

      const updatedJson = {
        ...currentJson,
        quality: updatedQuality,
      };

      const patch = await sbPatch("creative_media", `id=eq.${item.id}`, {
        analysis_json: updatedJson,
      });

      if (!patch.ok) {
        console.error(`    X DB 저장 실패 (id=${item.id}): ${patch.body}`);
        errors++;
      } else {
        success++;
      }
    }

    // 임베딩 없는 소재 카운트
    if (unmatchedCount > 0) {
      console.log(`  임베딩 없음 (스킵): ${unmatchedCount}건`);
      noEmbedding += unmatchedCount;
    }

    console.log(`  계정 ${accountId} 완료: ${accountEmbeddings.length}건 처리`);
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`성공: ${success}건, 실패: ${errors}건, 스킵: ${skipped}건, 임베딩없음: ${noEmbedding}건`);

  // 피로도 분포 통계
  if (!DRY_RUN && success > 0) {
    console.log("\n피로도 분포 계산 중...");
    try {
      let statsOffset = 0;
      const riskCounts = { high: 0, medium: 0, low: 0, null: 0 };

      while (true) {
        let q =
          `/creative_media?select=analysis_json&analysis_json=not.is.null&is_active=eq.true` +
          `&order=id.asc&offset=${statsOffset}&limit=${PAGE_SIZE}`;
        if (FILTER_ACCOUNT) q += `&creatives.account_id=eq.${FILTER_ACCOUNT}`;
        const batch = await sbGet(q);
        for (const r of batch) {
          const risk = r.analysis_json?.quality?.creative_fatigue_risk;
          if (risk === "high") riskCounts.high++;
          else if (risk === "medium") riskCounts.medium++;
          else if (risk === "low") riskCounts.low++;
          else riskCounts.null++;
        }
        if (batch.length < PAGE_SIZE) break;
        statsOffset += PAGE_SIZE;
      }

      const total = riskCounts.high + riskCounts.medium + riskCounts.low + riskCounts.null;
      if (total > 0) {
        console.log(`전체 ${total}건 중:`);
        console.log(`  high (≥0.85): ${riskCounts.high}건 (${Math.round(riskCounts.high / total * 100)}%)`);
        console.log(`  medium (≥0.70): ${riskCounts.medium}건 (${Math.round(riskCounts.medium / total * 100)}%)`);
        console.log(`  low (<0.70): ${riskCounts.low}건 (${Math.round(riskCounts.low / total * 100)}%)`);
        if (riskCounts.null > 0) console.log(`  미계산: ${riskCounts.null}건`);
      }
    } catch (e) {
      console.warn(`통계 계산 실패: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
