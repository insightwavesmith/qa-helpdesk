#!/usr/bin/env node
/**
 * 동영상 소재 분석 스크립트 — Gemini 2.0 Pro (Files API)
 *
 * Usage: node scripts/analyze-videos.mjs [--limit N] [--skip-upload]
 *   --limit N       : 최대 N건 처리 (기본: 전체)
 *   --skip-upload   : Gemini Files API 업로드 스킵 (기존 file URI 재사용)
 *
 * 플로우:
 * 1. ad_creative_embeddings에서 media_type=VIDEO AND is_active=true 조회
 * 2. 영상 다운로드 → Gemini Files API 업로드 → ACTIVE 상태 대기
 * 3. Gemini 2.0 Pro generateContent → JSON 파싱
 * 4. ad_creative_embeddings.video_analysis JSONB에 PATCH 저장
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;
const SKIP_UPLOAD = args.includes("--skip-upload");

// ━━━ .env.local 읽기 ━━━
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-pro-exp-02-05";

if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

// ━━━ Supabase REST 헬퍼 ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
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

// ━━━ Gemini 동영상 분석 프롬프트 ━━━
const VIDEO_ANALYSIS_PROMPT = `이 광고 동영상을 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

{
  "duration_sec": 15,
  "scene_count": 3,
  "scenes": [
    { "start_sec": 0, "end_sec": 5, "type": "hook", "description": "..." }
  ],
  "hook_type": "problem|benefit|curiosity|testimonial|visual_impact",
  "hook_duration_sec": 3,
  "tone": "energetic|calm|urgent|emotional|humorous|professional",
  "bgm": { "present": true, "type": "upbeat|emotional|none" },
  "narration": { "present": true, "type": "voiceover|text_overlay|both|none" },
  "cta": { "position": "end|middle|throughout", "type": "button|text|voice|none" },
  "text_overlays": { "count": 5, "languages": ["ko"] },
  "product_shown": true,
  "product_demo": false,
  "faces_shown": true,
  "before_after": false,
  "social_proof_shown": false,
  "urgency_elements": [],
  "color_palette": ["#F75D5D", "#FFFFFF"],
  "aspect_ratio": "9:16"
}

분석 지침:
- hook_type: 첫 3초의 주된 후킹 방식 (문제 제기/혜택 강조/호기심 유발/증언/시각적 임팩트)
- tone: 전반적인 영상 톤앤매너
- scenes: 장면별 시작·끝 시간(초)과 유형 (hook/demo/testimonial/cta/transition)
- urgency_elements: 긴급성 요소 배열 (예: ["한정수량", "오늘만 할인"])
- color_palette: 영상에서 주로 사용된 색상 최대 3개 (hex 코드)
- aspect_ratio: 영상 비율 (9:16/1:1/16:9/4:5)`;

// ━━━ Gemini Files API — 영상 업로드 ━━━
async function uploadVideoToGemini(videoBuffer, adId) {
  console.log(`    파일 업로드 시작 (${Math.round(videoBuffer.length / 1024)}KB)`);

  // 1단계: 업로드 세션 시작
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(videoBuffer.length),
        "X-Goog-Upload-Header-Content-Type": "video/mp4",
      },
      body: JSON.stringify({ file: { display_name: adId } }),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Files API 세션 시작 실패: ${startRes.status} ${errText.slice(0, 200)}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("업로드 URL을 받지 못했습니다");

  // 2단계: 바이트 업로드 + 완료
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(videoBuffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Files API 업로드 실패: ${uploadRes.status} ${errText.slice(0, 200)}`);
  }

  const fileInfo = await uploadRes.json();
  console.log(`    업로드 완료 — file name: ${fileInfo.file?.name}`);
  return fileInfo.file;
}

// ━━━ Gemini Files API — ACTIVE 상태 대기 ━━━
async function waitForFileActive(file) {
  let current = file;
  let attempts = 0;
  const maxAttempts = 20; // 최대 60초 대기

  while (current.state === "PROCESSING") {
    attempts++;
    if (attempts > maxAttempts) {
      throw new Error(`파일 처리 타임아웃 (${maxAttempts * 3}초 초과)`);
    }
    console.log(`    처리 중 대기... (${attempts}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${current.name}?key=${GEMINI_KEY}`
    );
    if (!pollRes.ok) {
      throw new Error(`파일 상태 조회 실패: ${pollRes.status}`);
    }
    current = await pollRes.json();
  }

  if (current.state !== "ACTIVE") {
    throw new Error(`파일 상태 오류: ${current.state}`);
  }

  console.log(`    파일 ACTIVE — uri: ${current.uri}`);
  return current;
}

// ━━━ Gemini 2.0 Pro — 동영상 분석 ━━━
async function analyzeVideoWithGemini(file) {
  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  file_uri: file.uri,
                  mime_type: "video/mp4",
                },
              },
              { text: VIDEO_ANALYSIS_PROMPT },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    }
  );

  if (!genRes.ok) {
    const errText = await genRes.text();
    throw new Error(`Gemini generateContent 실패: ${genRes.status} ${errText.slice(0, 200)}`);
  }

  const genData = await genRes.json();
  const text = genData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // JSON 추출
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`JSON 파싱 실패 — 응답: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

// ━━━ 메인 ━━━
async function main() {
  console.log("동영상 소재 분석 시작 (Gemini 2.0 Pro Files API)");
  console.log(`  limit: ${LIMIT}, skip-upload: ${SKIP_UPLOAD}`);
  console.log(`  모델: ${GEMINI_MODEL}`);

  // 대상 조회: VIDEO이고 활성화된 소재
  const rows = await sbGet(
    `/ad_creative_embeddings?select=ad_id,media_url,ad_copy,account_id,video_analysis&media_type=eq.VIDEO&is_active=eq.true&limit=${LIMIT}`
  );
  console.log(`  대상: ${rows.length}건`);

  let uploadOk = 0;
  let analysisOk = 0;
  let saveOk = 0;
  let errs = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const shortUrl = (row.media_url || "").slice(0, 70);
    console.log(`\n[${i + 1}/${rows.length}] ${row.ad_id} — ${shortUrl}`);

    // 이미 분석된 경우 스킵
    if (row.video_analysis && !SKIP_UPLOAD) {
      console.log(`  기분석 완료, 스킵`);
      analysisOk++;
      saveOk++;
      continue;
    }

    if (!row.media_url) {
      console.log(`  media_url 없음, 스킵`);
      errs++;
      continue;
    }

    try {
      // ── 동영상 다운로드 ──
      console.log(`  동영상 다운로드 중...`);
      const videoRes = await fetch(row.media_url, {
        signal: AbortSignal.timeout(60_000), // 60초 타임아웃
      });
      if (!videoRes.ok) {
        console.log(`  다운로드 실패: ${videoRes.status}`);
        errs++;
        continue;
      }
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      console.log(`  다운로드 완료 (${Math.round(videoBuffer.length / 1024 / 1024 * 10) / 10}MB)`);

      // ── Gemini Files API 업로드 ──
      let activeFile;
      if (SKIP_UPLOAD) {
        // --skip-upload 옵션: video_analysis에 저장된 file_uri 재사용
        const existingUri = row.video_analysis?.file_uri;
        if (!existingUri) {
          console.log(`  --skip-upload 지정했으나 기존 file_uri 없음, 업로드 진행`);
          const uploadedFile = await uploadVideoToGemini(videoBuffer, row.ad_id);
          uploadOk++;
          activeFile = await waitForFileActive(uploadedFile);
        } else {
          console.log(`  기존 file_uri 재사용: ${existingUri}`);
          activeFile = { uri: existingUri, name: existingUri, state: "ACTIVE" };
        }
      } else {
        const uploadedFile = await uploadVideoToGemini(videoBuffer, row.ad_id);
        uploadOk++;
        activeFile = await waitForFileActive(uploadedFile);
      }

      // ── Gemini 2.0 Pro 분석 ──
      console.log(`  Gemini 분석 중...`);
      const analysis = await analyzeVideoWithGemini(activeFile);
      analysisOk++;

      // file_uri도 함께 저장 (--skip-upload 재사용 용도)
      analysis.file_uri = activeFile.uri;
      analysis.analyzed_at = new Date().toISOString();

      console.log(
        `  분석 완료 — hook: ${analysis.hook_type}, tone: ${analysis.tone}, ` +
        `duration: ${analysis.duration_sec}초, 장면: ${analysis.scene_count}개`
      );

      // ── DB 저장 ──
      const result = await sbPatch("ad_creative_embeddings", "ad_id", row.ad_id, {
        video_analysis: analysis,
      });

      if (result.ok) {
        saveOk++;
        console.log(`  DB 저장 완료`);
      } else {
        console.log(`  DB 저장 실패: ${result.status}`);
        errs++;
      }

      // API 요청 간격 (rate limit 대응)
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.log(`  오류: ${e.message}`);
      errs++;
      // 오류가 있어도 다음 건 계속 처리
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n━━━ 결과 요약 ━━━");
  console.log(`전체 대상: ${rows.length}건`);
  console.log(`파일 업로드: ${uploadOk}건`);
  console.log(`분석 성공: ${analysisOk}건`);
  console.log(`DB 저장: ${saveOk}건`);
  console.log(`오류: ${errs}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
