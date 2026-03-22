#!/usr/bin/env node
/**
 * 5축 통합 분석 배치 스크립트 (v3)
 *
 * Gemini 2.5 Pro로 소재 이미지/영상을 5축 분석:
 *   visual, text, psychology, quality, attention (+audio/structure 영상 전용)
 *
 * 결과: creative_media.analysis_json (JSONB)
 * 폴백: ad_creative_embeddings에만 있는 경우 → video_analysis에 저장
 *
 * Usage:
 *   node scripts/analyze-five-axis.mjs --dry-run
 *   node scripts/analyze-five-axis.mjs --limit 50
 *   node scripts/analyze-five-axis.mjs --account 123456789
 *   node scripts/analyze-five-axis.mjs --type IMAGE
 *   node scripts/analyze-five-axis.mjs --type VIDEO
 *   node scripts/analyze-five-axis.mjs --mode free --limit 100 --stratified
 *   node scripts/analyze-five-axis.mjs --mode cluster
 *   node scripts/analyze-five-axis.mjs --mode final
 *   node scripts/analyze-five-axis.mjs --source competitor [--limit N] [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const STRATIFIED = process.argv.includes("--stratified");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;
const ACCOUNT_IDX = process.argv.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;
const TYPE_IDX = process.argv.indexOf("--type");
const FILTER_TYPE = TYPE_IDX !== -1 ? process.argv[TYPE_IDX + 1].toUpperCase() : null;
const MODE_IDX = process.argv.indexOf("--mode");
const MODE = MODE_IDX !== -1 ? process.argv[MODE_IDX + 1].toLowerCase() : "final";
const SOURCE_IDX = process.argv.indexOf("--source");
const SOURCE = SOURCE_IDX !== -1 ? process.argv[SOURCE_IDX + 1].toLowerCase() : "creative";

if (!["free", "cluster", "final"].includes(MODE)) {
  console.error("--mode는 free|cluster|final 중 하나여야 합니다.");
  process.exit(1);
}

if (!["creative", "competitor"].includes(SOURCE)) {
  console.error("--source는 creative|competitor 중 하나여야 합니다.");
  process.exit(1);
}

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

const GEMINI_MODEL = "gemini-2.5-pro";
const ANALYSIS_MODEL_NAME = "gemini-2.5-pro";
const RATE_LIMIT_MS = 4000; // 분당 15 요청 → 4초 간격
const MAX_RETRIES = 3;
// competitor 모드 전용 상수
const GEMINI_MODEL_COMPETITOR = "gemini-2.0-flash";
const RATE_LIMIT_COMPETITOR_MS = 2000; // Flash는 빠르므로 2초

// output 디렉토리 보장
const OUTPUT_DIR = resolve(__dirname, "output");
try {
  mkdirSync(OUTPUT_DIR, { recursive: true });
} catch {}

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── v3 분석 프롬프트 (기존 — 호환성 유지용 주석 처리) ──
/*
const IMAGE_PROMPT = `이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.

{
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "image",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "style": "ugc|professional|minimal|bold|lifestyle",
    "layout": { "text_pct": 20, "whitespace_pct": 15, "complexity": "simple|moderate|complex" },
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" }
  },
  "text": {
    "hook": { "type": "question|shock|benefit|problem|curiosity|none", "text": "후킹 텍스트" },
    "overlay_texts": ["텍스트1", "텍스트2"],
    "cta_text": "CTA 문구",
    "key_message": "핵심 메시지",
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "audio": null,
  "structure": null,
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  }
}`;

const VIDEO_PROMPT = `이 광고 영상의 썸네일을 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.

{
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "video",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "style": "ugc|professional|minimal|bold|lifestyle",
    "layout": { "text_pct": 20, "whitespace_pct": 15, "complexity": "simple|moderate|complex" },
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" },
    "scene_timeline": [
      { "sec": "0-3", "type": "hook|problem|demo|result|cta|brand", "desc": "설명" }
    ],
    "motion_pattern": "static|slow|fast|mixed",
    "scene_transition_speed": "slow|medium|fast"
  },
  "text": {
    "hook": { "type": "question|shock|benefit|problem|curiosity|none", "text": "후킹 텍스트" },
    "overlay_texts": ["텍스트1"],
    "cta_text": "CTA 문구",
    "key_message": "핵심 메시지",
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "audio": {
    "narration_text": "추정 나레이션 (썸네일 기반 추측)",
    "bgm_genre": "pop|calm|exciting|none",
    "audio_emotion": "upbeat|calm|urgent|neutral",
    "audio_type": "narration|bgm|sfx|silent|mixed"
  },
  "structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "설명" }
    ],
    "pacing": "fast|medium|slow",
    "hook_type": "question|shock|benefit|problem|curiosity",
    "ending_cta_type": "button|text|overlay|swipe-up|none"
  },
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  }
}`;
*/

