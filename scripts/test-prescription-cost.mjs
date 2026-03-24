#!/usr/bin/env node
/**
 * 처방 비용 테스트 스크립트
 *
 * 소재 10건(이미지 5 + 영상 5) 샘플로 Gemini 처방 실행,
 * 건당 토큰 수 + 비용 측정, 결과 출력.
 *
 * Usage:
 *   node scripts/test-prescription-cost.mjs
 *   node scripts/test-prescription-cost.mjs --limit 5
 */
import { getSupabaseConfig } from "./lib/env.mjs";

const { SB_URL, SB_KEY, env } = getSupabaseConfig();
const GEMINI_KEY = env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }

const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// Gemini 3 Pro 가격 (2026-03 기준, per 1M tokens)
const PRICE_INPUT_PER_M = 1.25;    // $1.25 / 1M input tokens
const PRICE_OUTPUT_PER_M = 10.0;   // $10.00 / 1M output tokens
const PRICE_IMAGE_PER = 0.0032;    // $0.00315 per image
const PRICE_VIDEO_PER_SEC = 0.0032; // $0.00315 per second of video

// ── 인수 파싱 ──
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const SAMPLE_LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 10 : 10;
const IMAGE_COUNT = Math.ceil(SAMPLE_LIMIT / 2);
const VIDEO_COUNT = SAMPLE_LIMIT - IMAGE_COUNT;

// ── 처방 가이드 (축1 레퍼런스) ──
const guide = `처방 가이드:
- 고객 여정 4단계: 감각(보고+듣고) → 사고(생각) → 행동(클릭) → 행동(구매)
- Top 5 Hook: Confession / Bold claim / Relatability / Contrast / Curiosity
- 메타 CTA 버튼은 플랫폼이 제공. 영상에서는 '누를 이유'만 만들 것
- 세이프티존: 상단14% + 하단35% + 좌우6% (9:16 기준)
- 사운드 오프에서도 자막으로 메시지 전달 가능해야
- 텍스트 비율 20% 이하
- UGC > professional (참여율), 얼굴 노출 시선 +40% (Neurons)
- 유사도 >0.92면 소재 다양화 시급
- 절대 금지: CTA 버튼 추가 처방, 세이프티존 밖 배치, 타겟팅 변경 처방`;

function buildPrompt(analysisJson, saliency, perf, adCopy, mediaType) {
  const analysisSection = analysisJson
    ? JSON.stringify({
        visual: analysisJson.visual,
        text: analysisJson.text,
        psychology: analysisJson.psychology,
        audio: analysisJson.audio,
        structure: analysisJson.structure,
        attention: analysisJson.attention,
      }, null, 2)
    : "분석 데이터 없음";

  return `너는 광고 소재 분석 전문가다. 아래 ${mediaType === "VIDEO" ? "영상" : "이미지"} 소재를 분석하고 처방을 생성해라.

${guide}

[이 소재의 5축 분석 결과]
${analysisSection}

[시선 데이터]
CTA 주목도: ${saliency?.cta_attention_score ?? "N/A"}, 인지부하: ${saliency?.cognitive_load ?? "N/A"}
top_fixations: ${JSON.stringify(saliency?.top_fixations ?? [])}

[성과 데이터]
3초시청률: ${perf?.video_p3s_rate ?? "N/A"}%, CTR: ${perf?.ctr ?? "N/A"}%, ROAS: ${perf?.roas ?? "N/A"}, 참여: ${perf?.engagement_per_10k ?? "N/A"}/만

[광고 카피]
${(adCopy || "").substring(0, 500)}

출력 형식 (JSON):
{
  "ad_category": { "format": "포맷", "hook_tactic": "훅 유형", "messaging": "메시징 앵글", "audience": "타겟" },
  "customer_journey_summary": {
    "sensation": "감각 단계 요약",
    "thinking": "사고 단계 요약",
    "action_click": "행동(클릭) 요약",
    "action_purchase": "행동(구매) 요약"
  },
  "top3_priorities": [
    { "rank": 1, "title": "개선 제목", "reason_reference": "축1 근거", "journey_stage": "여정 단계", "difficulty": "난이도" }
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;
}

// ── DB 조회 ──
async function fetchSamples(mediaType, limit) {
  // creative_media에서 analysis_json이 있고, creatives와 조인 가능한 건
  const url = `${SB_URL}/rest/v1/creative_media?select=id,creative_id,media_type,media_url,storage_url,analysis_json,ad_copy,media_hash,creatives!inner(ad_id,account_id)&media_type=eq.${mediaType}&analysis_json=not.is.null&storage_url=not.is.null&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, { headers: h });
  return res.json();
}

