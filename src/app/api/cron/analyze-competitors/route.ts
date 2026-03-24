import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadCompetitorMedia } from "@/lib/competitor/competitor-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const COMPETITOR_PREFIX = "competitor:";
const BATCH_LIMIT = 100;

const IMAGE_ANALYSIS_PROMPT = `이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록(\`\`\`) 사용 금지. 주석 금지. 설명 텍스트 금지.

{
  "format": "image|video|carousel|gif",
  "hook": { "type": "question|shock|benefit|problem|none", "text": "후킹 텍스트 또는 null", "position_sec": 0 },
  "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
  "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none" },
  "text_overlay": { "ratio_pct": 20, "headline": "메인 텍스트", "cta_text": "CTA 텍스트" },
  "color": { "dominant": "#FF6B6B", "palette": ["#FF6B6B", "#4ECDC4"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
  "style": "ugc|professional|minimal|bold|lifestyle",
  "social_proof": { "review_shown": false, "before_after": false, "testimonial": false },
  "cta": { "type": "button|text|overlay|none", "position": "bottom|center|end_frame|none", "color": "#FF6B6B" },
  "video_structure": null
}`;

const VIDEO_ANALYSIS_PROMPT = `이 광고 소재 이미지(비디오 썸네일)를 분석해서 아래 JSON 스키마에 맞춰 출력해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록(\`\`\`) 사용 금지. 주석 금지. 설명 텍스트 금지.

{
  "format": "video",
  "hook": { "type": "question|shock|benefit|problem|none", "text": "후킹 텍스트 또는 null", "position_sec": 0 },
  "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
  "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none" },
  "text_overlay": { "ratio_pct": 20, "headline": "메인 텍스트", "cta_text": "CTA 텍스트" },
  "color": { "dominant": "#FF6B6B", "palette": ["#FF6B6B", "#4ECDC4"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
  "style": "ugc|professional|minimal|bold|lifestyle",
  "social_proof": { "review_shown": false, "before_after": false, "testimonial": false },
  "cta": { "type": "button|text|overlay|none", "position": "bottom|center|end_frame|none", "color": "#FF6B6B" },
  "video_structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "씬 설명" }
    ],
    "pacing": "fast|medium|slow",
    "bgm": true,
    "narration": false
  }
}`;

interface QueueItem {
  id: string;
  brand_page_id: string;
  ad_id: string;
}

interface AdCacheRow {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  ad_text: string | null;
  ad_title: string | null;
  display_format: string;
  image_url: string | null;
  video_preview_url: string | null;
}

/** Gemini Vision으로 이미지 분석 → JSON 파싱 */
async function analyzeCreative(
  imageUrl: string,
  adCopy: string | null,
  displayFormat: string,
): Promise<Record<string, unknown> | null> {
  if (!GEMINI_API_KEY) return null;

  // 이미지 다운로드
  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch {
    console.warn(`[analyze-competitors] 이미지 다운로드 타임아웃: ${imageUrl}`);
    return null;
  }

  if (!imgRes.ok) {
    console.warn(
      `[analyze-competitors] 이미지 다운로드 실패: ${imgRes.status}`,
    );
    return null;
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");

  const isVideo = displayFormat === "VIDEO";
  const analysisPrompt = isVideo ? VIDEO_ANALYSIS_PROMPT : IMAGE_ANALYSIS_PROMPT;

  const parts: object[] = [
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  if (adCopy) {
    parts.push({ text: `광고 카피: ${adCopy}` });
  }
  parts.push({ text: analysisPrompt });

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
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    console.warn(`[analyze-competitors] Gemini API 타임아웃`);
    return null;
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    console.warn(
      `[analyze-competitors] Gemini API 실패: ${genRes.status} ${errText.slice(0, 200)}`,
    );
    return null;
  }

  const data = await genRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.warn(
      `[analyze-competitors] 응답 없음 (finishReason: ${data.candidates?.[0]?.finishReason || "UNKNOWN"})`,
    );
    return null;
  }

  // JSON 직접 파싱 시도
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // 폴백: 마크다운 코드블록 제거 + JSON 추출
  }

  const cleaned = rawText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/^[^{]*/, "")
    .replace(/[^}]*$/, "")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\/\/.*/g, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`[analyze-competitors] JSON 추출 실패`);
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    console.warn(`[analyze-competitors] JSON 파싱 실패`);
    return null;
  }
}