// ── v3 프롬프트 (FINAL 모드 — enum 강제) ──
const IMAGE_PROMPT_V3 = `이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.
"|"로 구분된 값 중 하나만 선택해서 채워라. 임의로 다른 값 사용 금지.

{
  "model": "gemini-2.5-pro",
  "type": "IMAGE",
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "image",
    "hook_type": "question|shock|benefit|problem|curiosity|comparison|testimonial|none",
    "visual_style": "professional|ugc|minimal|bold|lifestyle|graphic",
    "composition": "center|thirds|full_bleed|text_overlay|split",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_element": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "text_overlay_ratio": 15,
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" }
  },
  "text": {
    "headline_type": "benefit|discount|question|comparison|testimonial|stat|none",
    "key_message": "핵심 메시지 (한국어)",
    "cta_text": "CTA 문구",
    "overlay_texts": ["텍스트1", "텍스트2"],
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "psychology": {
    "emotion": "trust|excitement|fear|empathy|curiosity|joy|urgency|none",
    "psychological_trigger": "social_proof|scarcity|authority|reciprocity|commitment|liking|none",
    "offer_type": "discount|bundle|free_shipping|free_trial|gift|none",
    "urgency": "timer|limited|seasonal|none",
    "social_proof_type": "review_count|star_rating|user_count|expert|celebrity|none"
  },
  "quality": {
    "production_quality": "professional|semi|ugc|low",
    "readability": "high|medium|low",
    "creative_fatigue_risk": null,
    "most_similar_ad_id": null,
    "similarity_score": null
  },
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  },
  "audio": null,
  "structure": null,
  "andromeda_signals": {
    "visual_fingerprint": "하이픈으로 연결된 시각 요소 키워드 3-5개 (예: mom-child-beauty-demo)",
    "text_fingerprint": "하이픈으로 연결된 카피 구조 키워드 3-5개 (예: problem-solution-result)",
    "audio_fingerprint": null,
    "structure_fingerprint": "하이픈으로 연결된 구조 키워드 3-5개 (예: hook-demo-cta)",
    "pda": {
      "persona": "타겟 페르소나 키워드 (예: young_mom, office_worker, student)",
      "desire": "핵심 욕구 키워드 (예: beauty, health, saving, convenience)",
      "awareness": "unaware|problem_aware|solution_aware|product_aware|most_aware"
    }
  },
  "scores": null
}`;

const VIDEO_PROMPT_V3 = `이 광고 소재를 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.
"|"로 구분된 값 중 하나만 선택해서 채워라. 임의로 다른 값 사용 금지.

{
  "model": "gemini-2.5-pro",
  "type": "VIDEO",
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "video",
    "hook_type": "question|shock|benefit|problem|curiosity|comparison|testimonial|none",
    "visual_style": "professional|ugc|minimal|bold|lifestyle|graphic",
    "composition": "center|thirds|full_bleed|text_overlay|split",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_element": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "text_overlay_ratio": 15,
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" },
    "scene_timeline": [
      { "sec": "0-3", "type": "hook|problem|demo|result|cta|brand", "desc": "설명" }
    ],
    "motion_pattern": "static|slow|fast|mixed",
    "scene_transition_speed": "slow|medium|fast"
  },
  "text": {
    "headline_type": "benefit|discount|question|comparison|testimonial|stat|none",
    "key_message": "핵심 메시지 (한국어)",
    "cta_text": "CTA 문구",
    "overlay_texts": ["텍스트1"],
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "psychology": {
    "emotion": "trust|excitement|fear|empathy|curiosity|joy|urgency|none",
    "psychological_trigger": "social_proof|scarcity|authority|reciprocity|commitment|liking|none",
    "offer_type": "discount|bundle|free_shipping|free_trial|gift|none",
    "urgency": "timer|limited|seasonal|none",
    "social_proof_type": "review_count|star_rating|user_count|expert|celebrity|none"
  },
  "quality": {
    "production_quality": "professional|semi|ugc|low",
    "readability": "high|medium|low",
    "creative_fatigue_risk": null,
    "most_similar_ad_id": null,
    "similarity_score": null
  },
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  },
  "audio": {
    "narration_text": "전사 텍스트 (한국어, 영상 기반)",
    "bgm_genre": "pop|calm|exciting|dramatic|none",
    "sound_effects": "효과음 설명 또는 none",
    "audio_emotion": "upbeat|calm|urgent|dramatic|neutral",
    "audio_type": "narration|bgm|sfx|silent|mixed"
  },
  "structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "설명" }
    ],
    "pacing": "fast|medium|slow",
    "hook_type": "question|shock|benefit|problem|curiosity",
    "ending_cta_type": "button|text|overlay|swipe-up|none"
  },
  "eye_tracking": {
    "frames": [
      {
        "timestamp": 0,
        "fixations": [
          { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "텍스트|제품|인물|CTA|배경|로고" }
        ]
      },
      {
        "timestamp": 3,
        "fixations": [
          { "x": 0.3, "y": 0.5, "weight": 0.7, "label": "제품" }
        ]
      }
    ]
  },
  "andromeda_signals": {
    "visual_fingerprint": "하이픈으로 연결된 시각 요소 키워드 3-5개 (예: mom-child-beauty-demo)",
    "text_fingerprint": "하이픈으로 연결된 카피 구조 키워드 3-5개 (예: problem-solution-result)",
    "audio_fingerprint": "하이픈으로 연결된 오디오 키워드 (예: narration-upbeat)",
    "structure_fingerprint": "하이픈으로 연결된 구조 키워드 3-5개 (예: hook-demo-cta)",
    "pda": {
      "persona": "타겟 페르소나 키워드 (예: young_mom, office_worker, student)",
      "desire": "핵심 욕구 키워드 (예: beauty, health, saving, convenience)",
      "awareness": "unaware|problem_aware|solution_aware|product_aware|most_aware"
    }
  },
  "scores": null
}
eye_tracking: 영상의 3초 간격(0,3,6,9,12,15초)으로 시청자 시선 고정점을 예측하라.
  - x,y: 0.0~1.0 비율 (좌상단 0,0 / 우하단 1,1)
  - weight: 주목도 0.0~1.0
  - label: 시선 대상 (텍스트|제품|인물|CTA|배경|로고)`;