async function fetchSaliency(adId) {
  const res = await fetch(`${SB_URL}/rest/v1/creative_saliency?select=cta_attention_score,cognitive_load,top_fixations&ad_id=eq.${adId}&limit=1`, { headers: h });
  const data = await res.json();
  return data?.[0] ?? null;
}

async function fetchPerformance(adId) {
  const res = await fetch(`${SB_URL}/rest/v1/daily_ad_insights?select=video_p3s_rate,ctr,roas,engagement_per_10k&ad_id=eq.${adId}&order=impressions.desc&limit=1`, { headers: h });
  const data = await res.json();
  return data?.[0] ?? null;
}

// ── Gemini 호출 ──
async function callGemini(prompt, mediaUrl, mediaType) {
  const parts = [];

  // 미디어 첨부 (이미지 또는 영상)
  if (mediaUrl) {
    try {
      const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });
      if (mediaRes.ok) {
        const buf = await mediaRes.arrayBuffer();
        const sizeMB = buf.byteLength / 1024 / 1024;
        if (sizeMB <= 100) {
          const base64 = Buffer.from(buf).toString("base64");
          const mimeType = mediaType === "VIDEO" ? "video/mp4" : "image/jpeg";
          parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
        }
      }
    } catch {
      // 미디어 다운로드 실패 → 텍스트만
    }
  }

  parts.push({ text: prompt });

  const start = Date.now();
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();

  const candidate = data.candidates?.[0];
  const usage = data.usageMetadata || candidate?.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || usage.inputTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || usage.outputTokenCount || 0;
  const totalTokens = inputTokens + outputTokens;

  const text = candidate?.content?.parts?.[0]?.text || null;
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* JSON 파싱 실패 */ }
  }

  return { inputTokens, outputTokens, totalTokens, elapsed, parsed, error: data.error ?? null };
}

// ── 비용 계산 ──
function calcCost(inputTokens, outputTokens, mediaType) {
  const inputCost = (inputTokens / 1_000_000) * PRICE_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  const mediaCost = mediaType === "VIDEO" ? PRICE_VIDEO_PER_SEC * 15 : PRICE_IMAGE_PER; // 영상 15초 가정
  return { inputCost, outputCost, mediaCost, total: inputCost + outputCost + mediaCost };
}

// ── 메인 ──
console.log(`\n🔬 처방 비용 테스트 — 모델: ${GEMINI_MODEL}`);
console.log(`   샘플: IMAGE ${IMAGE_COUNT}건 + VIDEO ${VIDEO_COUNT}건 = ${SAMPLE_LIMIT}건\n`);

const images = await fetchSamples("IMAGE", IMAGE_COUNT);
const videos = await fetchSamples("VIDEO", VIDEO_COUNT);
const samples = [...(images || []), ...(videos || [])];

if (samples.length === 0) {
  console.error("❌ 샘플 없음. creative_media에 analysis_json + storage_url이 있는 건이 필요합니다.");
  process.exit(1);
}

console.log(`📦 조회된 샘플: IMAGE ${images?.length ?? 0}건, VIDEO ${videos?.length ?? 0}건\n`);

const results = [];
let totalInput = 0, totalOutput = 0, totalCost = 0, totalElapsed = 0;

