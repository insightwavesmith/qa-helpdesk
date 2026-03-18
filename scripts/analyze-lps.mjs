#!/usr/bin/env node
/**
 * LP 분석 스크립트 — Claude Vision 구조 분석 + Gemini 임베딩 + 일관성 점수
 *
 * Usage: node scripts/analyze-lps.mjs [--limit 20] [--skip-vision] [--skip-embed]
 *   --limit N       : 최대 N건 처리
 *   --skip-vision   : Claude Vision 분석 스킵
 *   --skip-embed    : 임베딩 + 일관성 점수 스킵
 *
 * 플로우:
 * 1. ad_creative_embeddings에서 lp_screenshot_url IS NOT NULL 조회
 * 2. Claude Vision (claude-haiku-4): LP 구조 분석 → lp_structure_analysis
 * 3. Gemini Embedding 3072: 스크린샷/텍스트/CTA → lp_embedding 등
 * 4. 소재↔LP 코사인 유사도 → creative_lp_consistency
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;
const SKIP_VISION = args.includes("--skip-vision");
const SKIP_EMBED = args.includes("--skip-embed");

// .env.local
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 3072;

if (!SB_URL || !SB_KEY) {
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ━━━ Supabase REST ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

async function sbPatch(table, matchCol, matchVal, updates) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    }
  );
  return { ok: res.ok, status: res.status };
}

// ━━━ Claude Vision ━━━
const VISION_PROMPT = `이 모바일 랜딩 페이지 스크린샷을 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

{
  "hero": { "type": "image|video|slide|gif", "count": 1 },
  "price": { "position": "top|mid|bottom", "discount_highlight": true },
  "reviews": {
    "position_pct": 60,
    "type": "alpha_review|text|photo_card|video|none",
    "density": "high|medium|low|none",
    "count_visible": 0,
    "avg_length": "short|medium|long"
  },
  "cta": { "type": "sticky|floating|inline|none" },
  "social_proof": { "rating": 0, "review_count": "", "hero_area": false },
  "page_length": "short|medium|long",
  "trust_badges": [],
  "option_modal": {
    "options": [],
    "cross_sell": false,
    "easy_pay": [],
    "urgency": { "stock_display": false, "time_deal": false },
    "touches_to_checkout": 0
  }
}`;

async function analyzeWithVision(screenshotUrl, ctaUrl) {
  if (!ANTHROPIC_KEY) {
    console.log("    ⚠️ ANTHROPIC_API_KEY 없음, Vision 스킵");
    return null;
  }

  const content = [];

  // 메인 스크린샷
  try {
    const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(15_000) });
    if (imgRes.ok) {
      const buf = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const mimeType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
      content.push({
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      });
    }
  } catch (e) {
    console.log(`    ⚠️ 메인 이미지 fetch 실패: ${e.message}`);
    return null;
  }

  // CTA 스크린샷 (있으면)
  if (ctaUrl) {
    try {
      const imgRes = await fetch(ctaUrl, { signal: AbortSignal.timeout(15_000) });
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        const mimeType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
        content.push({
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 },
        });
      }
    } catch {
      // CTA 없어도 진행
    }
  }

  content.push({ type: "text", text: VISION_PROMPT });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`    ⚠️ Claude Vision 실패: ${res.status} ${err.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`    ⚠️ Vision 파싱 실패: ${e.message}`);
    return null;
  }
}

// ━━━ Gemini 임베딩 ━━━
async function embedImage(imageUrl) {
  if (!imageUrl || !GEMINI_KEY) return null;
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) return null;
    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
    const buf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: {
            parts: [{ inline_data: { mime_type: mimeType, data: base64 } }],
          },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: DIMENSIONS,
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values || null;
  } catch {
    return null;
  }
}

async function embedText(text) {
  if (!text || text.trim().length < 5 || !GEMINI_KEY) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: DIMENSIONS,
      }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedding?.values || null;
}

// ━━━ 코사인 유사도 ━━━
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : Math.round((dot / d) * 10000) / 10000;
}

// ━━━ 메인 ━━━
async function main() {
  console.log("🚀 LP 분석 시작 (Vision + Embedding + Consistency)");
  console.log(`  limit: ${LIMIT}, skip-vision: ${SKIP_VISION}, skip-embed: ${SKIP_EMBED}`);

  // 대상 조회: lp_screenshot_url이 mobile 경로인 것
  const rows = await sbGet(
    `/ad_creative_embeddings?select=ad_id,lp_url,lp_screenshot_url,lp_cta_screenshot_url,lp_headline,lp_price,embedding_3072,text_embedding_3072,media_type&lp_screenshot_url=not.is.null&is_active=eq.true&limit=${LIMIT}`
  );
  console.log(`  대상: ${rows.length}건`);

  let visionOk = 0, embedOk = 0, consistOk = 0, errs = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`\n[${i + 1}/${rows.length}] ${row.ad_id} — ${(row.lp_url || "").slice(0, 60)}`);

    // ── Claude Vision 분석 ──
    if (!SKIP_VISION && row.lp_screenshot_url) {
      const analysis = await analyzeWithVision(
        row.lp_screenshot_url,
        row.lp_cta_screenshot_url
      );

      if (analysis) {
        const lpRow = {
          lp_url: row.lp_url,
          viewport: "mobile",
          hero_type: analysis.hero?.type || null,
          price_position: analysis.price?.position || null,
          discount_highlight: analysis.price?.discount_highlight || false,
          review_position_pct: analysis.reviews?.position_pct || null,
          review_type: analysis.reviews?.type || null,
          review_density: analysis.reviews?.density || null,
          review_count: analysis.reviews?.count_visible || null,
          cta_type: analysis.cta?.type || null,
          social_proof: analysis.social_proof || null,
          page_length: analysis.page_length || null,
          trust_badges: analysis.trust_badges || [],
          option_types: analysis.option_modal?.options || [],
          cross_sell: analysis.option_modal?.cross_sell || false,
          easy_pay: analysis.option_modal?.easy_pay || [],
          urgency_stock: analysis.option_modal?.urgency?.stock_display || false,
          urgency_timedeal: analysis.option_modal?.urgency?.time_deal || false,
          touches_to_checkout: analysis.option_modal?.touches_to_checkout || null,
          raw_analysis: analysis,
          model_version: "claude-haiku-4",
        };

        const result = await sbPost("lp_structure_analysis", lpRow);
        if (result.ok) {
          visionOk++;
          console.log(`  🔍 Vision 분석 완료`);
        } else {
          console.log(`  ⚠️ Vision DB 저장 실패: ${result.status}`);
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    // ── LP 임베딩 ──
    if (!SKIP_EMBED && row.lp_screenshot_url) {
      const updates = {};

      // 스크린샷 이미지 임베딩
      const imgVec = await embedImage(row.lp_screenshot_url);
      if (imgVec) {
        updates.lp_embedding = JSON.stringify(imgVec);
        console.log(`  🖼️ LP 이미지 임베딩`);
      }

      // 텍스트 임베딩 (headline + price)
      const lpText = [row.lp_headline, row.lp_price].filter(Boolean).join(" ");
      if (lpText.length > 3) {
        const txtVec = await embedText(lpText);
        if (txtVec) {
          updates.lp_text_embedding = JSON.stringify(txtVec);
          console.log(`  📝 LP 텍스트 임베딩`);
        }
      }

      // CTA 임베딩
      if (row.lp_cta_screenshot_url) {
        const ctaVec = await embedImage(row.lp_cta_screenshot_url);
        if (ctaVec) {
          updates.lp_cta_embedding = JSON.stringify(ctaVec);
          console.log(`  🔘 CTA 임베딩`);
        }
      }

      if (Object.keys(updates).length > 0) {
        const result = await sbPatch(
          "ad_creative_embeddings",
          "ad_id",
          row.ad_id,
          updates
        );
        if (result.ok) embedOk++;
        await new Promise((r) => setTimeout(r, 400));
      }

      // ── 일관성 점수 ──
      const creativeImg = row.embedding_3072;
      const creativeTxt = row.text_embedding_3072;
      const lpImg = imgVec;
      const lpTxt = updates.lp_text_embedding
        ? JSON.parse(updates.lp_text_embedding)
        : null;

      if (creativeImg || creativeTxt) {
        const visual = cosineSim(creativeImg, lpImg);
        const semantic = cosineSim(creativeTxt, lpTxt);
        const crossVt = cosineSim(creativeImg, lpTxt);
        const crossTv = cosineSim(creativeTxt, lpImg);
        const holistic = visual; // fullpage screenshot = 소재 vs LP 전체

        // 가중 평균 (null은 제외)
        const scores = [
          { val: visual, weight: 0.25 },
          { val: semantic, weight: 0.25 },
          { val: crossVt, weight: 0.15 },
          { val: crossTv, weight: 0.15 },
          { val: holistic, weight: 0.20 },
        ].filter((s) => s.val !== null);

        const totalWeight = scores.reduce((s, x) => s + x.weight, 0);
        const totalScore =
          totalWeight > 0
            ? Math.round(
                (scores.reduce((s, x) => s + x.val * x.weight, 0) / totalWeight) *
                  10000
              ) / 10000
            : null;

        const consistRow = {
          ad_id: row.ad_id,
          lp_url: row.lp_url,
          visual_score: visual,
          video_score: row.media_type === "VIDEO" ? visual : null,
          semantic_score: semantic,
          cross_vt_score: crossVt,
          cross_tv_score: crossTv,
          holistic_score: holistic,
          total_score: totalScore,
        };

        const cResult = await sbPost("creative_lp_consistency", consistRow);
        if (cResult.ok) {
          consistOk++;
          console.log(
            `  📊 일관성 점수: ${totalScore !== null ? (totalScore * 100).toFixed(1) + "%" : "N/A"}`
          );
        }
      }
    }
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`Vision 분석: ${visionOk}, LP 임베딩: ${embedOk}, 일관성 점수: ${consistOk}, 에러: ${errs}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
