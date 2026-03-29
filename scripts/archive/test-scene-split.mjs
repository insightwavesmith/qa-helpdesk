#!/usr/bin/env node
import { readFileSync } from "fs";
import { getSupabaseConfig } from "./lib/env.mjs";
const { env } = getSupabaseConfig();
const GEMINI_KEY = env.GEMINI_API_KEY;

// 영상 다운로드
const videoUrl = "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/creatives/1440411543944393/video/120241760856630479.mp4";
console.log("영상 다운로드...");
const vidRes = await fetch(videoUrl, {signal: AbortSignal.timeout(30000)});
const vidBuf = await vidRes.arrayBuffer();
const vidBase64 = Buffer.from(vidBuf).toString("base64");
console.log(`영상: ${(vidBuf.byteLength/1024/1024).toFixed(1)}MB`);

// 방법 A: 1+2 조합 (1초 단위 기술 → 씬 분할)
const promptA = `이 광고 영상을 분석한다.

Step 1: 1초 단위로 화면에 보이는 것을 간단히 기술해라. (0초, 1초, 2초, 3초... 마지막 초까지)
Step 2: Step 1 결과를 보고, 화면 내용이 실제로 바뀌는 지점에서 씬을 분할해라.

규칙:
- 같은 화면 구성이 유지되면 하나의 씬
- 화면 구성이 바뀌면 (인물→제품, 실내→실외, 클로즈업→와이드 등) 새 씬
- 씬 1개는 최대 5초
- 각 씬에 type(hook/demo/result/cta/brand) 부여

출력 형식 (JSON):
{
  "per_second": [
    {"sec": 0, "content": "화면에 보이는 것"},
    {"sec": 1, "content": "..."}
  ],
  "scenes": [
    {"time": "0-2초", "type": "hook", "desc": "씬 설명", "content_details": "구체적으로 뭐가 보이는지"}
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;

// 방법 B: ffmpeg 경계 기반
const ffmpegBoundaries = [0, 2.3, 4.2, 7.0, 10.4, 13.0, 19.4, 20.8, 23.4, 27.7, 29.5, 30.3];
const promptB = `이 광고 영상을 분석한다.

이 영상의 화면 전환 지점이 아래와 같이 감지되었다:
${ffmpegBoundaries.map(t => t + "초").join(", ")}

이 전환 지점을 기준으로 씬을 분할하되, 너무 짧은 구간(1초 미만)은 인접 씬과 합쳐라.
각 씬에 대해:
1. type(hook/demo/result/cta/brand) 부여
2. 해당 구간에서 **실제로 화면에 보이는 것**만 기술 (다른 구간 내용 절대 포함 금지)
3. 해당 구간에서 들리는 나레이션/BGM 기술

출력 형식 (JSON):
{
  "scenes": [
    {"time": "0-2.3초", "type": "hook", "desc": "씬 설명", "saw": "화면에 보이는 것", "heard": "들리는 것"}
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;

// 방법 A 호출
console.log("\n=== 방법 A: 1초 단위 기술 → 씬 분할 ===");
const resA = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_KEY}`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    contents: [{parts: [{inline_data: {mime_type: "video/mp4", data: vidBase64}}, {text: promptA}]}],
    generationConfig: {temperature: 0.2, maxOutputTokens: 8192}
  })
});
const resultA = await resA.json();
console.log(resultA.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(resultA).substring(0,300));

// 방법 B 호출
console.log("\n=== 방법 B: ffmpeg 경계 기반 ===");
const resB = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_KEY}`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    contents: [{parts: [{inline_data: {mime_type: "video/mp4", data: vidBase64}}, {text: promptB}]}],
    generationConfig: {temperature: 0.2, maxOutputTokens: 4096}
  })
});
const resultB = await resB.json();
console.log(resultB.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(resultB).substring(0,300));