/** 분석 결과 → creative_media.analysis_json용 중간 행 */
function buildAnalysisRow(
  adArchiveId: string,
  pageId: string,
  analysis: Record<string, unknown>,
) {
  const hook = analysis.hook as Record<string, unknown> | undefined;
  const productVisibility = analysis.product_visibility as
    | Record<string, unknown>
    | undefined;
  const humanPresence = analysis.human_presence as
    | Record<string, unknown>
    | undefined;
  const textOverlay = analysis.text_overlay as
    | Record<string, unknown>
    | undefined;
  const color = analysis.color as Record<string, unknown> | undefined;
  const socialProof = analysis.social_proof as
    | Record<string, unknown>
    | undefined;
  const cta = analysis.cta as Record<string, unknown> | undefined;
  const videoStructure = analysis.video_structure as
    | Record<string, unknown>
    | null
    | undefined;

  return {
    ad_id: `${COMPETITOR_PREFIX}${adArchiveId}`,
    account_id: pageId,
    format: (analysis.format as string) || null,
    hook_type: (hook?.type as string) || null,
    hook_text: (hook?.text as string) || null,
    product_position: (productVisibility?.position as string) || null,
    product_size_pct: (productVisibility?.size_pct as number) || null,
    human_presence: (humanPresence?.face as boolean) ?? false,
    text_overlay_ratio: (textOverlay?.ratio_pct as number) || null,
    dominant_color: (color?.dominant as string) || null,
    color_tone: (color?.tone as string) || null,
    color_contrast: (color?.contrast as string) || null,
    style: (analysis.style as string) || null,
    social_proof_types: [
      socialProof?.review_shown && "review",
      socialProof?.before_after && "before_after",
      socialProof?.testimonial && "testimonial",
    ].filter(Boolean),
    cta_type: (cta?.type as string) || null,
    cta_position: (cta?.position as string) || null,
    cta_color: (cta?.color as string) || null,
    video_scenes: videoStructure?.scenes || null,
    video_pacing: (videoStructure?.pacing as string) || null,
    has_bgm: (videoStructure?.bgm as boolean) ?? null,
    has_narration: (videoStructure?.narration as boolean) ?? null,
    raw_analysis: analysis,
    model_version: GEMINI_MODEL,
  };
}

/**
 * GET /api/cron/analyze-competitors
 * Cron: competitor_analysis_queue pending 항목 Gemini Vision 분석
 * 스케줄: 매일 23:00 KST (14:00 UTC)
 */
