"use client";

import type { AnalysisJsonV3 } from "@/types/prescription";

// ── 오디오 분석 ────────────────────────────────────────────────────
// 목업: 나레이션 톤, BGM 장르, 감정 흐름

interface AudioAnalysisProps {
  analysisJson: AnalysisJsonV3;
}

// 나레이션 톤 한국어
const TONE_LABELS: Record<string, string> = {
  professional: "전문적이고 신뢰감 있는 톤",
  casual: "친한 친구가 꿀팁 알려주듯 친근한 톤",
  energetic: "에너지 넘치고 확신에 찬 하이톤",
  calm: "차분하고 안정감 있는 톤",
};

// BGM 장르 한국어
const BGM_LABELS: Record<string, string> = {
  upbeat: "밝고 경쾌한 팝 · 빠른 템포 보조",
  calm: "잔잔하고 편안한 분위기",
  dramatic: "긴장감 있는 드라마틱한 사운드",
  trendy: "트렌디한 인스타그램 스타일 비트",
  none: "BGM 없음",
};

// 감정 흐름 색상 (enum 기반 fallback)
const EMOTION_COLORS: Record<string, { bg: string; color: string }> = {
  fear: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5" },
  joy: { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7" },
  surprise: { bg: "rgba(245,158,11,0.12)", color: "#fde68a" },
  trust: { bg: "rgba(139,92,246,0.12)", color: "#c4b5fd" },
  anticipation: { bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
  sadness: { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" },
  anger: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5" },
  neutral: { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" },
};

const EMOTION_LABELS: Record<string, string> = {
  fear: "공감(문제)",
  joy: "만족(결과)",
  surprise: "감탄(효과)",
  trust: "신뢰(권위)",
  anticipation: "기대(호기심)",
  sadness: "아쉬움",
  anger: "분노",
  neutral: "중립",
};

// 감정 흐름 텍스트에서 키워드 추출 → 뱃지 색상 매핑
const FLOW_BADGE_COLORS: Array<{ keyword: string; bg: string; color: string }> = [
  { keyword: "공감", bg: "rgba(239,68,68,0.12)", color: "#fca5a5" },
  { keyword: "문제", bg: "rgba(239,68,68,0.12)", color: "#fca5a5" },
  { keyword: "신뢰", bg: "rgba(139,92,246,0.12)", color: "#c4b5fd" },
  { keyword: "권위", bg: "rgba(139,92,246,0.12)", color: "#c4b5fd" },
  { keyword: "감탄", bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
  { keyword: "물광", bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
  { keyword: "효과", bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
  { keyword: "유익", bg: "rgba(16,185,129,0.12)", color: "#6ee7b7" },
  { keyword: "꿀팁", bg: "rgba(16,185,129,0.12)", color: "#6ee7b7" },
  { keyword: "만족", bg: "rgba(16,185,129,0.12)", color: "#6ee7b7" },
  { keyword: "제안", bg: "rgba(245,158,11,0.12)", color: "#fde68a" },
  { keyword: "할인", bg: "rgba(245,158,11,0.12)", color: "#fde68a" },
  { keyword: "행동", bg: "rgba(245,158,11,0.12)", color: "#fde68a" },
  { keyword: "기대", bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
  { keyword: "호기심", bg: "rgba(59,130,246,0.12)", color: "#93c5fd" },
];

function getBadgeColor(text: string): { bg: string; color: string } {
  for (const item of FLOW_BADGE_COLORS) {
    if (text.includes(item.keyword)) return { bg: item.bg, color: item.color };
  }
  return { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" };
}

function parseEmotionFlow(flowText: string): string[] {
  return flowText.split("→").map((s) => s.trim()).filter(Boolean);
}

export function AudioAnalysis({ analysisJson }: AudioAnalysisProps) {
  const audio = analysisJson.audio;
  const detail = analysisJson.audio_analysis_detail;

  // audio 기본 데이터도 없으면 렌더 안 함
  if (!audio && !detail) return null;

  // v3: Gemini 상세 분석이 있으면 자유 텍스트 사용
  const toneText = detail?.narration_tone
    ?? (audio ? (TONE_LABELS[audio.narration_tone] ?? audio.narration_tone) : "-");
  const bgmText = detail?.bgm_genre
    ?? (audio ? (BGM_LABELS[audio.bgm_genre] ?? audio.bgm_genre) : "-");
  const emotionFlowText = detail?.emotion_flow;

  // fallback: enum 기반 감정 흐름
  const emotion = analysisJson.psychology?.emotion;
  const emotionStyle = emotion ? EMOTION_COLORS[emotion] : null;
  const emotionLabel = emotion ? EMOTION_LABELS[emotion] : null;

  const hasNarration = audio?.has_narration ?? !!detail?.narration_tone;
  const hasBgm = audio ? audio.bgm_genre !== "none" : !!detail?.bgm_genre;

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#8b5cf6" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔊</span>
        <div className="text-sm font-bold text-gray-800">오디오 분석</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* 나레이션 */}
        <div className="bg-white rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-1">나레이션 톤</div>
          <div className="text-xs text-gray-800">
            {hasNarration ? toneText : "나레이션 없음"}
          </div>
          {hasBgm && (
            <>
              <div className="text-[11px] text-gray-500 mt-2 mb-1">BGM</div>
              <div className="text-xs text-gray-800">{bgmText}</div>
            </>
          )}
        </div>

        {/* 감정 흐름 */}
        <div className="bg-white rounded-lg p-3">
          <div className="text-[11px] text-gray-500 mb-1">감정 흐름</div>
          {emotionFlowText ? (
            <div className="flex flex-wrap gap-1 items-center mt-1">
              {parseEmotionFlow(emotionFlowText).map((step, idx, arr) => (
                <span key={idx} className="flex items-center gap-1">
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{ background: getBadgeColor(step).bg, color: getBadgeColor(step).color }}
                  >
                    {step}
                  </span>
                  {idx < arr.length - 1 && (
                    <span className="text-gray-400 text-[10px]">→</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 items-center mt-1">
              {emotionLabel && emotionStyle && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px]"
                  style={{ background: emotionStyle.bg, color: emotionStyle.color }}
                >
                  {emotionLabel}
                </span>
              )}
              {audio?.sound_effects && (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-400">
                  효과음 있음
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 사운드 오프 팁 */}
      <div
        className="text-[11px] p-2 bg-white rounded-md"
        style={{ borderLeft: "3px solid #f59e0b" }}
      >
        💊 <strong className="text-amber-600">개선:</strong>{" "}
        사운드 오프에서도 핵심 키워드 자막 가독성 높이기 + CTA 구간 진입 시 효과음으로 시청자 주의 환기
      </div>
    </div>
  );
}