// ── v3 FREE 모드 프롬프트 (enum 없이 자유 기술) ──
const IMAGE_PROMPT_FREE = `이 광고 소재 이미지를 분석해서 아래 항목을 자유롭게 기술하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지.
각 항목의 설명 문구는 무시하고 실제 분석 결과를 그 자리에 채워라.

{
  "summary": "소재 한줄 요약 (한국어)",
  "hook_type": "이 소재의 시각적 후킹 방식을 자유롭게 기술",
  "visual_style": "비주얼 스타일을 자유롭게 기술",
  "composition": "화면 구성 방식을 자유롭게 기술",
  "emotion": "이 소재가 유발하는 감정을 자유롭게 기술",
  "psychological_trigger": "심리적 설득 트리거를 자유롭게 기술",
  "offer_type": "오퍼 유형(할인/묶음/무료배송 등)을 자유롭게 기술",
  "urgency": "긴박감/희소성 요소를 자유롭게 기술",
  "production_quality": "제작 품질 수준을 자유롭게 기술",
  "headline_type": "헤드라인 유형을 자유롭게 기술",
  "key_message": "핵심 메시지 (한국어)",
  "cta_text": "CTA 문구",
  "social_proof_type": "소셜 증명 유형을 자유롭게 기술",
  "readability": "가독성 수준을 자유롭게 기술",
  "human_element": "인물 등장 여부 및 특징을 자유롭게 기술",
  "color_tone": "색상 톤을 자유롭게 기술",
  "andromeda_visual_fingerprint": "이 소재의 시각적 지문을 하이픈 연결 키워드로 기술",
  "andromeda_text_fingerprint": "이 소재의 텍스트 구조 지문을 하이픈 연결 키워드로 기술",
  "andromeda_persona": "타겟 페르소나를 자유롭게 기술",
  "andromeda_desire": "소구하는 핵심 욕구를 자유롭게 기술",
  "media_type": "IMAGE"
}`;

