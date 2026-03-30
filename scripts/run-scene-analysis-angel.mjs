#!/usr/bin/env node
/**
 * 엔젤앤비 VIDEO 3개 씬분석 standalone 스크립트
 * 1. mp4 → base64
 * 2. Gemini 씬분할
 * 3. Gemini 씬분석
 * 4. DB 저장
 */

import fs from 'fs';
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

if (!GEMINI_API_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
if (!DATABASE_URL) { console.error("DATABASE_URL 필요"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } });

const VIDEOS = [
  { id: "6cbfc747-c043-4c05-8264-d3e277c828ba", file: "/tmp/angelbeebaby-videos/6cbfc747.mp4" },
  { id: "43a24f27-daf3-4ab3-af88-7e45711936ef", file: "/tmp/angelbeebaby-videos/43a24f27.mp4" },
  { id: "9a534b70-0ee1-4168-98e8-660ff3a8d080", file: "/tmp/angelbeebaby-videos/9a534b70.mp4" },
];

const SCENE_SPLIT_PROMPT = `이 광고 영상을 초 단위로 분석해라.

Step 1: 매 초(0초, 1초, ...) 기준으로 화면에 보이는 주요 요소와 위치를 분석.
요소 type: "인물", "텍스트", "제품", "CTA", "배경" 5가지 중 선택.
요소 region (9분할): top_left, top_center, top_right, center_left, center_center, center_right, bottom_left, bottom_center, bottom_right
요소 area_pct: 해당 요소가 화면에서 차지하는 대략적 면적 비율 (%).

Step 2: 화면 내용이 실제로 바뀌는 지점에서 씬을 분할해라.
규칙:
- 같은 화면 구성이 유지되면 하나의 씬
- 화면 구성이 바뀌면 새 씬
- 씬 1개는 최대 5초
- 각 씬에 type(hook/demo/result/cta/brand) 부여

출력 형식 (JSON):
{
  "per_second": [
    {"sec": 0, "content": "화면에 보이는 것", "elements": [
      {"type": "인물", "region": "center_center", "area_pct": 60}
    ]}
  ],
  "scenes": [
    {"time": "0-2초", "type": "hook", "desc": "씬 설명"}
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;

function parseJsonSafe(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

async function callGemini(videoBase64, prompt, maxTokens = 8192) {
  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "video/mp4", data: videoBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(120_000),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`Gemini 실패: ${res.status} ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return rawText ? parseJsonSafe(rawText) : null;
}

