#!/usr/bin/env node
/**
 * 엔젤앤비 top5 소재 처방 생성 standalone 스크립트
 * prescription-engine의 13단계를 bypass하고 핵심만 실행:
 * 1. Gemini에 소재 정보 + 씬분석 + DeepGaze + 성과 데이터 전달
 * 2. 5축 scores + 처방 3건 생성
 * 3. analysis_json에 저장
 */

import { pool, query } from './lib/cloud-sql.mjs';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

if (!GEMINI_API_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }

const ACCOUNT_ID = "1112351559994391";

// Top 5 creative_media IDs (spend 순)
const MEDIA_IDS = [
  "6cbfc747-c043-4c05-8264-d3e277c828ba",  // VIDEO
  "43a24f27-daf3-4ab3-af88-7e45711936ef",  // VIDEO
  "6e9c0c6d-d5dc-4198-a921-e1acdfb14608",  // IMAGE
  "7702cf5a-7a23-4673-88a0-aea2615d28bf",  // IMAGE
  "9a534b70-0ee1-4168-98e8-660ff3a8d080",  // VIDEO
];

function parseJsonSafe(rawText) {
  try { return JSON.parse(rawText); } catch {}
  const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function callGemini(prompt, maxTokens = 8192) {
  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(120_000),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`Gemini 실패: ${res.status} ${err.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return raw ? parseJsonSafe(raw) : null;
}

async function generateForMedia(mediaId) {
  console.log(`\n━━━ 처방 시작: ${mediaId} ━━━`);

  // 1. 소재 정보 조회
  const rows = await query(
    `SELECT cm.id, cm.media_type, cm.ad_copy, cm.media_url, cm.storage_url,
            cm.analysis_json, cm.video_analysis, cm.saliency_url,
            c.ad_id, c.category,
            cp.roas, cp.ctr, cp.click_to_purchase_rate, cp.total_spend,
            cp.total_impressions, cp.total_clicks, cp.total_purchases
     FROM creative_media cm
     JOIN creatives c ON c.id = cm.creative_id
     LEFT JOIN creative_performance cp ON cp.creative_id = c.id
     WHERE cm.id = $1`,
    [mediaId]
  );

  if (rows.length === 0) { console.error("소재 없음"); return false; }
  const m = rows[0];
  console.log(`  타입: ${m.media_type}, 광고비: ${m.total_spend ?? 'N/A'}`);

  // 2. 기존 analysis_json에서 씬분석 추출
  const aj = m.analysis_json ?? {};
  const sceneAnalysis = aj.scene_analysis;
  const sceneSummary = sceneAnalysis?.scenes?.map(s =>
    `[${s.time}] ${s.type}: ${s.desc} (hook=${s.analysis?.hook_strength ?? 'N/A'})`
  ).join("\n") ?? "씬분석 없음";

  // 3. DeepGaze 요약
  const va = m.video_analysis;
  const deepgazeSummary = va?.top_fixations
    ? `시선 데이터: ${va.top_fixations.length}개 fixation, CTA 주목도: ${va.cta_attention_score ?? 'N/A'}`
    : m.saliency_url ? "이미지 시선분석 있음" : "시선 데이터 없음";

  // 4. 성과 데이터
  const perfSummary = m.total_spend
    ? `ROAS: ${m.roas?.toFixed(2) ?? 'N/A'}, CTR: ${((m.ctr ?? 0) * 100).toFixed(2)}%, 광고비: ${Math.round(m.total_spend / 10000)}만원, 구매전환율: ${((m.click_to_purchase_rate ?? 0) * 100).toFixed(2)}%`
    : "성과 데이터 없음";

  // 5. Gemini 프롬프트
  const prompt = `광고 소재를 5축으로 분석하고 처방 3건을 생성해라.

소재 정보:
- 타입: ${m.media_type}
- 광고 카피: ${m.ad_copy ?? '없음'}
- 카테고리: ${m.category ?? '미분류'}

씬분석 결과:
${sceneSummary}

시선분석:
${deepgazeSummary}

성과 데이터:
${perfSummary}

아래 JSON 형식으로 응답해라. 순수 JSON만, 마크다운 코드블록 금지.

{
  "scores": {
    "visual_impact": 0,
    "message_clarity": 0,
    "cta_effectiveness": 0,
    "social_proof_score": 0,
    "overall": 0
  },
  "five_axis": {
    "visual": {
      "color_scheme": "warm|cool|neutral",
      "product_visibility": "high|medium|low",
      "composition": "설명"
    },
    "text": {
      "headline_type": "benefit|problem|question|shock",
      "readability": "high|medium|low",
      "copy_summary": "카피 요약"
    },
    "psychology": {
      "emotion": "joy|trust|fear|surprise|anticipation",
      "social_proof_type": "UGC|expert|statistic|none",
      "urgency": "high|medium|low|none"
    },
    "hook": {
      "hook_type": "problem|curiosity|benefit|shock|question|contrast|relatability",
      "visual_style": "UGC|professional|meme|minimal",
      "composition": "closeup|wide|split"
    },
    "quality": {
      "production_level": "high|medium|low",
      "brand_consistency": "high|medium|low"
    }
  },
  "top3_prescriptions": [
    {
      "rank": 1,
      "title": "처방 제목",
      "category": "visual|copy|hook|targeting|format",
      "current_state": "현재 상태 설명",
      "prescription": "구체적인 처방 내용",
      "expected_impact": "high|medium|low",
      "effort": "low|medium|high",
      "reasoning": "왜 이 처방이 필요한지"
    }
  ],
  "customer_journey_summary": {
    "sensation": "시청자 첫인상",
    "thinking": "시청자 생각",
    "action_click": "클릭 유도 분석",
    "action_purchase": "구매 전환 분석"
  }
}

각 scores 점수는 0-100. 한국어로 작성.`;

  console.log("  Gemini 호출 중...");
  const result = await callGemini(prompt);

  if (!result?.scores) {
    console.error("  ❌ Gemini 응답 파싱 실패");
    return false;
  }

  console.log(`  ✅ scores: overall=${result.scores.overall}, 처방 ${result.top3_prescriptions?.length ?? 0}건`);

  // 6. DB 저장 — analysis_json에 merge
  const finalAnalysis = {
    ...aj,
    ...result.five_axis,
    scores: result.scores,
    top3_prescriptions: result.top3_prescriptions,
    customer_journey_summary: result.customer_journey_summary,
    meta: {
      model: GEMINI_MODEL,
      latency_ms: 0,
      generated_at: new Date().toISOString(),
    },
  };

  await query(
    "UPDATE creative_media SET analysis_json = $1 WHERE id = $2",
    [JSON.stringify(finalAnalysis), mediaId]
  );

  console.log("  ✅ DB 저장 완료");
  return true;
}

async function main() {
  console.log("========================================");
  console.log("엔젤앤비 처방 생성 (5개 소재)");
  console.log("========================================");

  let success = 0;
  for (const id of MEDIA_IDS) {
    try {
      if (await generateForMedia(id)) success++;
    } catch (e) {
      console.error(`❌ ${id}: ${e.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`완료: ${success}/${MEDIA_IDS.length}`);
  console.log("========================================");

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