const VIDEO_PROMPT_FREE = `이 광고 소재를 분석해서 아래 항목을 자유롭게 기술하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지.
각 항목의 설명 문구는 무시하고 실제 분석 결과를 그 자리에 채워라.

{
  "summary": "소재 한줄 요약 (한국어)",
  "hook_type": "이 소재의 시각적/청각적 후킹 방식을 자유롭게 기술",
  "visual_style": "비주얼 스타일을 자유롭게 기술",
  "composition": "화면 구성 방식을 자유롭게 기술",
  "emotion": "이 소재가 유발하는 감정을 자유롭게 기술",
  "psychological_trigger": "심리적 설득 트리거를 자유롭게 기술",
  "offer_type": "오퍼 유형(할인/묶음/무료배송 등)을 자유롭게 기술",
  "urgency": "긴박감/희소성 요소를 자유롭게 기술",
  "production_quality": "제작 품질 수준을 자유롭게 기술",
  "headline_type": "헤드라인 유형을 자유롭게 기술",
  "key_message": "핵심 메시지 (한국어)",
  "cta_text": "CTA 문구",
  "social_proof_type": "소셜 증명 유형을 자유롭게 기술",
  "readability": "가독성 수준을 자유롭게 기술",
  "motion_pattern": "영상 움직임 패턴을 자유롭게 기술",
  "audio_style": "음향/나레이션 스타일을 자유롭게 기술",
  "scene_structure": "장면 구성 흐름을 자유롭게 기술",
  "color_tone": "색상 톤을 자유롭게 기술",
  "eye_tracking_description": "영상의 시간대별 시선 이동 패턴을 자유롭게 기술",
  "andromeda_visual_fingerprint": "이 소재의 시각적 지문을 하이픈 연결 키워드로 기술",
  "andromeda_text_fingerprint": "이 소재의 텍스트 구조 지문을 하이픈 연결 키워드로 기술",
  "andromeda_persona": "타겟 페르소나를 자유롭게 기술",
  "andromeda_desire": "소구하는 핵심 욕구를 자유롭게 기술",
  "media_type": "VIDEO"
}`;

// ── CLUSTER 모드 프롬프트 ──
const CLUSTER_PROMPT = (freeResults) => `아래는 광고 소재 ${freeResults.length}건의 자유 태깅 분석 결과다.
각 속성별로 5-8개 대표 카테고리로 클러스터링하라.
각 카테고리의 이름, 설명, 해당 건수를 출력하라.
결과는 순수 JSON으로만 반환. 마크다운 금지.

분석 대상 속성:
hook_type, visual_style, composition, emotion, psychological_trigger, offer_type, urgency, production_quality, headline_type, social_proof_type

자유 태깅 데이터:
${JSON.stringify(freeResults, null, 2)}

출력 형식:
{
  "hook_type": {
    "clusters": [
      { "name": "카테고리명", "description": "설명", "count": 12, "examples": ["예시1", "예시2"] }
    ]
  },
  "visual_style": { ... },
  "composition": { ... },
  "emotion": { ... },
  "psychological_trigger": { ... },
  "offer_type": { ... },
  "urgency": { ... },
  "production_quality": { ... },
  "headline_type": { ... },
  "social_proof_type": { ... }
}`;

// ── Gemini Vision 분석 ──
async function analyzeWithGemini(imageUrl, adCopy, mediaType, mode, videoUrl = null) {
  const isVideo = mediaType === "VIDEO";
  let prompt;
  if (mode === "free") {
    prompt = isVideo ? VIDEO_PROMPT_FREE : IMAGE_PROMPT_FREE;
  } else {
    // final (기본값)
    prompt = isVideo ? VIDEO_PROMPT_V3 : IMAGE_PROMPT_V3;
  }

  const parts = [];

  // VIDEO + videoUrl 있는 경우: 비디오 파일 우선 사용
  if (isVideo && videoUrl) {
    try {
      const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) });
      if (vidRes.ok) {
        const vidBuf = await vidRes.arrayBuffer();
        if (vidBuf.byteLength <= 20 * 1024 * 1024) {
          const vidBase64 = Buffer.from(vidBuf).toString("base64");
          const vidMime = (vidRes.headers.get("content-type") || "video/mp4").split(";")[0];
          parts.push({ inline_data: { mime_type: vidMime, data: vidBase64 } });
          console.log(`  [VIDEO] mp4 전달 (${(vidBuf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
        } else {
          console.log(`  [VIDEO] mp4 크기 초과 (${(vidBuf.byteLength / 1024 / 1024).toFixed(1)}MB > 20MB) → 썸네일 폴백`);
        }
      }
    } catch (e) {
      console.warn(`  [VIDEO] mp4 다운로드 실패 → 썸네일 폴백:`, e.message);
    }
  }

  // 비디오 parts가 비어있으면 (IMAGE 또는 VIDEO 폴백) 기존 이미지 로직
  if (parts.length === 0) {
    let imgRes;
    try {
      imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      return { error: `다운로드 타임아웃: ${e.message}` };
    }

    if (!imgRes.ok) {
      return { error: `다운로드 실패: ${imgRes.status}` };
    }

    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
    const buf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
  }

  if (adCopy) parts.push({ text: `광고 카피: ${adCopy}` });
  parts.push({ text: prompt });

  // Gemini API 호출 (재시도)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
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
          signal: AbortSignal.timeout(90_000),
        }
      );

      if (res.status === 429 || res.status >= 500) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  [${res.status}] ${waitMs}ms 후 재시도...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { error: `Gemini ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.[0]?.text) {
        return { error: `응답 없음 (${candidate?.finishReason || "UNKNOWN"})` };
      }

      const rawText = candidate.content.parts[0].text;
      try {
        return { result: JSON.parse(rawText) };
      } catch {
        // 폴백: JSON 추출
        const cleaned = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .replace(/\/\/.*/g, "")
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return { result: JSON.parse(match[0]) };
          } catch (e) {
            return { error: `JSON 파싱 실패: ${e.message}` };
          }
        }
        return { error: `JSON 추출 실패` };
      }
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(2000);
        continue;
      }
      return { error: `API 에러: ${e.message}` };
    }
  }
  return { error: "재시도 초과" };
}

