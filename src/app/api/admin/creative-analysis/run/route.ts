import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

// Vercel 최대 실행 시간 (소재 분석은 시간이 걸림)
export const maxDuration = 300;

// Gemini 2.0 Pro 모델
const MODEL = "gemini-2.5-pro";

// 소재 요소 분석 프롬프트 (이미지/GIF/카루셀 등 정적 소재용)
const ELEMENT_PROMPT = `이 광고 소재 이미지를 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

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

// 비디오 소재 프롬프트 (썸네일 기반이지만 video_structure 포함)
const VIDEO_ELEMENT_PROMPT = `이 광고 소재 이미지(비디오 썸네일)를 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

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

export async function POST(req: NextRequest) {
  // 관리자 권한 확인
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  // 요청 바디 파싱
  const body = await req.json().catch(() => ({}));
  const batchSize: number = body.batchSize || 50;
  const accountId: string | null = body.accountId || null;

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY 환경변수 미설정" },
      { status: 500 }
    );
  }

  // 1. 분석 대상 소재 조회 (is_active=true, media_url 있는 것)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("ad_creative_embeddings")
    .select("ad_id, account_id, media_url, media_type, ad_copy")
    .eq("is_active", true)
    .not("media_url", "is", null)
    .limit(batchSize);

  if (accountId) query = query.eq("account_id", accountId);

  const { data: creatives, error: fetchErr } = await query;
  if (fetchErr || !creatives) {
    return NextResponse.json(
      { error: fetchErr?.message || "소재 조회 실패" },
      { status: 500 }
    );
  }

  if (creatives.length === 0) {
    return NextResponse.json({
      message: "처리할 소재 없음",
      total: 0,
      skipped: 0,
      analyzed: 0,
      errors: 0,
    });
  }

  // 2. 이미 분석된 ad_id 조회하여 스킵
  const adIds = creatives.map((c: { ad_id: string }) => c.ad_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (svc as any)
    .from("creative_element_analysis")
    .select("ad_id")
    .in("ad_id", adIds);

  const existingSet = new Set(
    (existing || []).map((e: { ad_id: string }) => e.ad_id)
  );
  const toAnalyze = creatives.filter(
    (c: { ad_id: string }) => !existingSet.has(c.ad_id)
  );

  // 3. 각 소재 Gemini Vision 분석 + DB UPSERT
  let analyzed = 0;
  let errors = 0;

  for (const creative of toAnalyze) {
    try {
      // 이미지 다운로드
      const imgRes = await fetch(creative.media_url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!imgRes.ok) {
        errors++;
        continue;
      }

      const ct = imgRes.headers.get("content-type") || "image/jpeg";
      const mimeType = ct.startsWith("image/")
        ? ct.split(";")[0]
        : "image/jpeg";
      const buf = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");

      // 미디어 타입에 따라 프롬프트 선택
      const isVideo = creative.media_type === "VIDEO";
      const prompt = isVideo ? VIDEO_ELEMENT_PROMPT : ELEMENT_PROMPT;

      const parts: object[] = [
        { inline_data: { mime_type: mimeType, data: base64 } },
      ];

      // 광고 카피가 있으면 컨텍스트 추가
      if (creative.ad_copy) {
        parts.push({ text: `광고 카피: ${creative.ad_copy}` });
      }

      parts.push({ text: prompt });

      // Gemini API 호출
      const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );

      if (!genRes.ok) {
        errors++;
        continue;
      }

      const data = await genRes.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        errors++;
        continue;
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // DB UPSERT (ad_id 충돌 시 덮어씀)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (svc as any)
        .from("creative_element_analysis")
        .upsert(
          {
            ad_id: creative.ad_id,
            account_id: creative.account_id,
            format: analysis.format || null,
            hook_type: analysis.hook?.type || null,
            hook_text: analysis.hook?.text || null,
            product_position: analysis.product_visibility?.position || null,
            product_size_pct: analysis.product_visibility?.size_pct || null,
            human_presence: analysis.human_presence?.face || false,
            text_overlay_ratio: analysis.text_overlay?.ratio_pct || null,
            dominant_color: analysis.color?.dominant || null,
            color_tone: analysis.color?.tone || null,
            color_contrast: analysis.color?.contrast || null,
            style: analysis.style || null,
            social_proof_types: [
              analysis.social_proof?.review_shown && "review",
              analysis.social_proof?.before_after && "before_after",
              analysis.social_proof?.testimonial && "testimonial",
            ].filter(Boolean),
            cta_type: analysis.cta?.type || null,
            cta_position: analysis.cta?.position || null,
            cta_color: analysis.cta?.color || null,
            video_scenes: analysis.video_structure?.scenes || null,
            video_pacing: analysis.video_structure?.pacing || null,
            has_bgm: analysis.video_structure?.bgm ?? null,
            has_narration: analysis.video_structure?.narration ?? null,
            raw_analysis: analysis,
            model_version: MODEL,
          },
          { onConflict: "ad_id" }
        );

      if (!insertErr) analyzed++;
      else errors++;

      // Gemini API 레이트 리밋 방지
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    message: "소재 요소 분석 완료",
    total: creatives.length,
    skipped: existingSet.size,
    analyzed,
    errors,
  });
}