export async function GET(req: NextRequest) {
  // Cron 인증 확인
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY 미설정", processed: 0 },
      { status: 200 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // pending 항목 조회 (최대 20건, id ASC 순)
  const { data: queueItems, error: queueError } = await svc
    .from("competitor_analysis_queue")
    .select("id, brand_page_id, ad_id")
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(BATCH_LIMIT);

  if (queueError || !queueItems) {
    console.error("[analyze-competitors] 큐 조회 실패:", queueError);
    return NextResponse.json({ error: "큐 조회 실패", processed: 0 });
  }

  const items = queueItems as QueueItem[];

  if (items.length === 0) {
    return NextResponse.json({ processed: 0, completed: 0, failed: 0, total: 0 });
  }

  // processing으로 상태 변경 (일괄)
  const itemIds = items.map((q) => q.id);
  await svc
    .from("competitor_analysis_queue")
    .update({ status: "processing" })
    .in("id", itemIds);

  // 대상 ad_id 목록으로 competitor_ad_cache 조회
  const adIds = items.map((q) => q.ad_id);
  const { data: adDetails } = await svc
    .from("competitor_ad_cache")
    .select(
      "ad_archive_id, page_id, page_name, ad_text, ad_title, display_format, image_url, video_preview_url",
    )
    .in("ad_archive_id", adIds);

  const adMap = new Map(
    ((adDetails ?? []) as AdCacheRow[]).map((ad) => [ad.ad_archive_id, ad]),
  );

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let mediaStoredCount = 0;

  for (const qItem of items) {
    const ad = adMap.get(qItem.ad_id);

    if (!ad) {
      console.warn(
        `[analyze-competitors] ${qItem.ad_id} — 소재 정보 없음 (스킵)`,
      );
      await svc
        .from("competitor_analysis_queue")
        .update({ status: "failed" })
        .eq("id", qItem.id);
      skipped++;
      continue;
    }

    // 비디오는 video_preview_url 우선, 없으면 image_url
    const isVideo = ad.display_format === "VIDEO";
    const imageUrl =
      isVideo && ad.video_preview_url ? ad.video_preview_url : ad.image_url;

    if (!imageUrl) {
      console.warn(
        `[analyze-competitors] ${ad.page_name} / ${ad.ad_archive_id} — 이미지 URL 없음 (스킵)`,
      );
      await svc
        .from("competitor_analysis_queue")
        .update({ status: "failed" })
        .eq("id", qItem.id);
      skipped++;
      continue;
    }

    // 광고 카피: ad_text와 ad_title 합치기
    const adCopy = [ad.ad_title, ad.ad_text].filter(Boolean).join(" / ") || null;

    // ═══ 동일 이미지 URL 기반 analysis_json 재사용 ═══
    // 같은 media_url로 이미 분석된 row가 있으면 Gemini API 호출 없이 복사
    const { data: existingAnalysis } = await svc
      .from("creative_media")
      .select("analysis_json, analyzed_at, analysis_model")
      .eq("media_url", imageUrl)
      .not("analysis_json", "is", null)
      .limit(1)
      .maybeSingle();

    if (existingAnalysis?.analysis_json) {
      await svc
        .from("creative_media")
        .upsert(
          {
            creative_id: `${COMPETITOR_PREFIX}${ad.ad_archive_id}`,
            analysis_json: existingAnalysis.analysis_json,
            analyzed_at: existingAnalysis.analyzed_at,
            analysis_model: existingAnalysis.analysis_model,
            media_url: imageUrl,
            ad_copy: adCopy,
            media_type: isVideo ? "VIDEO" : "IMAGE",
            position: 0,
          },
          { onConflict: "creative_id,position" },
        );
      console.log(`[analyze-competitors] analysis_json media_url 재사용: ${ad.ad_archive_id}`);

      await svc
        .from("competitor_analysis_queue")
        .update({ status: "completed" })
        .eq("id", qItem.id);
      completed++;
      mediaStoredCount++;
      continue;
    }

    // Gemini Vision 분석
    const analysis = await analyzeCreative(imageUrl, adCopy, ad.display_format);

    if (!analysis) {
      await svc
        .from("competitor_analysis_queue")
        .update({ status: "failed" })
        .eq("id", qItem.id);
      failed++;
      continue;
    }

    // creative_media에 analysis_json upsert
    const row = buildAnalysisRow(ad.ad_archive_id, ad.page_id, analysis);
    const { error: upsertError } = await svc
      .from("creative_media")
      .upsert(
        {
          creative_id: row.ad_id,
          analysis_json: row.raw_analysis,
          media_url: imageUrl,
          ad_copy: adCopy,
          media_type: isVideo ? "VIDEO" : "IMAGE",
          position: 0,
        },
        { onConflict: "creative_id,position" },
      );

    if (upsertError) {
      console.error(
        `[analyze-competitors] upsert 실패: ${ad.ad_archive_id}`,
        upsertError,
      );
      await svc
        .from("competitor_analysis_queue")
        .update({ status: "failed" })
        .eq("id", qItem.id);
      failed++;
      continue;
    }

    // ── 소재 이미지를 Supabase Storage에 업로드 (best-effort) ──
    // 경로: competitor/{page_id}/media/{ad_archive_id}.jpg (ADR-001)
    try {
      await uploadCompetitorMedia(imageUrl, ad.page_id, ad.ad_archive_id);
    } catch (e) {
      // best-effort: 업로드 실패해도 분석 결과는 유지
      console.warn(
        `[analyze-competitors] Storage 업로드 실패 (무시): ${ad.ad_archive_id}`,
        e instanceof Error ? e.message : e,
      );
    }

    // 큐 상태 completed로 업데이트
    await svc
      .from("competitor_analysis_queue")
      .update({ status: "completed" })
      .eq("id", qItem.id);

    completed++;
    mediaStoredCount++;

    // Gemini rate limit 완화: 항목 간 200ms 딜레이
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `[analyze-competitors] 처리 완료 — total: ${items.length}, completed: ${completed}, failed: ${failed}, skipped: ${skipped}, media_stored: ${mediaStoredCount}`,
  );

  return NextResponse.json({
    processed: items.length,
    completed,
    failed,
    skipped,
    media_stored: mediaStoredCount,
    total: items.length,
  });
}