for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const adId = s.creatives?.ad_id;
  const accountId = s.creatives?.account_id;

  console.log(`[${i + 1}/${samples.length}] ${s.media_type} ad_id=${adId} account=${accountId}`);

  const saliency = adId ? await fetchSaliency(adId) : null;
  const perf = adId ? await fetchPerformance(adId) : null;
  const prompt = buildPrompt(s.analysis_json, saliency, perf, s.ad_copy, s.media_type);

  const result = await callGemini(prompt, s.storage_url, s.media_type);

  if (result.error) {
    console.log(`   ❌ 에러: ${JSON.stringify(result.error).substring(0, 200)}`);
    results.push({ mediaType: s.media_type, adId, error: true });
    continue;
  }

  const cost = calcCost(result.inputTokens, result.outputTokens, s.media_type);
  totalInput += result.inputTokens;
  totalOutput += result.outputTokens;
  totalCost += cost.total;
  totalElapsed += result.elapsed;

  console.log(`   ✅ input=${result.inputTokens} output=${result.outputTokens} total=${result.totalTokens} | ${(result.elapsed / 1000).toFixed(1)}초 | $${cost.total.toFixed(4)}`);

  results.push({
    mediaType: s.media_type,
    adId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.totalTokens,
    elapsedMs: result.elapsed,
    cost: cost.total,
    hasPrescription: !!result.parsed?.top3_priorities,
  });

  // Rate limit: 4초 간격
  if (i < samples.length - 1) {
    await new Promise(r => setTimeout(r, 4000));
  }
}

// ── 결과 요약 ──
const successResults = results.filter(r => !r.error);
const imageResults = successResults.filter(r => r.mediaType === "IMAGE");
const videoResults = successResults.filter(r => r.mediaType === "VIDEO");

const avg = (arr, key) => arr.length > 0 ? arr.reduce((s, r) => s + r[key], 0) / arr.length : 0;

console.log(`
════════════════════════════════════════════════
📊 처방 비용 테스트 결과 요약
════════════════════════════════════════════════

모델: ${GEMINI_MODEL}
총 샘플: ${samples.length}건 (성공: ${successResults.length}건, 실패: ${results.length - successResults.length}건)

┌────────────┬──────────┬───────────┬───────────┬──────────┬──────────┐
│ 유형       │ 건수     │ 평균 input│ 평균 output│ 평균 시간│ 평균 비용│
├────────────┼──────────┼───────────┼───────────┼──────────┼──────────┤
│ IMAGE      │ ${String(imageResults.length).padStart(4)}건   │ ${String(Math.round(avg(imageResults, "inputTokens"))).padStart(7)}  │ ${String(Math.round(avg(imageResults, "outputTokens"))).padStart(7)}   │ ${(avg(imageResults, "elapsedMs") / 1000).toFixed(1).padStart(6)}초 │ $${avg(imageResults, "cost").toFixed(4).padStart(6)} │
│ VIDEO      │ ${String(videoResults.length).padStart(4)}건   │ ${String(Math.round(avg(videoResults, "inputTokens"))).padStart(7)}  │ ${String(Math.round(avg(videoResults, "outputTokens"))).padStart(7)}   │ ${(avg(videoResults, "elapsedMs") / 1000).toFixed(1).padStart(6)}초 │ $${avg(videoResults, "cost").toFixed(4).padStart(6)} │
├────────────┼──────────┼───────────┼───────────┼──────────┼──────────┤
│ 합계       │ ${String(successResults.length).padStart(4)}건   │ ${String(totalInput).padStart(7)}  │ ${String(totalOutput).padStart(7)}   │ ${(totalElapsed / 1000).toFixed(1).padStart(6)}초 │ $${totalCost.toFixed(4).padStart(6)} │
└────────────┴──────────┴───────────┴───────────┴──────────┴──────────┘

건당 평균: input=${Math.round(avg(successResults, "inputTokens"))} output=${Math.round(avg(successResults, "outputTokens"))} | $${avg(successResults, "cost").toFixed(4)}/건
전체 3,000건 추정 비용: $${(avg(successResults, "cost") * 3000).toFixed(2)}

가격 기준 (${GEMINI_MODEL}):
  Input:  $${PRICE_INPUT_PER_M}/1M tokens
  Output: $${PRICE_OUTPUT_PER_M}/1M tokens
  Image:  $${PRICE_IMAGE_PER}/장
  Video:  $${PRICE_VIDEO_PER_SEC}/초 (15초 가정)
`);
