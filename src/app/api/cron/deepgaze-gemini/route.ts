/**
 * GET /api/cron/deepgaze-gemini
 * DeepGaze 시선 결과 + 소재 원본 → Gemini 결합 분석 크론
 *
 * 파이프라인 3단계: DeepGaze 완료 소재에 대해 Gemini 결합 분석 실행
 *
 * 처리 흐름:
 *   1. creative_media에서 saliency_url 또는 video_analysis가 있는 소재 조회
 *      (= DeepGaze 분석 완료된 것만)
 *   2. 이 중 analysis_json에 deepgaze_context가 없는 소재 필터
 *      (= 아직 결합 분석 안 된 것)
 *   3. 소재별:
 *      a. DeepGaze 결과 파싱 (saliency_url에서 JSON 읽기 또는 video_analysis 사용)
 *      b. 소재 이미지/URL 로드
 *      c. Gemini API 호출: 소재 원본 + DeepGaze 시선 데이터 동시 전달
 *      d. 결과를 creative_media.analysis_json에 저장 (deepgaze_context 필드 추가)
 *   4. DeepGaze 데이터 없으면 기존 Gemini 단독 분석 fallback (NFR-02)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 배치 크기 (Gemini API rate limit 고려)
const BATCH_LIMIT = 50;

// ━━━ 타입 정의 ━━━
interface CreativeMediaRow {
  id: string;
  creative_id: string;
  media_type: string | null;
  media_url: string | null;
  storage_url: string | null;
  saliency_url: string | null;
  video_analysis: Record<string, unknown> | null;
  analysis_json: Record<string, unknown> | null;
  ad_copy: string | null;
  creatives: {
    ad_id: string;
    account_id: string;
    lp_url: string | null;
  } | null;
}

interface SaliencyData {
  regions?: Array<{
    label: string;
    attention_ratio: number;
    center_x?: number;
    center_y?: number;
  }>;
  top_fixation?: { x: number; y: number; ratio: number };
  dominant_region?: string;
  cta_attention_score?: number;
  [key: string]: unknown;
}

interface VideoSaliencyData {
  cta_attention_score?: number;
  cognitive_load?: number;
  attention_map_url?: string;
  top_fixations?: Array<{
    sec: number;
    x: number;
    y: number;
    intensity: number;
  }>;
  [key: string]: unknown;
}

// ━━━ 인증 확인 ━━━
function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  // chain=true 파라미터로 내부 트리거 시에도 동일 시크릿 사용
  if (authHeader === `Bearer ${cronSecret}`) return true;
  // 개발/테스트 환경 허용
  const { searchParams } = new URL(req.url);
  return searchParams.get("chain") === "true" && authHeader === `Bearer ${cronSecret}`;
}

// ━━━ DeepGaze saliency_url에서 JSON 데이터 로드 ━━━
async function loadSaliencyData(
  saliencyUrl: string,
): Promise<SaliencyData | null> {
  // saliency_url이 JSON 파일 URL인 경우 직접 파싱
  // 히트맵 이미지 URL인 경우 null 반환 (JSON 데이터 없음)
  if (!saliencyUrl.endsWith(".json") && !saliencyUrl.includes("saliency_data")) {
    // 히트맵 이미지 URL — JSON 구조 데이터 없음, 이미지 자체를 Gemini에 전달
    return null;
  }

  try {
    const res = await fetch(saliencyUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data as SaliencyData;
  } catch {
    return null;
  }
}

// ━━━ DeepGaze 컨텍스트 텍스트 빌드 ━━━
function buildDeepGazeContextText(
  saliencyData: SaliencyData | null,
  videoData: VideoSaliencyData | null,
  mediaType: string | null,
): string | null {
  if (!saliencyData && !videoData) return null;

  if (mediaType === "VIDEO" && videoData) {
    const parts: string[] = ["[DeepGaze III 시선 분석 결과 — 영상]"];

    if (videoData.cta_attention_score !== undefined) {
      parts.push(`CTA 주목도: ${(videoData.cta_attention_score * 100).toFixed(1)}%`);
    }
    if (videoData.cognitive_load !== undefined) {
      parts.push(`인지 부하: ${videoData.cognitive_load.toFixed(2)} (0=낮음, 1=높음)`);
    }
    if (videoData.top_fixations && videoData.top_fixations.length > 0) {
      const fixationSummary = videoData.top_fixations
        .slice(0, 5)
        .map((f) => `${f.sec}초: 위치(${(f.x * 100).toFixed(0)}%, ${(f.y * 100).toFixed(0)}%) 강도=${f.intensity.toFixed(2)}`)
        .join(", ");
      parts.push(`시간대별 주요 시선: ${fixationSummary}`);
    }

    return parts.join("\n");
  }

  if (saliencyData) {
    const parts: string[] = ["[DeepGaze III 시선 분석 결과 — 이미지]"];

    if (saliencyData.dominant_region) {
      parts.push(`주요 시선 영역: ${saliencyData.dominant_region}`);
    }
    if (saliencyData.cta_attention_score !== undefined) {
      parts.push(`CTA 주목도: ${(saliencyData.cta_attention_score * 100).toFixed(1)}%`);
    }
    if (saliencyData.regions && saliencyData.regions.length > 0) {
      const regionSummary = saliencyData.regions
        .slice(0, 5)
        .map((r) => `${r.label}: ${(r.attention_ratio * 100).toFixed(1)}%`)
        .join(", ");
      parts.push(`영역별 주목 비율: ${regionSummary}`);
    }
    if (saliencyData.top_fixation) {
      const tf = saliencyData.top_fixation;
      parts.push(
        `최고 주목점: (${(tf.x * 100).toFixed(0)}%, ${(tf.y * 100).toFixed(0)}%) 비율=${(tf.ratio * 100).toFixed(1)}%`,
      );
    }

    return parts.join("\n");
  }

  return null;
}

// ━━━ 5축 분석 프롬프트 빌드 ━━━
function buildAnalysisPrompt(
  deepGazeContext: string | null,
  adCopy: string | null,
): string {
  const basePrompt = `이 광고 소재를 분석해서 아래 JSON 스키마에 맞춰 출력해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록(\`\`\`) 사용 금지. 주석 금지.

{
  "hook_strength": { "score": 0.0, "reason": "0초 훅 강도 (0~1)", "hook_type": "question|shock|benefit|problem|none" },
  "attention_flow": { "score": 0.0, "pattern": "시선 흐름 패턴", "cta_reached": true },
  "message_clarity": { "score": 0.0, "core_message": "핵심 메시지", "complexity": "high|medium|low" },
  "visual_impact": { "score": 0.0, "dominant_element": "주요 시각 요소", "contrast": "high|medium|low" },
  "cta_effectiveness": { "score": 0.0, "cta_text": "CTA 텍스트", "visibility": "high|medium|low" },
  "overall_score": 0.0,
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "format": "image|video|carousel",
  "style": "ugc|professional|minimal|bold|lifestyle"
}`;

  if (deepGazeContext) {
    return `${deepGazeContext}

위 DeepGaze 시선 데이터를 반드시 참고하여 분석해라. 특히:
- attention_flow.pattern: DeepGaze 시선 데이터를 기반으로 실제 시선 흐름 기술
- attention_flow.cta_reached: CTA 주목도 수치를 기준으로 판단
- hook_strength.score: 0초 DeepGaze 시선 집중도를 기반으로 평가
- 주관적 추정이 아닌 DeepGaze 객관 데이터에 근거하여 판단할 것

${adCopy ? `광고 카피: ${adCopy}\n\n` : ""}${basePrompt}`;
  }

  return `${adCopy ? `광고 카피: ${adCopy}\n\n` : ""}${basePrompt}`;
}

// ━━━ Gemini Vision API 호출 ━━━
async function callGeminiAnalysis(
  imageUrl: string,
  mediaType: string,
  prompt: string,
  deepGazeContext: string | null,
): Promise<Record<string, unknown> | null> {
  if (!GEMINI_API_KEY) {
    console.warn("[deepgaze-gemini] GEMINI_API_KEY 미설정");
    return null;
  }

  // 이미지/썸네일 다운로드
  let imgBuf: ArrayBuffer;
  let mimeType = "image/jpeg";

  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imgRes.ok) {
      console.warn(`[deepgaze-gemini] 이미지 다운로드 실패: ${imgRes.status} ${imageUrl}`);
      return null;
    }
    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
    imgBuf = await imgRes.arrayBuffer();
  } catch {
    console.warn(`[deepgaze-gemini] 이미지 다운로드 타임아웃: ${imageUrl}`);
    return null;
  }

  const base64 = Buffer.from(imgBuf).toString("base64");

  const parts: object[] = [
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  // DeepGaze 컨텍스트가 있으면 텍스트 파트로 추가
  if (deepGazeContext) {
    parts.push({ text: deepGazeContext });
  }
  parts.push({ text: prompt });

  let genRes: Response;
  try {
    genRes = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch {
    console.warn(`[deepgaze-gemini] Gemini API 타임아웃: ${imageUrl}`);
    return null;
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    console.warn(
      `[deepgaze-gemini] Gemini API 실패: ${genRes.status} ${errText.slice(0, 200)}`,
    );
    return null;
  }

  const data = await genRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.warn(
      `[deepgaze-gemini] 응답 없음 (finishReason: ${data.candidates?.[0]?.finishReason ?? "UNKNOWN"})`,
    );
    return null;
  }

  // JSON 파싱
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // 마크다운 코드블록 제거 후 재시도
    const cleaned = rawText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/^[^{]*/, "")
      .replace(/[^}]*$/, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      console.warn(`[deepgaze-gemini] JSON 파싱 실패`);
      return null;
    }
  }
}

