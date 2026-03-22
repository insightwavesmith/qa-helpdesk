#!/usr/bin/env node
/**
 * 소재↔LP 일관성 분석
 *
 * creative_lp_map에서 overall_score가 NULL인 매핑을 Gemini 2.5 Pro로 분석하여
 * message_alignment, cta_alignment, offer_alignment, overall_score, issues를 저장.
 *
 * Usage:
 *   node scripts/analyze-creative-lp-alignment.mjs [--limit N] [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 50;

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
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

// ── Gemini 2.5 Pro 호출 (재시도 포함) ──
async function callGemini(prompt, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`  Gemini ${res.status} — ${wait}ms 후 재시도 (${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini ${res.status}: ${text}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini 응답 비어있음");

      return JSON.parse(text);
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`  Gemini 오류 — ${wait}ms 후 재시도 (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ── overall_score 가중 평균 ──
function computeOverallScore(result) {
  return Math.round(
    result.message_alignment * 0.35 +
      (result.visual_consistency || 0) * 0.15 +
      result.cta_alignment * 0.25 +
      result.offer_alignment * 0.25
  );
}

// ── 분석 프롬프트 생성 ──
function buildPrompt(analysisJson, referenceBased) {
  const creativeAxes = {
    visual: analysisJson.visual,
    text: analysisJson.text,
    psychology: analysisJson.psychology,
  };

  return `아래 광고 소재 분석 결과와 랜딩 페이지 분석 결과를 비교하여 일관성을 평가하세요.

[광고 소재 분석]
${JSON.stringify(creativeAxes, null, 2)}

[랜딩 페이지 분석]
${JSON.stringify(referenceBased, null, 2)}

다음 JSON으로 일관성 점수(0-100)와 이슈를 반환하세요:

{
  "message_alignment": 78,
  "visual_consistency": 85,
  "cta_alignment": 45,
  "offer_alignment": 50,
  "issues": [
    {
      "type": "message_mismatch|visual_inconsistency|cta_mismatch|offer_mismatch",
      "severity": "high|medium|low",
      "description": "구체적 불일치 내용 (한국어)",
      "action": "개선 제안 (한국어)"
    }
  ]
}

규칙:
- 각 점수는 0~100 정수
- issues 배열에 주요 불일치 최대 5개
- 순수 JSON만 반환`;
}

// ── main ──
async function main() {
  console.log(`소재↔LP 일관성 분석${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`대상: ${LIMIT}건`);
  console.log();

  // 1. creative_lp_map에서 overall_score IS NULL인 행 조회
  const maps = await sbGet(
    `/creative_lp_map?select=id,creative_id,lp_id&overall_score=is.null&limit=${LIMIT}`
  );

  if (!maps || maps.length === 0) {
    console.log("분석할 항목이 없습니다. (overall_score IS NULL인 creative_lp_map 행 없음)");
    return;
  }

  console.log(`조회된 매핑: ${maps.length}건`);

  let completed = 0;
  let skipped = 0;
  let errors = 0;
  let totalScore = 0;
  let scoredCount = 0;

  for (const map of maps) {
    // 2a. creative_media 조회
    let creativeMedia;
    try {
      const cmRows = await sbGet(
        `/creative_media?select=analysis_json&creative_id=eq.${map.creative_id}&analysis_json=not.is.null&limit=1`
      );
      creativeMedia = cmRows?.[0];
    } catch (err) {
      console.error(`  creative_media 조회 실패 (creative_id=${map.creative_id}): ${err.message}`);
      errors++;
      continue;
    }

    if (!creativeMedia?.analysis_json) {
      console.log(`  스킵 (creative_id=${map.creative_id}): analysis_json 없음`);
      skipped++;
      continue;
    }

    // 2b. lp_analysis 조회
    let lpAnalysis;
    try {
      const lpRows = await sbGet(
        `/lp_analysis?select=reference_based&lp_id=eq.${map.lp_id}&reference_based=not.is.null&limit=1`
      );
      lpAnalysis = lpRows?.[0];
    } catch (err) {
      console.error(`  lp_analysis 조회 실패 (lp_id=${map.lp_id}): ${err.message}`);
      errors++;
      continue;
    }

    if (!lpAnalysis?.reference_based) {
      console.log(`  스킵 (lp_id=${map.lp_id}): reference_based 없음`);
      skipped++;
      continue;
    }

    // 2c. Gemini 분석
    let result;
    try {
      const prompt = buildPrompt(creativeMedia.analysis_json, lpAnalysis.reference_based);
      result = await callGemini(prompt);
    } catch (err) {
      console.error(`  Gemini 실패 (map.id=${map.id}): ${err.message}`);
      errors++;
      // Rate limit 후 다음 항목 진행
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    // overall_score 계산
    const overall = computeOverallScore(result);
    totalScore += overall;
    scoredCount++;

    if (DRY_RUN) {
      console.log(
        `  [dry-run] map.id=${map.id} → overall=${overall}` +
          ` (msg=${result.message_alignment}, cta=${result.cta_alignment},` +
          ` offer=${result.offer_alignment}, visual=${result.visual_consistency || 0})`
      );
      completed++;
    } else {
      // 5. creative_lp_map UPDATE
      const patch = await sbPatch("creative_lp_map", `id=eq.${map.id}`, {
        message_alignment: result.message_alignment,
        cta_alignment: result.cta_alignment,
        offer_alignment: result.offer_alignment,
        overall_score: overall,
        issues: result.issues || [],
        updated_at: new Date().toISOString(),
      });

      if (!patch.ok) {
        console.error(`  DB 저장 실패 (map.id=${map.id}): ${patch.body}`);
        errors++;
      } else {
        console.log(`  완료 map.id=${map.id} → overall=${overall}`);
        completed++;
      }
    }

    // Rate limit: 4초 간격
    if (maps.indexOf(map) < maps.length - 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // 결과 출력
  console.log();
  console.log("━━━ 소재↔LP 일관성 분석 결과 ━━━");
  console.log(`대상: ${maps.length}건`);
  console.log(`분석 완료: ${completed}건`);
  console.log(`스킵 (데이터 부족): ${skipped}건`);
  console.log(`에러: ${errors}건`);
  if (scoredCount > 0) {
    console.log(`평균 overall_score: ${Math.round(totalScore / scoredCount)}점`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
