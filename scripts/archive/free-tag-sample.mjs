#!/usr/bin/env node
/**
 * STEP 1: 자유 태깅 샘플 — 100건
 * 선택지 없이 Gemini 2.5 Pro에게 자유롭게 분류시켜서
 * 실제 우리 광고에 나오는 속성값 패턴을 도출
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sbGet, env } from "./lib/db-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 환경변수 ──
const GEMINI_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";

if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

// ━━━ 자유 태깅 프롬프트 ━━━
const FREE_TAG_PROMPT = `너는 광고 크리에이티브 분석 전문가야. 이 광고 소재 이미지를 보고 아래 항목들을 **선택지 제한 없이 자유롭게** 분류해라.

각 항목에 대해 가장 정확한 값을 자유롭게 써라. 기존 분류 체계에 얽매이지 마라.
한국 화장품/뷰티/건강기능식품 자사몰 광고라는 맥락을 고려해라.

순수 JSON만 반환. 마크다운 코드블록 사용 금지.

{
  "format": "이미지/영상/캐러셀/GIF 중 자유롭게",

  "hook": {
    "type": "이 광고가 사람의 시선을 끄는 방식 (자유롭게 분류)",
    "text": "후킹에 사용된 텍스트 (없으면 null)",
    "psychological_trigger": "어떤 심리적 트리거를 사용하는지 (자유롭게)"
  },

  "emotion": {
    "primary": "이 광고가 전달하는 주된 감정 (자유롭게)",
    "secondary": "부차적 감정 (없으면 null)",
    "intensity": "감정 강도 (약/중/강)"
  },

  "visual_style": {
    "overall": "전체적인 비주얼 스타일 (자유롭게)",
    "production_quality": "제작 퀄리티 수준 (자유롭게)",
    "composition": "구도/레이아웃 특징 (자유롭게)"
  },

  "product": {
    "visibility": "상품이 얼마나 보이는지 (자유롭게)",
    "presentation": "상품을 어떻게 보여주는지 (자유롭게)",
    "category_hint": "어떤 종류의 제품인지 (자유롭게)"
  },

  "human_element": {
    "presence": "사람 등장 여부와 방식 (자유롭게)",
    "role": "등장인물의 역할 (자유롭게, 없으면 null)"
  },

  "text_overlay": {
    "amount": "텍스트 양 (자유롭게)",
    "headline": "메인 헤드라인 텍스트",
    "key_message": "핵심 메시지 한 줄 요약",
    "readability": "모바일에서 읽기 쉬운 정도 (자유롭게)"
  },

  "color": {
    "dominant": "지배적 색상 hex",
    "palette": ["색상 hex 목록"],
    "mood": "색상이 주는 무드 (자유롭게)",
    "brand_consistency": "브랜드 색상 일관성 (자유롭게)"
  },

  "cta": {
    "type": "CTA 유형 (자유롭게)",
    "text": "CTA 텍스트 (없으면 null)",
    "urgency_level": "긴급감 수준 (자유롭게)"
  },

  "offer": {
    "type": "프로모션/오퍼 유형 (자유롭게, 없으면 none)",
    "details": "오퍼 상세 (할인율, 증정 등)"
  },

  "social_proof": {
    "types": ["사용된 사회적 증거 종류들 (자유롭게)"],
    "strength": "사회적 증거 강도 (자유롭게)"
  },

  "target_audience_hint": "이 광고가 겨냥하는 타겟 추정 (자유롭게)",

  "creative_fatigue_risk": "이 소재의 피로도 위험 (자유롭게, 이유 포함)",

  "standout_element": "이 광고에서 가장 눈에 띄는 요소 1개"
}`;

// ━━━ Gemini Vision 분석 ━━━
async function analyzeCreative(imageUrl, adCopy, mediaType) {
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    return { error: `이미지 다운로드 타임아웃: ${e.message}` };
  }
  if (!imgRes.ok) return { error: `이미지 다운로드 실패: ${imgRes.status}` };

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");

  const parts = [{ inline_data: { mime_type: mimeType, data: base64 } }];
  if (adCopy) parts.push({ text: `광고 카피: ${adCopy}` });
  parts.push({ text: FREE_TAG_PROMPT });

  let genRes;
  try {
    genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
  } catch (e) {
    return { error: `Gemini API 타임아웃: ${e.message}` };
  }
  if (!genRes.ok) return { error: `Gemini API 실패: ${genRes.status}` };

  const data = await genRes.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    return { error: `응답 없음 (finishReason: ${candidate?.finishReason || "UNKNOWN"})` };
  }

  const rawText = candidate.content.parts[0].text;
  try {
    return JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    return { error: "JSON 파싱 실패", raw: rawText.slice(0, 300) };
  }
}

// ━━━ 메인 ━━━
async function main() {
  console.log("=== 자유 태깅 샘플 100건 ===\n");

  // storage_url 있는 것 우선 (CDN 만료 걱정 없음), 다양한 계정에서 고루 샘플링
  const creatives = await sbGet(
    `/creative_media?select=id,media_url,storage_url,media_type,ad_copy,creatives!inner(ad_id,account_id,brand_name)&is_active=eq.true&storage_url=not.is.null&limit=100&order=creatives.account_id`
  );

  console.log(`대상: ${creatives.length}건\n`);

  const results = [];
  let success = 0;
  let errors = 0;

  for (let i = 0; i < creatives.length; i++) {
    const c = creatives[i];
    const imageUrl = c.storage_url || c.media_url;
    process.stdout.write(`[${i + 1}/${creatives.length}] ${c.creatives?.brand_name || c.creatives?.account_id} — `);

    const analysis = await analyzeCreative(imageUrl, c.ad_copy, c.media_type);

    if (analysis.error) {
      console.log(`❌ ${analysis.error}`);
      errors++;
      results.push({ ad_id: c.creatives?.ad_id, account_id: c.creatives?.account_id, brand: c.creatives?.brand_name, error: analysis.error });
    } else {
      const hook = analysis.hook?.type || "?";
      const emotion = analysis.emotion?.primary || "?";
      const style = analysis.visual_style?.overall || "?";
      console.log(`✅ hook: ${hook}, emotion: ${emotion}, style: ${style}`);
      success++;
      results.push({
        ad_id: c.creatives?.ad_id,
        account_id: c.creatives?.account_id,
        brand: c.creatives?.brand_name,
        media_type: c.media_type,
        analysis,
      });
    }

    // 레이트 리밋 방지
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 결과 저장
  const outPath = resolve(__dirname, "..", "data", "free-tag-sample-100.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`\n━━━ 결과 ━━━`);
  console.log(`성공: ${success}건`);
  console.log(`실패: ${errors}건`);
  console.log(`저장: ${outPath}`);

  // ━━━ 속성값 빈도 분석 ━━━
  console.log(`\n━━━ 속성값 빈도 분석 ━━━`);

  const freq = {
    hook_type: {}, emotion_primary: {}, emotion_secondary: {},
    visual_style: {}, production_quality: {}, 
    product_presentation: {}, human_role: {},
    cta_type: {}, offer_type: {}, social_proof: {},
    psychological_trigger: {}, target_audience: {},
  };

  for (const r of results) {
    if (r.error) continue;
    const a = r.analysis;
    if (a.hook?.type) freq.hook_type[a.hook.type] = (freq.hook_type[a.hook.type] || 0) + 1;
    if (a.hook?.psychological_trigger) freq.psychological_trigger[a.hook.psychological_trigger] = (freq.psychological_trigger[a.hook.psychological_trigger] || 0) + 1;
    if (a.emotion?.primary) freq.emotion_primary[a.emotion.primary] = (freq.emotion_primary[a.emotion.primary] || 0) + 1;
    if (a.emotion?.secondary) freq.emotion_secondary[a.emotion.secondary] = (freq.emotion_secondary[a.emotion.secondary] || 0) + 1;
    if (a.visual_style?.overall) freq.visual_style[a.visual_style.overall] = (freq.visual_style[a.visual_style.overall] || 0) + 1;
    if (a.visual_style?.production_quality) freq.production_quality[a.visual_style.production_quality] = (freq.production_quality[a.visual_style.production_quality] || 0) + 1;
    if (a.product?.presentation) freq.product_presentation[a.product.presentation] = (freq.product_presentation[a.product.presentation] || 0) + 1;
    if (a.human_element?.role) freq.human_role[a.human_element.role] = (freq.human_role[a.human_element.role] || 0) + 1;
    if (a.cta?.type) freq.cta_type[a.cta.type] = (freq.cta_type[a.cta.type] || 0) + 1;
    if (a.offer?.type) freq.offer_type[a.offer.type] = (freq.offer_type[a.offer.type] || 0) + 1;
    if (a.social_proof?.types) {
      for (const sp of a.social_proof.types) {
        freq.social_proof[sp] = (freq.social_proof[sp] || 0) + 1;
      }
    }
    if (a.target_audience_hint) freq.target_audience[a.target_audience_hint] = (freq.target_audience[a.target_audience_hint] || 0) + 1;
  }

  for (const [category, values] of Object.entries(freq)) {
    const sorted = Object.entries(values).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) continue;
    console.log(`\n[${category}]`);
    for (const [val, count] of sorted.slice(0, 15)) {
      console.log(`  ${count}건 — ${val}`);
    }
  }

  // 빈도 분석도 파일로 저장
  const freqPath = resolve(__dirname, "..", "data", "free-tag-frequency.json");
  writeFileSync(freqPath, JSON.stringify(freq, null, 2));
  console.log(`\n빈도 분석 저장: ${freqPath}`);
}

main().catch(console.error);