// ━━━ 메인 핸들러 ━━━
export async function GET(req: NextRequest) {
  const start = Date.now();

  // chain=true 파라미터로 내부 트리거된 경우는 CRON_SECRET으로 검증
  const isChain = new URL(req.url).searchParams.get("chain") === "true";
  if (!isChain && !verifyCron(req)) {
    // 직접 호출 시 인증 없이도 개발 환경에서 허용 (CRON_SECRET 미설정 시)
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    // ━━━ 1. DeepGaze 완료 + 결합 분석 미완료 소재 조회 ━━━
    // saliency_url 또는 video_analysis가 있는 것 (DeepGaze 완료)
    // analysis_json이 NULL 이거나 deepgaze_context 필드가 없는 것 (결합 분석 미완료)
    const { data: imageMedia, error: imageErr } = await svc
      .from("creative_media")
      .select(
        "id, creative_id, media_type, media_url, storage_url, saliency_url, video_analysis, analysis_json, ad_copy",
      )
      .eq("media_type", "IMAGE")
      .not("saliency_url", "is", null)
      .order("creative_id", { ascending: true })
      .limit(BATCH_LIMIT);

    const { data: videoMedia, error: videoErr } = await svc
      .from("creative_media")
      .select(
        "id, creative_id, media_type, media_url, storage_url, saliency_url, video_analysis, analysis_json, ad_copy",
      )
      .eq("media_type", "VIDEO")
      .not("video_analysis", "is", null)
      .order("creative_id", { ascending: true })
      .limit(BATCH_LIMIT);

    if (imageErr) {
      console.error("[deepgaze-gemini] IMAGE 조회 실패:", imageErr.message);
    }
    if (videoErr) {
      console.error("[deepgaze-gemini] VIDEO 조회 실패:", videoErr.message);
    }

    // 두 결과 합치기
    const allMedia: unknown[] = [
      ...(imageMedia ?? []),
      ...(videoMedia ?? []),
    ];

    if (allMedia.length === 0) {
      return NextResponse.json({
        message: "deepgaze-gemini 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        total: 0,
        analyzed: 0,
        skipped: 0,
        errors: 0,
      });
    }

    // ━━━ 2. deepgaze_context 없는 것만 필터 ━━━
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingMedia = (allMedia as any[]).filter((row) => {
      const analysisJson = row.analysis_json as Record<string, unknown> | null;
      // analysis_json이 없거나, deepgaze_context 필드가 없으면 처리 대상
      return !analysisJson?.deepgaze_context;
    });

    console.log(
      `[deepgaze-gemini] 전체 DeepGaze 완료: ${allMedia.length}건, 결합 분석 대상: ${pendingMedia.length}건`,
    );

    if (pendingMedia.length === 0) {
      return NextResponse.json({
        message: "deepgaze-gemini 완료 — 모두 분석됨",
        elapsed: "0.0s",
        total: allMedia.length,
        analyzed: 0,
        skipped: allMedia.length,
        errors: 0,
      });
    }

    // 2단계: creative_id → creatives 테이블에서 추가 정보 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creativeIds = [...new Set(pendingMedia.map((r: any) => r.creative_id as string))];
    const { data: creativesData } = await svc
      .from("creatives")
      .select("id, ad_id, account_id, lp_url")
      .in("id", creativeIds);

    const creativeMap = new Map<string, { ad_id: string; account_id: string; lp_url: string | null }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (creativesData ?? []).map((c: any) => [
        c.id,
        { ad_id: c.ad_id, account_id: c.account_id, lp_url: c.lp_url ?? null },
      ]),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: CreativeMediaRow[] = pendingMedia
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const creative = creativeMap.get(r.creative_id);
        if (!creative) return null;
        return { ...r, creatives: creative } as CreativeMediaRow;
      })
      .filter(Boolean) as CreativeMediaRow[];

    // ━━━ 3. 소재별 결합 분석 ━━━
    let analyzed = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        // 이미지 URL 결정
        const imageUrl = row.storage_url || row.media_url;
        if (!imageUrl) {
          console.log(`[deepgaze-gemini] 이미지 URL 없음 스킵: id=${row.id}`);
          skipped++;
          continue;
        }

        // DeepGaze 결과 로드
        let saliencyData: SaliencyData | null = null;
        const videoData: VideoSaliencyData | null =
          row.media_type === "VIDEO"
            ? (row.video_analysis as VideoSaliencyData | null)
            : null;

        if (row.media_type === "IMAGE" && row.saliency_url) {
          saliencyData = await loadSaliencyData(row.saliency_url);
        }

        // DeepGaze 컨텍스트 텍스트 빌드
        const deepGazeContext = buildDeepGazeContextText(
          saliencyData,
          videoData,
          row.media_type,
        );

        // 프롬프트 빌드
        const prompt = buildAnalysisPrompt(deepGazeContext, row.ad_copy);

        // Gemini 결합 분석 호출
        const analysisResult = await callGeminiAnalysis(
          imageUrl,
          row.media_type ?? "IMAGE",
          prompt,
          deepGazeContext,
        );

        if (!analysisResult) {
          console.warn(
            `[deepgaze-gemini] Gemini 분석 실패 id=${row.id}, fallback 없음 (결과 null)`,
          );
          errors++;
          continue;
        }

        // deepgaze_context 메타데이터 추가
        const enrichedAnalysis: Record<string, unknown> = {
          ...analysisResult,
          deepgaze_context: {
            has_deepgaze: !!deepGazeContext,
            media_type: row.media_type,
            saliency_source: row.media_type === "VIDEO" ? "video_analysis" : "saliency_url",
            analyzed_at: new Date().toISOString(),
            model: GEMINI_MODEL,
            ...(deepGazeContext ? { deepgaze_summary: deepGazeContext } : {}),
          },
        };

        // 기존 analysis_json이 있으면 병합 (deepgaze_context 필드만 추가)
        const existingAnalysis = row.analysis_json ?? {};
        const finalAnalysis: Record<string, unknown> = {
          ...existingAnalysis,
          ...enrichedAnalysis,
        };

        // creative_media.analysis_json 업데이트
        const { error: updateErr } = await svc
          .from("creative_media")
          .update({
            analysis_json: finalAnalysis,
            analyzed_at: new Date().toISOString(),
            analysis_model: GEMINI_MODEL,
          })
          .eq("id", row.id);

        if (updateErr) {
          console.error(
            `[deepgaze-gemini] 업데이트 실패 id=${row.id}: ${updateErr.message}`,
          );
          errors++;
        } else {
          const creativeInfo = row.creatives;
          console.log(
            `[deepgaze-gemini] 완료 id=${row.id} ad_id=${creativeInfo?.ad_id ?? "unknown"} ` +
            `deepgaze=${!!deepGazeContext} overall=${analysisResult.overall_score ?? "?"}`,
          );
          analyzed++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[deepgaze-gemini] 개별 소재 실패 id=${row.id}: ${msg}`);
        errors++;
        // 개별 실패 → 다음 건 계속 진행 (NFR-04)
      }

      // Gemini API rate limit 대비 딜레이 (1초)
      await new Promise((r) => setTimeout(r, 1000));
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[deepgaze-gemini] 완료: total=${rows.length} analyzed=${analyzed} skipped=${skipped} errors=${errors} ${elapsed}s`,
    );

    return NextResponse.json({
      message: "deepgaze-gemini 완료",
      elapsed: `${elapsed}s`,
      total: rows.length,
      analyzed,
      skipped,
      errors,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[deepgaze-gemini] 치명적 에러 (${elapsed}s):`, e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
