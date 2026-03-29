#!/usr/bin/env node
import { getSupabaseConfig } from "./lib/env.mjs";
const { SB_URL, SB_KEY, env } = getSupabaseConfig();
const GEMINI_KEY = env.GEMINI_API_KEY;
const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// 데이터 수집
const cr = await fetch(`${SB_URL}/rest/v1/creatives?select=id&ad_id=eq.120241760856630479&limit=1`, {headers:h}).then(r=>r.json());
const media = await fetch(`${SB_URL}/rest/v1/creative_media?select=storage_url,analysis_json,ad_copy&creative_id=eq.${cr[0].id}&limit=1`, {headers:h}).then(r=>r.json());
const a = media[0].analysis_json;
const sal = await fetch(`${SB_URL}/rest/v1/creative_saliency?select=*&ad_id=eq.120241760856630479&limit=1`, {headers:h}).then(r=>r.json());
const perf = await fetch(`${SB_URL}/rest/v1/daily_ad_insights?select=*&ad_id=eq.120241760856630479&order=impressions.desc&limit=1`, {headers:h}).then(r=>r.json());

const guide = `처방 가이드 (축1 레퍼런스):
- 고객 여정 4단계: 감각(보고+듣고) → 사고(생각) → 행동(클릭) → 행동(구매)
- Top 5 Hook: Confession / Bold claim / Relatability / Contrast / Curiosity
- 메타 CTA 버튼은 플랫폼이 제공. 영상에서는 '누를 이유'만 만들 것
- 세이프티존: 상단14% + 하단35% + 좌우6% (9:16 기준)
- 사운드 오프에서도 자막으로 메시지 전달 가능해야
- 텍스트 비율 20% 이하
- UGC > professional (참여율), 얼굴 노출 시선 +40% (Neurons)
- 피드 15~30초, 릴스 10~15초
- 유사도 >0.92면 소재 다양화 시급
- 절대 금지: CTA 버튼 추가 처방, 세이프티존 밖 배치, 타겟팅 변경 처방`;

const prompt = `너는 광고 소재 분석 전문가다. 아래 영상 소재를 분석하고 씬별 고객 여정 + 처방을 생성해라.

${guide}

[이 소재의 5축 분석 결과]
${JSON.stringify({visual: a.visual, text: a.text, psychology: a.psychology, audio: a.audio, structure: a.structure, attention: a.attention}, null, 2)}

[시선 데이터]
CTA 주목도: ${sal[0]?.cta_attention_score}, 인지부하: ${sal[0]?.cognitive_load}
top_fixations: ${JSON.stringify(sal[0]?.top_fixations)}

[성과 데이터]
3초시청률: ${perf[0]?.video_p3s_rate}%, CTR: ${perf[0]?.ctr}%, ROAS: ${perf[0]?.roas}, 참여: ${perf[0]?.engagement_per_10k}/만

[광고 카피]
${media[0].ad_copy?.substring(0, 500)}

출력 형식 (JSON):
{
  "ad_category": { "format": "영상 포맷", "hook_tactic": "훅 유형", "messaging": "메시징 앵글", "audience": "타겟" },
  "customer_journey_summary": {
    "sensation": "감각 단계 요약 (보고+듣고)",
    "thinking": "사고 단계 요약 (느끼고+판단)",
    "action_click": "행동(선행) 요약 (클릭)",
    "action_purchase": "행동(후행) 요약 (구매)"
  },
  "scenes": [
    {
      "time": "0-3초",
      "type": "hook/demo/result/cta",
      "saw": "고객이 본 것 (화면 + 자막)",
      "heard": "고객이 들은 것 (나레이션 + BGM)",
      "felt": "고객이 느낀 것 (감정 + 설득)",
      "gaze": "시선 분석 (어디를 봤는지)",
      "text_overlay": { "content": "자막 원문", "position": "위치", "safety_zone": "세이프티존 내/외" },
      "prescription": { "action": "구체적 개선안", "journey_stage": "감각/사고/행동", "reason": "근거", "difficulty": "쉬움/보통/어려움" }
    }
  ],
  "audio_analysis": {
    "narration_tone": "톤",
    "bgm": "BGM 정보",
    "emotion_flow": "감정 흐름",
    "prescription": "오디오 개선안"
  },
  "top3_priorities": [
    { "rank": 1, "title": "개선 제목", "reason_reference": "축1 근거", "journey_stage": "여정 단계", "difficulty": "난이도" }
  ]
}

순수 JSON만 반환. 마크다운 코드블록 금지.`;

// 영상 다운로드
console.log("영상 다운로드 중...");
const vidRes = await fetch(media[0].storage_url, {signal: AbortSignal.timeout(30000)});
const vidBuf = await vidRes.arrayBuffer();
const vidBase64 = Buffer.from(vidBuf).toString("base64");
console.log(`영상: ${(vidBuf.byteLength/1024/1024).toFixed(1)}MB`);

// Gemini 호출
console.log("Gemini 호출 중...");
const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_KEY}`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    contents: [{
      parts: [
        {inline_data: {mime_type: "video/mp4", data: vidBase64}},
        {text: prompt}
      ]
    }],
    generationConfig: {temperature: 0.3, maxOutputTokens: 8192}
  })
});

const result = await geminiRes.json();
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (text) {
  console.log("\n=== Gemini 처방 결과 ===\n");
  console.log(text);
} else {
  console.log("에러:", JSON.stringify(result).substring(0, 500));
}