// ── Gemini 텍스트 전용 호출 (cluster 모드) ──
async function callGeminiText(prompt) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 32768,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(120_000),
        }
      );

      if (res.status === 429 || res.status >= 500) {
        const waitMs = Math.pow(2, attempt + 1) * 2000;
        console.warn(`  [${res.status}] ${waitMs}ms 후 재시도...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.[0]?.text) {
        throw new Error(`응답 없음 (${candidate?.finishReason || "UNKNOWN"})`);
      }

      const rawText = candidate.content.parts[0].text;
      try {
        return JSON.parse(rawText);
      } catch {
        const cleaned = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error("클러스터 JSON 파싱 실패");
      }
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(4000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("재시도 초과");
}

// ── ROAS 기반 층화 샘플링 ──
async function fetchStratifiedSample(targetCount) {
  console.log("ROAS 기반 층화 샘플링 실행...");
  const topCount = 34;
  const midCount = 33;
  const botCount = 33;

  // Supabase REST API로 직접 층화 샘플링
  // quintile 기반으로 creative_media + creatives + creative_performance 조인
  const PAGE_SIZE = 1000;

  // 전체 소재 조회 (ROAS 포함)
  let allRows = [];
  let offset = 0;
  while (true) {
    let q =
      `/creative_media?select=id,creative_id,storage_url,media_type,ad_copy,creatives!inner(ad_id,account_id,creative_performance(roas))` +
      `&storage_url=not.is.null&is_active=eq.true&analysis_json=is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
    if (FILTER_TYPE) q += `&media_type=eq.${FILTER_TYPE}`;
    if (FILTER_ACCOUNT) q += `&creatives.account_id=eq.${FILTER_ACCOUNT}`;
    const batch = await sbGet(q);
    allRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`  전체 분석 대상 (미분석 + 활성): ${allRows.length}건`);

  // ROAS 기준 정렬
  const withRoas = allRows.map((r) => ({
    ...r,
    roas: r.creatives?.creative_performance?.[0]?.roas ?? 0,
  }));
  withRoas.sort((a, b) => b.roas - a.roas);

  const total = withRoas.length;
  const topCut = Math.floor(total * 0.2);
  const botCut = Math.floor(total * 0.8);

  const topGroup = withRoas.slice(0, topCut);
  const midGroup = withRoas.slice(topCut, botCut);
  const botGroup = withRoas.slice(botCut);

  // 무작위 샘플링
  const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
  const sample = [
    ...shuffle(topGroup).slice(0, topCount),
    ...shuffle(midGroup).slice(0, midCount),
    ...shuffle(botGroup).slice(0, botCount),
  ];

  console.log(`  층화 샘플: 상위 ${topGroup.length}건 → ${Math.min(topCount, topGroup.length)}건`);
  console.log(`  층화 샘플: 중위 ${midGroup.length}건 → ${Math.min(midCount, midGroup.length)}건`);
  console.log(`  층화 샘플: 하위 ${botGroup.length}건 → ${Math.min(botCount, botGroup.length)}건`);

  return sample.slice(0, targetCount || 100);
}

// ── CLUSTER 모드 실행 ──
async function runClusterMode() {
  console.log("CLUSTER 모드: 최신 free 결과 파일에서 클러스터링...");

  // 최신 free 결과 파일 찾기
  const files = readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith("five-axis-free-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("free 결과 파일이 없습니다. 먼저 --mode free를 실행하세요.");
    process.exit(1);
  }

  const latestFile = join(OUTPUT_DIR, files[0]);
  console.log(`  사용 파일: ${files[0]}`);

  const freeResults = JSON.parse(readFileSync(latestFile, "utf-8"));
  console.log(`  분석 데이터: ${freeResults.length}건`);

  if (freeResults.length === 0) {
    console.error("free 결과 파일이 비어 있습니다.");
    process.exit(1);
  }

  console.log("  Gemini 클러스터링 호출 중...");
  const clusterResult = await callGeminiText(CLUSTER_PROMPT(freeResults));

  const outputPath = join(OUTPUT_DIR, "five-axis-clusters.json");
  writeFileSync(outputPath, JSON.stringify(clusterResult, null, 2), "utf-8");
  console.log(`\n클러스터링 완료: ${outputPath}`);
  console.log("다음 단계: Smith님 리뷰 → enum 값 확정 → IMAGE_PROMPT_V3/VIDEO_PROMPT_V3에 반영");
}

