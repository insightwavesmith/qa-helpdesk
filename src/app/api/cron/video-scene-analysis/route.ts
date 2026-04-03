/**
 * GET /api/cron/video-scene-analysis
 * 영상 씬 분할 → DeepGaze 매핑 → Gemini 결합 씬 분석 크론
 *
 * 처리 흐름:
 *   1. creative_media에서 VIDEO + storage_url(.mp4) + scene_analysis 미완료 조회
 *   2. 각 영상에 대해 Gemini로 씬 분할 (방법 A: 1초 단위 기술 → 씬 분할)
 *   3. video_analysis.top_fixations에서 씬별 시간대 DeepGaze 데이터 매핑
 *   4. 씬별 Gemini 결합 분석 (hook/attention/message 평가)
 *   5. 결과를 analysis_json.scene_analysis에 저장
 *
 * 주의: 파이프라인 마지막 단계 → triggerNext() 없음
 *       영상 분석 비용 높음 → 순차 처리 + 배치 30
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { triggerNext } from "@/lib/pipeline-chain";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 배치 크기 (영상 분석은 API 비용 높음)
const BATCH_LIMIT = 30;

// ━━━ 타입 정의 ━━━
interface VideoMediaRow {
  id: string;
  creative_id: string;
  media_type: string | null;
  storage_url: string | null;
  video_analysis: Record<string, unknown> | null;
  analysis_json: Record<string, unknown> | null;
  ad_copy: string | null;
  creatives: {
    ad_id: string;
    account_id: string;
  } | null;
}

interface ElementInfo {
  type: string; // "인물" | "텍스트" | "제품" | "CTA" | "배경"
  region: string; // 9분할: top_left, top_center, ... bottom_right
  area_pct: number;
}

interface PerSecond {
  sec: number;
  content: string;
  elements?: ElementInfo[];
}

interface SceneSplit {
  time: string; // e.g. "0-3초"
  type: "hook" | "demo" | "result" | "cta" | "brand";
  desc: string;
  content_details?: string;
}

interface SceneSplitResult {
  per_second: PerSecond[];
  scenes: SceneSplit[];
}

interface TopFixation {
  sec: number;
  x: number;
  y: number;
  intensity: number;
}

interface SceneDeepGaze {
  avg_fixation_x: number | null;
  avg_fixation_y: number | null;
  dominant_region: string;
  cta_visible: boolean;
  fixation_count: number;
  avg_intensity: number | null;
}

interface SceneAnalysisResult {
  hook_strength: number;
  attention_quality: "high" | "medium" | "low";
  message_clarity: "high" | "medium" | "low";
  viewer_action: string;
  improvement?: string;
}

interface ElementAttention {
  type: string;
  attention_pct: number;
}

interface SceneItem {
  time: string;
  type: string;
  desc: string;
  deepgaze: SceneDeepGaze;
  analysis: SceneAnalysisResult;
  element_attention?: ElementAttention[];
}

interface SceneAnalysisOutput {
  scenes: SceneItem[];
  overall: {
    total_scenes: number;
    hook_effective: boolean;
    cta_reached: boolean;
    analyzed_at: string;
    model: string;
  };
}

// ━━━ 인증 확인 ━━━
function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // 개발환경 — 시크릿 없으면 허용
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// ━━━ 씬 시간 파싱 (e.g. "0-3초" → { start: 0, end: 3 }) ━━━
function parseSceneTime(time: string): { start: number; end: number } {
  // "0-3초", "0-2.3초", "3-7초" 등 파싱
  const match = time.match(/([\d.]+)[^\d]*([\d.]+)/);
  if (!match) return { start: 0, end: 0 };
  return { start: parseFloat(match[1]), end: parseFloat(match[2]) };
}

// ━━━ 씬별 DeepGaze top_fixations 매핑 ━━━
function mapDeepGazeToScene(
  topFixations: TopFixation[],
  sceneStart: number,
  sceneEnd: number,
  ctaAttentionScore?: number,
): SceneDeepGaze {
  // 씬 시간 범위 내 fixations 필터
  const sceneFix = topFixations.filter(
    (f) => f.sec >= sceneStart && f.sec < sceneEnd,
  );

  if (sceneFix.length === 0) {
    return {
      avg_fixation_x: null,
      avg_fixation_y: null,
      dominant_region: "unknown",
      cta_visible: false,
      fixation_count: 0,
      avg_intensity: null,
    };
  }

  const avgX = sceneFix.reduce((s, f) => s + f.x, 0) / sceneFix.length;
  const avgY = sceneFix.reduce((s, f) => s + f.y, 0) / sceneFix.length;
  const avgIntensity =
    sceneFix.reduce((s, f) => s + f.intensity, 0) / sceneFix.length;

  // 지배 영역 판단 (9분할: top/center/bottom × left/center/right)
  const regionY = avgY < 0.33 ? "top" : avgY < 0.66 ? "center" : "bottom";
  const regionX = avgX < 0.33 ? "left" : avgX < 0.66 ? "center" : "right";
  const dominantRegion = `${regionY}_${regionX}`;

  // CTA 가시성: CTA attention score > 0.3 이거나 하단 중앙/우측 영역 시선
  const ctaVisible =
    (ctaAttentionScore !== undefined && ctaAttentionScore > 0.3) ||
    (regionY === "bottom" && (regionX === "center" || regionX === "right"));

  return {
    avg_fixation_x: Math.round(avgX * 1000) / 1000,
    avg_fixation_y: Math.round(avgY * 1000) / 1000,
    dominant_region: dominantRegion,
    cta_visible: ctaVisible,
    fixation_count: sceneFix.length,
    avg_intensity: Math.round(avgIntensity * 1000) / 1000,
  };
}

// ━━━ 요소별 주목도 매핑 (DeepGaze fixations → element attention) ━━━
function fixationToRegion(x: number, y: number): string {
  const regionY = y < 0.33 ? "top" : y < 0.66 ? "center" : "bottom";
  const regionX = x < 0.33 ? "left" : x < 0.66 ? "center" : "right";
  return `${regionY}_${regionX}`;
}

function computeElementAttention(
  elements: ElementInfo[],
  fixations: TopFixation[],
  sceneStart: number,
  sceneEnd: number,
): ElementAttention[] {
  if (!elements || elements.length === 0) return [];

  // 해당 씬 시간 범위의 fixation 필터링
  const sceneFix = fixations.filter(
    (f) => f.sec >= sceneStart && f.sec < sceneEnd,
  );

  // region → element(s) 매핑 테이블
  const regionToElements = new Map<string, ElementInfo[]>();
  for (const el of elements) {
    const existing = regionToElements.get(el.region) ?? [];
    existing.push(el);
    regionToElements.set(el.region, existing);
  }

  // element type별 intensity 누적
  const typeIntensity = new Map<string, number>();
  for (const el of elements) {
    if (!typeIntensity.has(el.type)) {
      typeIntensity.set(el.type, 0);
    }
  }

  if (sceneFix.length === 0) {
    // fixation 없으면 area_pct 기반 fallback
    const totalArea = elements.reduce((s, e) => s + e.area_pct, 0) || 100;
    return elements.map((el) => ({
      type: el.type,
      attention_pct: Math.round((el.area_pct / totalArea) * 100),
    }));
  }

  let totalIntensity = 0;
  for (const fix of sceneFix) {
    const region = fixationToRegion(fix.x, fix.y);
    const regionEls = regionToElements.get(region);

    if (regionEls && regionEls.length > 0) {
      // region 내 복수 요소 → area_pct 비율로 intensity 배분
      const regionArea = regionEls.reduce((s, e) => s + e.area_pct, 0) || 1;
      for (const el of regionEls) {
        const share = (el.area_pct / regionArea) * fix.intensity;
        typeIntensity.set(el.type, (typeIntensity.get(el.type) ?? 0) + share);
        totalIntensity += share;
      }
    } else {
      // fixation이 어떤 요소 region에도 안 걸리면 배경에 배분
      const bgEl = elements.find((e) => e.type === "배경") ?? elements[0];
      typeIntensity.set(bgEl.type, (typeIntensity.get(bgEl.type) ?? 0) + fix.intensity);
      totalIntensity += fix.intensity;
    }
  }

  if (totalIntensity === 0) totalIntensity = 1;

  return Array.from(typeIntensity.entries()).map(([type, intensity]) => ({
    type,
    attention_pct: Math.round((intensity / totalIntensity) * 100),
  }));
}

// ━━━ 씬 분할 프롬프트 (방법 A: 1초 단위 기술 → 씬 분할) ━━━
const SCENE_SPLIT_PROMPT = `이 광고 영상을 분석한다.

Step 1: 1초 단위로 화면에 보이는 것을 간단히 기술해라. (0초, 1초, 2초, 3초... 마지막 초까지)
각 초마다 화면에 보이는 주요 요소(elements)를 식별하고, 각 요소의 위치와 면적 비율을 추정해라.

요소 type: "인물", "텍스트", "제품", "CTA", "배경" 5가지 중 선택.
요소 region (9분할): top_left, top_center, top_right, center_left, center_center, center_right, bottom_left, bottom_center, bottom_right
요소 area_pct: 해당 요소가 화면에서 차지하는 대략적 면적 비율 (%). 모든 요소의 합계가 약 100%.

Step 2: Step 1 결과를 보고, 화면 내용이 실제로 바뀌는 지점에서 씬을 분할해라.

규칙:
- 같은 화면 구성이 유지되면 하나의 씬
- 화면 구성이 바뀌면 (인물→제품, 실내→실외, 클로즈업→와이드 등) 새 씬
- 씬 1개는 최대 5초
- 각 씬에 type(hook/demo/result/cta/brand) 부여

출력 형식 (JSON):
{
  "per_second": [
    {"sec": 0, "content": "화면에 보이는 것", "elements": [
      {"type": "인물", "region": "center_center", "area_pct": 60},
      {"type": "텍스트", "region": "bottom_center", "area_pct": 15},
      {"type": "배경", "region": "top_center", "area_pct": 25}
    ]},
    {"sec": 1, "content": "..."}
  ],
  "scenes": [
    {"time": "0-2초", "type": "hook", "desc": "씬 설명", "content_details": "구체적으로 뭐가 보이는지"}
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;

// ━━━ 씬 결합 분석 프롬프트 빌드 ━━━
function buildSceneAnalysisPrompt(
  scenes: SceneSplit[],
  deepGazeMap: Map<string, SceneDeepGaze>,
  adCopy: string | null,
): string {
  const sceneContext = scenes
    .map((s) => {
      const dg = deepGazeMap.get(s.time);
      const dgStr = dg
        ? `  DeepGaze: 시선위치(${dg.avg_fixation_x?.toFixed(2) ?? "N/A"}, ${dg.avg_fixation_y?.toFixed(2) ?? "N/A"}), 영역=${dg.dominant_region}, CTA가시=${dg.cta_visible}, 강도=${dg.avg_intensity?.toFixed(2) ?? "N/A"}`
        : "  DeepGaze: 데이터 없음";
      return `씬 [${s.time}] type=${s.type}\n  내용: ${s.desc}\n${dgStr}`;
    })
    .join("\n\n");

  return `이 광고 영상의 씬별 분석을 수행해라.
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
}

// ━━━ Gemini 씬 분할 호출 ━━━
async function callGeminiSceneSplit(
  videoBase64: string,
): Promise<SceneSplitResult | null> {
  if (!GEMINI_API_KEY) {
    console.warn("[video-scene-analysis] GEMINI_API_KEY 미설정");
    return null;
  }

  let genRes: Response;
  try {
    genRes = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "video/mp4", data: videoBase64 } },
                { text: SCENE_SPLIT_PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    console.warn("[video-scene-analysis] Gemini 씬분할 타임아웃");
    return null;
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    console.warn(
      `[video-scene-analysis] Gemini 씬분할 실패: ${genRes.status} ${errText.slice(0, 200)}`,
    );
    return null;
  }

  const data = await genRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.warn("[video-scene-analysis] 씬분할 응답 없음");
    return null;
  }

  return parseJsonSafe<SceneSplitResult>(rawText);
}

// ━━━ Gemini 씬 결합 분석 호출 ━━━
async function callGeminiSceneAnalysis(
  videoBase64: string,
  prompt: string,
): Promise<Array<SceneAnalysisResult & { time: string }> | null> {
  if (!GEMINI_API_KEY) return null;

  let genRes: Response;
  try {
    genRes = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "video/mp4", data: videoBase64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    console.warn("[video-scene-analysis] Gemini 씬분석 타임아웃");
    return null;
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    console.warn(
      `[video-scene-analysis] Gemini 씬분석 실패: ${genRes.status} ${errText.slice(0, 200)}`,
    );
    return null;
  }

  const data = await genRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  const parsed = parseJsonSafe<{ scene_analyses: Array<SceneAnalysisResult & { time: string }> }>(rawText);
  return parsed?.scene_analyses ?? null;
}

// ━━━ JSON 파싱 헬퍼 ━━━
function parseJsonSafe<T>(rawText: string): T | null {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    // 마크다운 코드블록 제거 후 재시도
    const cleaned = rawText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      console.warn("[video-scene-analysis] JSON 파싱 실패");
      return null;
    }
  }
}

// ━━━ 메인 핸들러 ━━━
export async function GET(req: NextRequest) {
  const start = Date.now();

  // 인증 확인
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("video-scene-analysis");

  if (!GEMINI_API_KEY) {
    await completeCronRun(runId, "error", 0, "GEMINI_API_KEY 미설정");
    return NextResponse.json(
      { error: "GEMINI_API_KEY 미설정" },
      { status: 500 },
    );
  }

  // account_id 필터 (특정 계정만 처리)
  const { searchParams } = new URL(req.url);
  const accountFilter = searchParams.get("account_id");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    // ━━━ 1. 미분석 VIDEO 조회 ━━━
    // analysis_json에 scene_analysis 키 없는 것 조회
    // → JS에서 필터링 (JSONB 조건은 서버사이드 적용 어려움)
    // 전체 조회 후 JS 필터 — VIDEO mp4 300건 수준이라 부담 없음
    const { data: rawMedia, error: queryErr } = await svc
      .from("creative_media")
      .select(
        "id, creative_id, media_type, storage_url, video_analysis, analysis_json, ad_copy",
      )
      .eq("media_type", "VIDEO")
      .not("storage_url", "is", null)
      .like("storage_url", "%.mp4")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (queryErr) {
      console.error(
        "[video-scene-analysis] creative_media 조회 실패:",
        queryErr.message,
      );
      return NextResponse.json(
        { error: `DB 조회 실패: ${queryErr.message}` },
        { status: 500 },
      );
    }

    if (!rawMedia || rawMedia.length === 0) {
      return NextResponse.json({
        message: "video-scene-analysis 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        total: 0,
        analyzed: 0,
        skipped: 0,
        errors: 0,
      });
    }

    // JS 필터: analysis_json에 scene_analysis 없는 것만 (BATCH_LIMIT개)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingRaw = (rawMedia as any[])
      .filter((r) => {
        const aj = r.analysis_json as Record<string, unknown> | null;
        return !aj?.scene_analysis;
      })
      .slice(0, BATCH_LIMIT);

    if (pendingRaw.length === 0) {
      return NextResponse.json({
        message: "video-scene-analysis 완료 — 모두 분석됨",
        elapsed: "0.0s",
        total: rawMedia.length,
        analyzed: 0,
        skipped: rawMedia.length,
        errors: 0,
      });
    }

    // ━━━ 2. creative_id → creatives 2단계 쿼리 ━━━
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creativeIds = [...new Set(pendingRaw.map((r: any) => r.creative_id as string))];
    const { data: creativesData } = await svc
      .from("creatives")
      .select("id, ad_id, account_id")
      .in("id", creativeIds);

    const creativeMap = new Map<string, { ad_id: string; account_id: string }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (creativesData ?? []).map((c: any) => [
        c.id,
        { ad_id: c.ad_id, account_id: c.account_id },
      ]),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: VideoMediaRow[] = pendingRaw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const creative = creativeMap.get(r.creative_id);
        if (!creative) return null;
        return { ...r, creatives: creative } as VideoMediaRow;
      })
      .filter(Boolean) as VideoMediaRow[];

    // account_id 필터 적용
    if (accountFilter) {
      rows = rows.filter((r) => r.creatives?.account_id === accountFilter);
      console.log(`[video-scene-analysis] account_id=${accountFilter} 필터 적용: ${rows.length}건`);
    }

    console.log(
      `[video-scene-analysis] 씬 분석 대상: ${rows.length}건`,
    );

    // ━━━ 3. 영상별 순차 처리 (Gemini rate limit) ━━━
    let analyzed = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        if (!row.storage_url) {
          console.log(
            `[video-scene-analysis] storage_url 없음 스킵: id=${row.id}`,
          );
          skipped++;
          continue;
        }

        console.log(
          `[video-scene-analysis] 처리 시작: id=${row.id} ad_id=${row.creatives?.ad_id ?? "unknown"}`,
        );

        // ━━━ 3-1. 영상 다운로드 ━━━
        // gs:// → HTTPS 변환 (GCS public URL)
        let videoUrl = row.storage_url;
        if (videoUrl.startsWith("gs://")) {
          videoUrl = videoUrl.replace("gs://", "https://storage.googleapis.com/");
        }

        let videoBuf: ArrayBuffer;
        try {
          const vidRes = await fetch(videoUrl, {
            signal: AbortSignal.timeout(60_000),
          });
          if (!vidRes.ok) {
            console.warn(
              `[video-scene-analysis] 영상 다운로드 실패: ${vidRes.status} ${row.storage_url}`,
            );
            skipped++;
            continue;
          }
          videoBuf = await vidRes.arrayBuffer();
          console.log(
            `[video-scene-analysis] 영상 다운로드 완료: ${(videoBuf.byteLength / 1024 / 1024).toFixed(1)}MB`,
          );
        } catch {
          console.warn(
            `[video-scene-analysis] 영상 다운로드 타임아웃: ${row.storage_url}`,
          );
          skipped++;
          continue;
        }

        const videoBase64 = Buffer.from(videoBuf).toString("base64");

        // ━━━ 3-2. Gemini 씬 분할 (방법 A) ━━━
        const sceneSplit = await callGeminiSceneSplit(videoBase64);
        if (!sceneSplit || !sceneSplit.scenes || sceneSplit.scenes.length === 0) {
          console.warn(
            `[video-scene-analysis] 씬 분할 실패 id=${row.id}`,
          );
          errors++;
          continue;
        }

        console.log(
          `[video-scene-analysis] 씬 분할 완료: ${sceneSplit.scenes.length}개 씬`,
        );

        // ━━━ 3-3. video_analysis에서 top_fixations 추출 ━━━
        const videoAnalysis = row.video_analysis as {
          top_fixations?: TopFixation[];
          cta_attention_score?: number;
        } | null;
        const topFixations: TopFixation[] = videoAnalysis?.top_fixations ?? [];
        const ctaScore = videoAnalysis?.cta_attention_score;

        // 씬별 DeepGaze 매핑
        const deepGazeMap = new Map<string, SceneDeepGaze>();
        for (const scene of sceneSplit.scenes) {
          const { start, end } = parseSceneTime(scene.time);
          const dg = mapDeepGazeToScene(topFixations, start, end, ctaScore);
          deepGazeMap.set(scene.time, dg);
        }

        // ━━━ 3-4. 씬 결합 분석 ━━━
        const analysisPrompt = buildSceneAnalysisPrompt(
          sceneSplit.scenes,
          deepGazeMap,
          row.ad_copy,
        );
        const sceneAnalyses = await callGeminiSceneAnalysis(
          videoBase64,
          analysisPrompt,
        );

        // 분석 결과를 씬에 병합
        const analysisMap = new Map<string, SceneAnalysisResult>();
        if (sceneAnalyses) {
          for (const sa of sceneAnalyses) {
            analysisMap.set(sa.time, {
              hook_strength: sa.hook_strength ?? 0.5,
              attention_quality: sa.attention_quality ?? "medium",
              message_clarity: sa.message_clarity ?? "medium",
              viewer_action: sa.viewer_action ?? "",
              improvement: sa.improvement,
            });
          }
        }

        // ━━━ 3-5. scene_analysis 스키마 조립 ━━━
        // per_second에서 씬 시간 범위별 elements 수집
        const perSecondData = sceneSplit.per_second ?? [];

        const sceneItems: SceneItem[] = sceneSplit.scenes.map((scene) => {
          const dg = deepGazeMap.get(scene.time) ?? {
            avg_fixation_x: null,
            avg_fixation_y: null,
            dominant_region: "unknown",
            cta_visible: false,
            fixation_count: 0,
            avg_intensity: null,
          };
          const analysis = analysisMap.get(scene.time) ?? {
            hook_strength: 0.5,
            attention_quality: "medium" as const,
            message_clarity: "medium" as const,
            viewer_action: "",
          };

          // 씬 시간 범위 내 per_second elements 병합 (대표 요소 추출)
          const { start, end } = parseSceneTime(scene.time);
          const scenePerSec = perSecondData.filter(
            (ps) => ps.sec >= start && ps.sec < end && ps.elements && ps.elements.length > 0,
          );

          let elementAttention: ElementAttention[] | undefined;
          if (scenePerSec.length > 0) {
            // 씬 내 첫 번째 유효 per_second의 elements를 대표로 사용
            const representativeElements = scenePerSec[0].elements!;
            elementAttention = computeElementAttention(
              representativeElements,
              topFixations,
              start,
              end,
            );
          }

          return {
            time: scene.time,
            type: scene.type,
            desc: scene.desc,
            deepgaze: dg,
            analysis,
            ...(elementAttention && elementAttention.length > 0 ? { element_attention: elementAttention } : {}),
          };
        });

        // CTA 도달 여부 (마지막 씬 또는 cta 타입 씬)
        const ctaScene = sceneSplit.scenes.find((s) => s.type === "cta");
        const ctaReached = ctaScene
          ? (deepGazeMap.get(ctaScene.time)?.cta_visible ?? false)
          : false;

        // 훅 효과성 (첫 씬 hook_strength > 0.6)
        const firstSceneAnalysis = analysisMap.get(sceneSplit.scenes[0]?.time ?? "");
        const hookEffective = firstSceneAnalysis
          ? firstSceneAnalysis.hook_strength > 0.6
          : false;

        const sceneAnalysisOutput: SceneAnalysisOutput = {
          scenes: sceneItems,
          overall: {
            total_scenes: sceneItems.length,
            hook_effective: hookEffective,
            cta_reached: ctaReached,
            analyzed_at: new Date().toISOString(),
            model: GEMINI_MODEL,
          },
        };

        // ━━━ 3-6. analysis_json 업데이트 (scene_analysis 키 추가) ━━━
        const existingAnalysis = row.analysis_json ?? {};
        const finalAnalysis: Record<string, unknown> = {
          ...existingAnalysis,
          scene_analysis: sceneAnalysisOutput,
        };

        const { error: updateErr } = await svc
          .from("creative_media")
          .update({ analysis_json: finalAnalysis })
          .eq("id", row.id);

        if (updateErr) {
          console.error(
            `[video-scene-analysis] 업데이트 실패 id=${row.id}: ${updateErr.message}`,
          );
          errors++;
        } else {
          console.log(
            `[video-scene-analysis] 완료 id=${row.id} ad_id=${row.creatives?.ad_id ?? "unknown"} ` +
            `scenes=${sceneItems.length} hook=${hookEffective} cta=${ctaReached}`,
          );
          analyzed++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[video-scene-analysis] 개별 소재 실패 id=${row.id}: ${msg}`,
        );
        errors++;
        // 개별 실패 → 다음 건 계속 진행
      }

      // Gemini rate limit 대비 딜레이 (영상 분석은 2초)
      await new Promise((r) => setTimeout(r, 2000));
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[video-scene-analysis] 완료: total=${rows.length} analyzed=${analyzed} skipped=${skipped} errors=${errors} ${elapsed}s`,
    );

    // triggerNext 체인 — run-prescription (배치 모드)
    const isChain = searchParams.get("chain") === "true";
    let chainTriggered = false;
    if (isChain && analyzed > 0) {
      await triggerNext("run-prescription", { batch: "true" });
      console.log("[video-scene-analysis] chain → run-prescription triggered");
      chainTriggered = true;
    }

    await completeCronRun(runId, errors > 0 ? "partial" : "success", analyzed);

    return NextResponse.json({
      message: "video-scene-analysis 완료",
      elapsed: `${elapsed}s`,
      total: rows.length,
      analyzed,
      skipped,
      errors,
      chainTriggered,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[video-scene-analysis] 치명적 에러 (${elapsed}s):`, e);
    await completeCronRun(runId, "error", 0, e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
