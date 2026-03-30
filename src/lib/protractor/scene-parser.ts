/**
 * scene_analysis 데이터 파싱 유틸리티
 * analysis_json.scene_analysis → UI용 구조 변환
 *
 * 사용처: customer-journey.tsx, 소재분석 탭 씬별 상세
 */

import type { AnalysisJsonV3 } from "@/types/prescription";

// ── 타입 정의 ─────────────────────────────────────────────────────

/** scene_analysis.scenes[] 원본 타입 (AnalysisJsonV3에서 추출) */
export type SceneRaw = NonNullable<
  AnalysisJsonV3["scene_analysis"]
>["scenes"][number];

/** scene_analysis.overall 원본 타입 */
export type SceneOverall = NonNullable<
  AnalysisJsonV3["scene_analysis"]
>["overall"];

/** UI에서 사용하는 씬 데이터 */
export interface SceneForUI {
  /** "0-3초" 등 시간 범위 */
  timeRange: string;
  /** 씬 타입: hook, demo, result, cta, brand */
  type: string;
  /** 봤다 — 씬 설명 (영상에서 시각적으로 보이는 것) */
  saw: string;
  /** 들었다 — 오디오 관련 (나레이션, BGM 등) */
  heard: string;
  /** 느꼈다 — 감정/심리 반응 */
  felt: string;
  /** 시선 데이터 */
  gaze: {
    dominantRegion: string;
    fixationCount: number;
    avgIntensity: number | null;
    ctaVisible: boolean;
  } | null;
  /** 요소별 주목도 */
  elementAttention: Array<{
    type: string;
    attentionPct: number;
  }>;
  /** 훅 강도 (0~1) */
  hookStrength: number;
  /** 주목 품질 */
  attentionQuality: "high" | "medium" | "low";
  /** 메시지 명확도 */
  messageClarity: "high" | "medium" | "low";
  /** 시청자 예상 행동 */
  viewerAction: string;
  /** 개선 제안 */
  improvement: string | null;
}

/** 오디오 분석 UI용 구조 */
export interface AudioForUI {
  hasNarration: boolean;
  narrationTone: string;
  bgmGenre: string;
  soundEffects: boolean;
}

/** 전체 씬 분석 파싱 결과 */
export interface SceneAnalysisParsed {
  scenes: SceneForUI[];
  overall: {
    totalScenes: number;
    hookEffective: boolean;
    ctaReached: boolean;
    analyzedAt: string;
  } | null;
  audio: AudioForUI | null;
}

// ── 씬 타입별 한국어 매핑 ───────────────────────────────────────────

const SCENE_TYPE_KR: Record<string, string> = {
  hook: "훅",
  demo: "데모",
  result: "결과",
  cta: "CTA",
  brand: "브랜드",
};

// ── 감정 매핑 (viewer_action → 느꼈다) ───────────────────────────────

const EMOTION_KEYWORDS: Record<string, string> = {
  "호기심": "호기심이 생겼다",
  "관심": "관심을 가졌다",
  "클릭": "클릭하고 싶었다",
  "구매": "구매 의향이 생겼다",
  "신뢰": "신뢰감을 느꼈다",
  "공감": "공감했다",
  "놀라": "놀라움을 느꼈다",
  "불안": "불안감을 느꼈다",
  "궁금": "궁금해졌다",
};

function deriveFeeling(viewerAction: string, sceneType: string): string {
  // viewer_action에서 감정 키워드 매칭
  for (const [keyword, feeling] of Object.entries(EMOTION_KEYWORDS)) {
    if (viewerAction.includes(keyword)) return feeling;
  }

  // 씬 타입 기반 기본값
  switch (sceneType) {
    case "hook":
      return "호기심 유발";
    case "demo":
      return "이해/신뢰 형성";
    case "result":
      return "효과 확인";
    case "cta":
      return "행동 의향";
    case "brand":
      return "브랜드 인식";
    default:
      return "-";
  }
}

// ── 오디오 분석 파싱 ─────────────────────────────────────────────────

const TONE_KR: Record<string, string> = {
  professional: "전문적",
  casual: "캐주얼",
  energetic: "활기찬",
  calm: "차분한",
};

const BGM_KR: Record<string, string> = {
  upbeat: "신나는",
  calm: "잔잔한",
  dramatic: "드라마틱",
  trendy: "트렌디",
  none: "없음",
};

function parseAudio(audio: AnalysisJsonV3["audio"]): AudioForUI | null {
  if (!audio) return null;
  return {
    hasNarration: audio.has_narration,
    narrationTone: TONE_KR[audio.narration_tone] ?? audio.narration_tone,
    bgmGenre: BGM_KR[audio.bgm_genre] ?? audio.bgm_genre,
    soundEffects: audio.sound_effects,
  };
}

/** 오디오 정보를 "들었다" 텍스트로 변환 */
function deriveHeard(audio: AudioForUI | null, sceneType: string): string {
  if (!audio) return "-";
  const parts: string[] = [];
  if (audio.hasNarration) {
    parts.push(`${audio.narrationTone} 나레이션`);
  }
  if (audio.bgmGenre !== "없음") {
    parts.push(`${audio.bgmGenre} BGM`);
  }
  if (audio.soundEffects && sceneType === "cta") {
    parts.push("효과음");
  }
  return parts.length > 0 ? parts.join(" + ") : "-";
}

