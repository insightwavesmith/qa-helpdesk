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
 *   - ad_creative_embeddings.embedding_3072 또는 creative_media.embedding 벡터 필요
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const ACCOUNT_IDX = process.argv.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

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

// ── main ──
async function main() {
  console.log(`소재 피로도 위험 계산${DRY_RUN ? " (dry-run)" : ""}`);
  if (FILTER_ACCOUNT) console.log(`계정 필터: ${FILTER_ACCOUNT}`);
  console.log();

  const PAGE_SIZE = 1000;

  // 1. creative_media에서 analysis_json NOT NULL + is_active=true 소재 조회
  //    (embedding 또는 ad_creative_embeddings.embedding_3072 필요)
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
      // 컬럼 미생성 시 analysis_json 없이 조회 (임베딩만 계산)
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

  // 2. ad_creative_embeddings에서 embedding_3072 로드
  //    (creative_media.embedding 컬럼이 없으면 이 테이블을 사용)
  console.log("임베딩 벡터 로드 중...");
  const embeddingMap = new Map(); // ad_id → embedding_3072

  // account_id 목록 수집
  const accountIds = [...new Set(cmRows.map((r) => r.creatives?.account_id).filter(Boolean))];

  for (const accountId of accountIds) {
    let aceOffset = 0;
    while (true) {
      let q =
        `/ad_creative_embeddings?select=ad_id,embedding_3072` +
        `&account_id=eq.${accountId}&embedding_3072=not.is.null&order=ad_id.asc&offset=${aceOffset}&limit=${PAGE_SIZE}`;
      const batch = await sbGet(q);
      for (const r of batch) {
        const vec = parseEmbedding(r.embedding_3072);
        if (vec) embeddingMap.set(r.ad_id, vec);
      }
      if (batch.length < PAGE_SIZE) break;
      aceOffset += PAGE_SIZE;
    }
  }
  console.log(`임베딩 로드 완료: ${embeddingMap.size}건`);
  console.log();

  // 3. account_id별로 그룹핑
  const byAccount = {};
  for (const row of cmRows) {
    const accountId = row.creatives?.account_id;
    if (!accountId) continue;
    if (!byAccount[accountId]) byAccount[accountId] = [];
    byAccount[accountId].push({
      id: row.id,
      adId: row.creatives?.ad_id,
      analysis_json: row.analysis_json,
    });
  }

  const accountList = Object.keys(byAccount);
  console.log(`처리 계정: ${accountList.length}개`);

  let success = 0;
  let errors = 0;
  let skipped = 0;
  let noEmbedding = 0;

  // 4. 계정별 pairwise 코사인 유사도 계산
  for (const accountId of accountList) {
    const items = byAccount[accountId];
    console.log(`\n계정 ${accountId}: ${items.length}건 처리 중...`);

    // 이 계정의 임베딩만 추출
    const accountEmbeddings = items
      .map((item) => ({
        item,
        vec: embeddingMap.get(item.adId) ?? null,
      }))
      .filter((e) => e.vec !== null);

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
        similarity_score: Math.round(maxSim * 1000) / 1000, // 소수점 3자리
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
    const withoutEmbedding = items.length - accountEmbeddings.length;
    if (withoutEmbedding > 0) {
      console.log(`  임베딩 없음 (스킵): ${withoutEmbedding}건`);
      noEmbedding += withoutEmbedding;
    }

    console.log(`  계정 ${accountId} 완료: ${accountEmbeddings.length}건 처리`);
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`성공: ${success}건, 실패: ${errors}건, 스킵: ${skipped}건, 임베딩없음: ${noEmbedding}건`);

  // 피로도 분포 통계 (dry-run 시에는 실제 업데이트 안됨)
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
      console.log(`전체 ${total}건 중:`);
      console.log(`  high (≥0.85): ${riskCounts.high}건 (${Math.round(riskCounts.high / total * 100)}%)`);
      console.log(`  medium (≥0.70): ${riskCounts.medium}건 (${Math.round(riskCounts.medium / total * 100)}%)`);
      console.log(`  low (<0.70): ${riskCounts.low}건 (${Math.round(riskCounts.low / total * 100)}%)`);
      if (riskCounts.null > 0) console.log(`  미계산: ${riskCounts.null}건`);
    } catch (e) {
      console.warn(`통계 계산 실패: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