async function analyzeVideo(vid) {
  console.log(`\n━━━ 씬분석 시작: ${vid.id} ━━━`);
  
  // 1. mp4 → base64
  const buf = fs.readFileSync(vid.file);
  const base64 = buf.toString("base64");
  console.log(`  mp4 크기: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);

  // 2. Gemini 씬분할
  console.log("  [1/3] Gemini 씬분할 호출...");
  const sceneSplit = await callGemini(base64, SCENE_SPLIT_PROMPT);
  if (!sceneSplit?.scenes?.length) {
    console.error("  ❌ 씬분할 실패");
    return false;
  }
  console.log(`  ✅ 씬분할 완료: ${sceneSplit.scenes.length}개 씬`);

  // 3. DB에서 video_analysis (DeepGaze) 데이터 조회
  const { rows: [mediaRow] } = await pool.query(
    "SELECT video_analysis, analysis_json, ad_copy FROM creative_media WHERE id = $1",
    [vid.id]
  );
  
  const videoAnalysis = mediaRow?.video_analysis;
  const topFixations = videoAnalysis?.top_fixations ?? [];
  const adCopy = mediaRow?.ad_copy ?? null;

  // 4. DeepGaze 매핑 (간소화)
  function parseTime(timeStr) {
    const match = timeStr.match(/(\d+)-?(\d+)?/);
    if (!match) return { start: 0, end: 5 };
    return { start: parseInt(match[1]), end: parseInt(match[2] ?? match[1]) + 1 };
  }

  const sceneContext = sceneSplit.scenes.map(s => {
    const { start, end } = parseTime(s.time);
    const sceneFixations = topFixations.filter(f => f.sec >= start && f.sec < end);
    const avgX = sceneFixations.length > 0 ? sceneFixations.reduce((s, f) => s + (f.x ?? 0), 0) / sceneFixations.length : null;
    const avgY = sceneFixations.length > 0 ? sceneFixations.reduce((s, f) => s + (f.y ?? 0), 0) / sceneFixations.length : null;
    const dgStr = avgX !== null ? `시선위치(${avgX.toFixed(2)}, ${avgY.toFixed(2)})` : "데이터 없음";
    return `씬 [${s.time}] type=${s.type}\n  내용: ${s.desc}\n  DeepGaze: ${dgStr}`;
  }).join("\n\n");

  const analysisPrompt = `이 광고 영상의 씬별 분석을 수행해라.
${adCopy ? `광고 카피: ${adCopy}\n` : ""}
아래는 Gemini 씬 분할 + DeepGaze 시선 데이터다:

${sceneContext}

각 씬에 대해 아래 JSON 배열 형식으로 분석해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지.

{
  "scene_analyses": [
    {
      "time": "씬 시간 (원본 그대로)",
      "hook_strength": 0.0,
      "attention_quality": "high|medium|low",
      "message_clarity": "high|medium|low",
      "viewer_action": "시청자가 이 씬에서 할 행동 예측",
      "improvement": "개선 제안 (선택)"
    }
  ]
}`;

  // 5. Gemini 씬분석
  console.log("  [2/3] Gemini 씬분석 호출...");
  const sceneAnalyses = await callGemini(base64, analysisPrompt, 4096);
  const analyses = sceneAnalyses?.scene_analyses ?? [];
  console.log(`  ✅ 씬분석 완료: ${analyses.length}개 분석`);

  // 6. scene_analysis 스키마 조립
  const analysisMap = new Map();
  for (const sa of analyses) {
    analysisMap.set(sa.time, {
      hook_strength: sa.hook_strength ?? 0.5,
      attention_quality: sa.attention_quality ?? "medium",
      message_clarity: sa.message_clarity ?? "medium",
      viewer_action: sa.viewer_action ?? "",
      improvement: sa.improvement,
    });
  }

  const sceneItems = sceneSplit.scenes.map(scene => {
    const { start, end } = parseTime(scene.time);
    const sceneFixations = topFixations.filter(f => f.sec >= start && f.sec < end);
    const analysis = analysisMap.get(scene.time) ?? {
      hook_strength: 0.5, attention_quality: "medium", message_clarity: "medium", viewer_action: "",
    };
    
    return {
      time: scene.time,
      type: scene.type,
      desc: scene.desc,
      deepgaze: {
        avg_fixation_x: sceneFixations.length > 0 ? sceneFixations.reduce((s, f) => s + (f.x ?? 0), 0) / sceneFixations.length : null,
        avg_fixation_y: sceneFixations.length > 0 ? sceneFixations.reduce((s, f) => s + (f.y ?? 0), 0) / sceneFixations.length : null,
        dominant_region: "unknown",
        cta_visible: false,
        fixation_count: sceneFixations.length,
        avg_intensity: null,
      },
      analysis,
    };
  });

  const firstAnalysis = analysisMap.get(sceneSplit.scenes[0]?.time ?? "");
  const hookEffective = firstAnalysis ? firstAnalysis.hook_strength > 0.6 : false;
  const ctaScene = sceneSplit.scenes.find(s => s.type === "cta");

  const sceneAnalysisOutput = {
    scenes: sceneItems,
    overall: {
      total_scenes: sceneItems.length,
      hook_effective: hookEffective,
      cta_reached: !!ctaScene,
      analyzed_at: new Date().toISOString(),
      model: GEMINI_MODEL,
    },
  };

  // 7. DB 저장
  console.log("  [3/3] DB 저장...");
  const existingAnalysis = mediaRow?.analysis_json ?? {};
  const finalAnalysis = {
    ...existingAnalysis,
    scene_analysis: sceneAnalysisOutput,
  };

  await pool.query(
    "UPDATE creative_media SET analysis_json = $1 WHERE id = $2",
    [JSON.stringify(finalAnalysis), vid.id]
  );
  console.log(`  ✅ 저장 완료: ${sceneItems.length}개 씬, hook=${hookEffective}`);
  return true;
}

// ━━━ 메인 실행 ━━━
async function main() {
  console.log("========================================");
  console.log("엔젤앤비 VIDEO 씬분석 시작");
  console.log("========================================");

  let success = 0;
  for (const vid of VIDEOS) {
    try {
      const ok = await analyzeVideo(vid);
      if (ok) success++;
    } catch (e) {
      console.error(`❌ ${vid.id} 오류:`, e.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`완료: ${success}/${VIDEOS.length}`);
  console.log(`========================================`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