// ── 경쟁사 소재 Gemini 분석 ──
async function analyzeCompetitorWithGemini(imageUrl, adBody) {
  const prompt = IMAGE_PROMPT_V3;
  const parts = [];

  // Meta CDN URL에서 이미지 다운로드
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    return { error: `다운로드 타임아웃: ${e.message}` };
  }

  if (!imgRes.ok) {
    return { error: `다운로드 실패: ${imgRes.status}` };
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  parts.push({ inline_data: { mime_type: mimeType, data: base64 } });

  if (adBody) parts.push({ text: `광고 카피: ${adBody}` });
  parts.push({ text: prompt });

  // Gemini API 호출 (Flash 모델, 재시도 3회)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_COMPETITOR}:generateContent?key=${GEMINI_KEY}`,
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

      if (res.status === 429 || res.status >= 500) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  [${res.status}] ${waitMs}ms 후 재시도...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { error: `Gemini ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.[0]?.text) {
        return { error: `응답 없음 (${candidate?.finishReason || "UNKNOWN"})` };
      }

      const rawText = candidate.content.parts[0].text;
      try {
        const parsed = JSON.parse(rawText);
        parsed.model = GEMINI_MODEL_COMPETITOR;
        return { result: parsed };
      } catch {
        const cleaned = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .replace(/\/\/.*/g, "")
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            parsed.model = GEMINI_MODEL_COMPETITOR;
            return { result: parsed };
          } catch (e) {
            return { error: `JSON 파싱 실패: ${e.message}` };
          }
        }
        return { error: `JSON 추출 실패` };
      }
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(2000);
        continue;
      }
      return { error: `API 에러: ${e.message}` };
    }
  }
  return { error: "재시도 초과" };
}

// ── 경쟁사 소재 배치 처리 ──
async function runCompetitorMode() {
  console.log(`경쟁사 소재 5축 분석${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`모델: ${GEMINI_MODEL_COMPETITOR}`);

  // competitor_ad_cache에서 analysis_json_v3 IS NULL 조회
  const PAGE_SIZE = 1000;
  let rows = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/competitor_ad_cache?select=id,ad_id,page_id,image_url,video_url,ad_body` +
        `&analysis_json_v3=is.null&image_url=not.is.null` +
        `&order=created_at.desc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`분석 대상: ${rows.length}건`);

  const toProcess = LIMIT && LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  console.log(`처리 예정: ${toProcess.length}건\n`);

  if (toProcess.length === 0) {
    console.log("처리할 경쟁사 소재가 없습니다.");
    return;
  }

  let success = 0;
  let errors = 0;
  let cdnErrors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const prefix = `[${i + 1}/${toProcess.length}]`;

    if (DRY_RUN) {
      if (i < 5 || i % 100 === 0) {
        console.log(`${prefix} [dry-run] ${row.ad_id}`);
      }
      success++;
      continue;
    }

    process.stdout.write(`${prefix} ${row.ad_id} — `);

    const { result, error } = await analyzeCompetitorWithGemini(
      row.image_url,
      row.ad_body
    );

    if (error) {
      if (error.includes("403") || error.includes("404")) {
        cdnErrors++;
        console.log(`X CDN 만료 (${error})`);
      } else {
        console.log(`X ${error}`);
      }
      errors++;
      await sleep(1000);
      continue;
    }

    const patch = await sbPatch(
      "competitor_ad_cache",
      `id=eq.${row.id}`,
      { analysis_json_v3: result }
    );

    if (!patch.ok) {
      console.log(`X DB 저장 실패: ${patch.body}`);
      errors++;
    } else {
      console.log(`OK ${result.summary?.slice(0, 40) || "OK"}`);
      success++;
    }

    await sleep(RATE_LIMIT_COMPETITOR_MS);

    if ((i + 1) % 50 === 0) {
      console.log(
        `\n  ── 중간: 성공 ${success}, 실패 ${errors} (CDN: ${cdnErrors}) ──\n`
      );
    }
  }

  console.log(`\n━━━ 경쟁사 분석 완료 ━━━`);
  console.log(
    `성공: ${success}건, 실패: ${errors}건 (CDN 만료: ${cdnErrors}건)`
  );
}