// ── 메인 파서 ─────────────────────────────────────────────────────

/**
 * analysis_json에서 씬 분석 데이터를 UI용 구조로 파싱
 *
 * 우선순위:
 * 1. scene_analysis 있으면 → 씬별 상세 데이터 사용
 * 2. scene_analysis 없고 structure만 있으면 → 균등 분할 fallback
 * 3. 둘 다 없으면 → 기본 3씬 생성
 */
export function parseSceneAnalysis(
  analysisJson: AnalysisJsonV3,
  durationSeconds: number,
): SceneAnalysisParsed {
  const audio = parseAudio(analysisJson.audio);
  const sceneAnalysis = analysisJson.scene_analysis;

  // ── 1. scene_analysis 있으면 풍부한 데이터 사용 ──
  if (sceneAnalysis?.scenes && sceneAnalysis.scenes.length > 0) {
    const scenes: SceneForUI[] = sceneAnalysis.scenes.map((s) => ({
      timeRange: s.time,
      type: SCENE_TYPE_KR[s.type] ?? s.type,
      saw: s.desc || "-",
      heard: deriveHeard(audio, s.type),
      felt: deriveFeeling(s.analysis.viewer_action, s.type),
      gaze:
        s.deepgaze && s.deepgaze.fixation_count > 0
          ? {
              dominantRegion: s.deepgaze.dominant_region,
              fixationCount: s.deepgaze.fixation_count,
              avgIntensity: s.deepgaze.avg_intensity,
              ctaVisible: s.deepgaze.cta_visible,
            }
          : null,
      elementAttention: (s.element_attention ?? []).map((ea) => ({
        type: ea.type,
        attentionPct: ea.attention_pct,
      })),
      hookStrength: s.analysis.hook_strength,
      attentionQuality: s.analysis.attention_quality,
      messageClarity: s.analysis.message_clarity,
      viewerAction: s.analysis.viewer_action,
      improvement: s.analysis.improvement ?? null,
    }));

    return {
      scenes,
      overall: sceneAnalysis.overall
        ? {
            totalScenes: sceneAnalysis.overall.total_scenes,
            hookEffective: sceneAnalysis.overall.hook_effective,
            ctaReached: sceneAnalysis.overall.cta_reached,
            analyzedAt: sceneAnalysis.overall.analyzed_at,
          }
        : null,
      audio,
    };
  }

  // ── 2. structure 기반 fallback ──
  const structure = analysisJson.structure;
  if (structure?.scene_count) {
    const sceneCount = structure.scene_count;
    const avgDur =
      structure.avg_scene_duration ||
      Math.round(durationSeconds / sceneCount);
    const defaultTypes = ["hook", "demo", "result", "cta"];

    const scenes: SceneForUI[] = Array.from(
      { length: sceneCount },
      (_, i) => {
        const start = Math.round(i * avgDur);
        const end = Math.min(Math.round((i + 1) * avgDur), durationSeconds);
        const sceneType = defaultTypes[Math.min(i, defaultTypes.length - 1)];
        return {
          timeRange: `${start}-${end}초`,
          type: SCENE_TYPE_KR[sceneType] ?? sceneType,
          saw: "-",
          heard: deriveHeard(audio, sceneType),
          felt: deriveFeeling("", sceneType),
          gaze: null,
          elementAttention: [],
          hookStrength: 0,
          attentionQuality: "medium" as const,
          messageClarity: "medium" as const,
          viewerAction: "",
          improvement: null,
        };
      },
    );

    return { scenes, overall: null, audio };
  }

  // ── 3. 기본 3씬 fallback ──
  const third = Math.round(durationSeconds / 3);
  const fallbackDefs: Array<{ type: string; saw: string }> = [
    { type: "hook", saw: "초반 훅 구간" },
    { type: "demo", saw: "제품/서비스 설명" },
    { type: "cta", saw: "행동 유도" },
  ];

  const scenes: SceneForUI[] = fallbackDefs.map((def, i) => {
    const start = i * third;
    const end = i === 2 ? durationSeconds : (i + 1) * third;
    return {
      timeRange: `${start}-${end}초`,
      type: SCENE_TYPE_KR[def.type] ?? def.type,
      saw: def.saw,
      heard: deriveHeard(audio, def.type),
      felt: deriveFeeling("", def.type),
      gaze: null,
      elementAttention: [],
      hookStrength: 0,
      attentionQuality: "medium" as const,
      messageClarity: "medium" as const,
      viewerAction: "",
      improvement: null,
    };
  });

  return { scenes, overall: null, audio };
}

/**
 * scene_analysis 데이터 존재 여부 확인
 * 프론트에서 풍부한 UI vs 간소 UI 분기에 사용
 */
export function hasDetailedSceneAnalysis(
  analysisJson: AnalysisJsonV3 | null | undefined,
): boolean {
  return (
    !!analysisJson?.scene_analysis?.scenes &&
    analysisJson.scene_analysis.scenes.length > 0
  );
}