// ── main ──
async function main() {
  console.log(`5축 통합 분석 배치 v3${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`모드: ${MODE.toUpperCase()}, 모델: ${ANALYSIS_MODEL_NAME}`);
  console.log(
    `필터: account=${FILTER_ACCOUNT || "전체"}, type=${FILTER_TYPE || "전체"}, limit=${LIMIT || "없음"}${STRATIFIED ? ", 층화샘플링" : ""}\n`
  );

  // ── COMPETITOR 모드 ──
  if (SOURCE === "competitor") {
    await runCompetitorMode();
    return;
  }

  // ── CLUSTER 모드 ──
  if (MODE === "cluster") {
    await runClusterMode();
    return;
  }

  // ── FREE / FINAL 모드 ──

  // 1. creative_media에서 분석 대상 조회
  const PAGE_SIZE = 1000;
  let cmRows = [];
  let offset = 0;
  let cmHasAnalysisCol = true;
  try {
    while (true) {
      let query =
        `/creative_media?select=id,creative_id,storage_url,media_type,ad_copy,analysis_json,creatives!inner(ad_id,account_id)` +
        `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
      if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
      const batch = await sbGet(query);
      cmRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (e) {
    // analysis_json 컬럼이 아직 없으면 컬럼 없이 재시도
    console.log(`  creative_media (analysis_json 포함) 실패 — 컬럼 없이 재시도`);
    cmHasAnalysisCol = false;
    cmRows = [];
    offset = 0;
    try {
      while (true) {
        let query =
          `/creative_media?select=id,creative_id,storage_url,media_type,ad_copy,creatives!inner(ad_id,account_id)` +
          `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
        if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
        const batch = await sbGet(query);
        cmRows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch (e2) {
      console.log(`  creative_media 조회 완전 실패: ${e2.message}`);
    }
  }
  console.log(`creative_media: ${cmRows.length}건${cmHasAnalysisCol ? "" : " (analysis_json 컬럼 미생성)"}`);

  // 2. ad_creative_embeddings에서 추가 대상 (creative_media에 없는 것)
  const cmAdIds = new Set(cmRows.map((r) => r.creatives?.ad_id));
  let aceRows = [];
  offset = 0;
  while (true) {
    let query =
      `/ad_creative_embeddings?select=ad_id,account_id,storage_url,media_type,ad_copy,video_analysis` +
      `&storage_url=not.is.null&order=ad_id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
    if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
    if (FILTER_ACCOUNT) query += `&account_id=eq.${FILTER_ACCOUNT}`;
    const batch = await sbGet(query);
    aceRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  // creative_media에 이미 있는 것은 제외
  aceRows = aceRows.filter((r) => !cmAdIds.has(r.ad_id));
  console.log(`ad_creative_embeddings (추가): ${aceRows.length}건`);

  // 3. 통합 리스트 구성
  let allItems = [];

  // creative_media 행 (우선)
  for (const row of cmRows) {
    if (FILTER_ACCOUNT && String(row.creatives?.account_id) !== String(FILTER_ACCOUNT)) continue;
    // final 모드: 이미 v3 분석된 건 스킵 (analysis_json.model 존재 시)
    if (MODE === "final" && cmHasAnalysisCol && row.analysis_json?.model) continue;
    // free 모드: 아직 analysis_json 없는 것만
    if (MODE === "free" && cmHasAnalysisCol && row.analysis_json) continue;
    allItems.push({
      source: "creative_media",
      id: row.id,
      adId: row.creatives?.ad_id,
      accountId: row.creatives?.account_id,
      storageUrl: row.storage_url,
      mediaType: row.media_type,
      adCopy: row.ad_copy,
    });
  }

  // ad_creative_embeddings 행
  for (const row of aceRows) {
    if (row.video_analysis?.visual && row.video_analysis?.text) continue;
    allItems.push({
      source: "ace",
      id: null,
      adId: row.ad_id,
      accountId: row.account_id,
      storageUrl: row.storage_url,
      mediaType: row.media_type,
      adCopy: row.ad_copy,
    });
  }

  console.log(`\n분석 대상: ${allItems.length}건`);

  // FREE 모드 + 층화 샘플링
  if (MODE === "free" && STRATIFIED) {
    try {
      const stratifiedItems = await fetchStratifiedSample(LIMIT || 100);
      allItems = stratifiedItems.map((row) => ({
        source: "creative_media",
        id: row.id,
        adId: row.creatives?.ad_id,
        accountId: row.creatives?.account_id,
        storageUrl: row.storage_url,
        mediaType: row.media_type,
        adCopy: row.ad_copy,
        roas: row.roas,
      }));
      console.log(`층화 샘플링 적용: ${allItems.length}건`);
    } catch (e) {
      console.warn(`층화 샘플링 실패 (${e.message}), 일반 샘플링으로 fallback`);
      allItems = LIMIT ? allItems.slice(0, LIMIT) : allItems;
    }
  } else {
    const toProcess = LIMIT && LIMIT > 0 ? allItems.slice(0, LIMIT) : allItems;
    allItems = toProcess;
  }

  console.log(`처리 예정: ${allItems.length}건\n`);

  if (allItems.length === 0) {
    console.log("처리할 소재가 없습니다.");
    return;
  }

  let success = 0;
  let errors = 0;
  let skipped = 0;
  const freeResults = []; // free 모드 결과 누적

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const prefix = `[${i + 1}/${allItems.length}]`;

    if (DRY_RUN) {
      if (i < 5 || i % 100 === 0) {
        console.log(
          `${prefix} [dry-run] ${item.adId} (${item.mediaType}, ${item.source})${item.roas !== undefined ? `, ROAS=${item.roas}` : ""}`
        );
      }
      success++;
      continue;
    }

    process.stdout.write(`${prefix} ${item.adId} (${item.mediaType}) — `);

    // VIDEO 소재의 경우 비디오 원본 URL 조회
    let videoUrl = null;
    if (item.mediaType === "VIDEO") {
      // storage_url이 .mp4로 끝나면 Storage URL 직접 사용
      if (item.storageUrl?.endsWith(".mp4")) {
        videoUrl = `${SB_URL}/storage/v1/object/public/creatives/${item.storageUrl}`;
      } else {
        // creatives 테이블에서 video_url 조회
        try {
          const creatives = await sbGet(`/creatives?select=video_url&id=eq.${item.id}&limit=1`);
          if (creatives?.[0]?.video_url) {
            videoUrl = creatives[0].video_url;
          }
        } catch {}
      }
    }

    const { result, error } = await analyzeWithGemini(
      item.storageUrl,
      item.adCopy,
      item.mediaType,
      MODE,
      videoUrl
    );

    if (error) {
      console.log(`X ${error}`);
      errors++;
      await sleep(1000);
      continue;
    }

    // free 모드: 결과 누적 (DB 저장 없음)
    if (MODE === "free") {
      freeResults.push({
        ad_id: item.adId,
        account_id: item.accountId,
        media_type: item.mediaType,
        roas: item.roas ?? null,
        ...result,
      });
      console.log(`OK ${result.summary?.slice(0, 40) || "OK"}`);
      success++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    // final 모드: DB 저장
    if (item.source === "creative_media" && cmHasAnalysisCol) {
      const patch = await sbPatch("creative_media", `id=eq.${item.id}`, {
        analysis_json: result,
        analyzed_at: new Date().toISOString(),
        analysis_model: ANALYSIS_MODEL_NAME,
      });
      if (!patch.ok) {
        console.log(`X DB 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`OK ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    } else if (item.source === "creative_media" && !cmHasAnalysisCol) {
      // analysis_json 컬럼 미생성 → ace 폴백
      const patch = await sbPatch("ad_creative_embeddings", `ad_id=eq.${item.adId}`, {
        video_analysis: result,
      });
      if (!patch.ok) {
        console.log(`X ace 폴백 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`OK (ace폴백) ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    } else {
      // ace 폴백: video_analysis에 저장
      const patch = await sbPatch("ad_creative_embeddings", `ad_id=eq.${item.adId}`, {
        video_analysis: result,
      });
      if (!patch.ok) {
        console.log(`X ace 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`OK (ace) ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);

    // 50건마다 중간 통계
    if ((i + 1) % 50 === 0) {
      console.log(`\n  ── 중간 결과: 성공 ${success}건, 실패 ${errors}건, 스킵 ${skipped}건 ──\n`);
    }
  }

  // free 모드: 결과 파일 저장
  if (MODE === "free" && freeResults.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outputPath = join(OUTPUT_DIR, `five-axis-free-${timestamp}.json`);
    writeFileSync(outputPath, JSON.stringify(freeResults, null, 2), "utf-8");
    console.log(`\nfree 결과 저장: ${outputPath} (${freeResults.length}건)`);
    console.log("다음 단계: node scripts/analyze-five-axis.mjs --mode cluster");
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`성공: ${success}건, 실패: ${errors}건, 스킵: ${skipped}건`);
  console.log(`모드: ${MODE.toUpperCase()}, 모델: ${ANALYSIS_MODEL_NAME}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
