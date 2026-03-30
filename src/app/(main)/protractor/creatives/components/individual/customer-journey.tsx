"use client";

import type { AnalysisJsonV3 } from "@/types/prescription";

interface CustomerJourneyProps {
  analysisJson: AnalysisJsonV3;
  durationSeconds: number;
}

// ── 씬 타입별 색상 ───────────────────────────────────────────────

const SCENE_COLORS: Record<string, { color: string; bg: string; borderColor: string }> = {
  훅: { color: "#ef4444", bg: "rgba(239,68,68,0.04)", borderColor: "#ef4444" },
  hook: { color: "#ef4444", bg: "rgba(239,68,68,0.04)", borderColor: "#ef4444" },
  전환: { color: "#ef4444", bg: "rgba(239,68,68,0.04)", borderColor: "#ef4444" },
  데모: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  demo: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  결과: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  result: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  브랜드: { color: "#8b5cf6", bg: "rgba(139,92,246,0.04)", borderColor: "#8b5cf6" },
  brand: { color: "#8b5cf6", bg: "rgba(139,92,246,0.04)", borderColor: "#8b5cf6" },
  CTA: { color: "#10b981", bg: "rgba(16,185,129,0.04)", borderColor: "#10b981" },
  cta: { color: "#10b981", bg: "rgba(16,185,129,0.04)", borderColor: "#10b981" },
  임상: { color: "#10b981", bg: "rgba(16,185,129,0.04)", borderColor: "#10b981" },
  팁: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  제형: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
  유지: { color: "#3b82f6", bg: "rgba(59,130,246,0.04)", borderColor: "#3b82f6" },
};

const DEFAULT_SCENE_COLOR = { color: "#64748b", bg: "rgba(100,116,139,0.04)", borderColor: "#e2e8f0" };

// ── 씬 데이터 추출 ───────────────────────────────────────────────

interface SceneData {
  timeRange: string;
  type: string;
  saw: string;
  heard: string;
  felt: string;
}

function extractScenes(analysisJson: AnalysisJsonV3, durationSeconds: number): SceneData[] {
  // analysis_json에 customer_journey_summary가 있으면 간단 요약 모드
  // structure에 scenes가 없으면 기본 구조 생성
  const structure = analysisJson.structure;

  if (!structure || !structure.scene_count) {
    // 기본 3-씬 구조 생성
    const third = Math.round(durationSeconds / 3);
    return [
      {
        timeRange: `0-${third}초`,
        type: "훅",
        saw: "초반 훅 구간",
        heard: "-",
        felt: "호기심 유발",
      },
      {
        timeRange: `${third}-${third * 2}초`,
        type: "데모",
        saw: "제품/서비스 설명",
        heard: "-",
        felt: "이해/신뢰 형성",
      },
      {
        timeRange: `${third * 2}-${durationSeconds}초`,
        type: "CTA",
        saw: "행동 유도",
        heard: "-",
        felt: "구매 의향",
      },
    ];
  }

  // scene_count만 있고 scenes 배열이 없으면 균등 분할
  const sceneCount = structure.scene_count;
  const avgDuration = structure.avg_scene_duration || Math.round(durationSeconds / sceneCount);
  const scenes: SceneData[] = [];

  const defaultTypes = ["훅", "데모", "결과", "CTA"];

  for (let i = 0; i < sceneCount; i++) {
    const start = Math.round(i * avgDuration);
    const end = Math.min(Math.round((i + 1) * avgDuration), durationSeconds);
    scenes.push({
      timeRange: `${start}-${end}초`,
      type: defaultTypes[Math.min(i, defaultTypes.length - 1)],
      saw: "-",
      heard: "-",
      felt: "-",
    });
  }

  return scenes;
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function CustomerJourney({ analysisJson, durationSeconds }: CustomerJourneyProps) {
  const scenes = extractScenes(analysisJson, durationSeconds);

  if (scenes.length === 0) return null;

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#06b6d4" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold text-white"
          style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4" }}
        >
          1
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "#06b6d4" }}>
            고객 이해 — 이 영상을 본 고객은 이렇게 반응했어
          </div>
          <div className="text-xs text-gray-500">
            보고 → 듣고 → 생각하고 → 행동했다 (시간순)
          </div>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="space-y-0.5">
        {scenes.map((scene, idx) => {
          const sceneStyle = SCENE_COLORS[scene.type] ?? DEFAULT_SCENE_COLOR;

          return (
            <div
              key={idx}
              className="grid gap-0"
              style={{ gridTemplateColumns: "70px 1fr" }}
            >
              {/* 시간 */}
              <div
                className="text-center py-2.5 px-2 text-xs font-bold"
                style={{
                  color: sceneStyle.color,
                  borderRight: `2px solid ${sceneStyle.borderColor}`,
                }}
              >
                {scene.timeRange}
                <br />
                <span className="text-[10px] font-normal">{scene.type}</span>
              </div>

              {/* 콘텐츠 */}
              <div
                className="py-2 px-3 rounded-r-lg hover:bg-gray-50 transition-colors"
                style={{ background: sceneStyle.bg }}
              >
                {scene.saw !== "-" && (
                  <div className="flex gap-2 text-xs text-gray-600 mb-0.5">
                    <span className="text-center w-5 shrink-0">👁</span>
                    <span>
                      <strong>봤다:</strong> {scene.saw}
                    </span>
                  </div>
                )}
                {scene.heard !== "-" && (
                  <div className="flex gap-2 text-xs text-gray-600 mb-0.5">
                    <span className="text-center w-5 shrink-0">👂</span>
                    <span>
                      <strong>들었다:</strong> {scene.heard}
                    </span>
                  </div>
                )}
                {scene.felt !== "-" && (
                  <div className="flex gap-2 text-xs text-gray-600">
                    <span className="text-center w-5 shrink-0">🧠</span>
                    <span>
                      <strong>느꼈다:</strong> {scene.felt}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 고객 여정 요약 (ear_analysis) */}
      {analysisJson.ear_analysis && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-slate-200">
          <div className="text-xs font-bold text-gray-800 mb-1">📊 여정 병목 분석</div>
          <div className="text-xs text-gray-600 leading-relaxed">
            <strong>핵심 병목:</strong>{" "}
            {analysisJson.ear_analysis.primary_bottleneck === "foundation"
              ? "기반 (인지)"
              : analysisJson.ear_analysis.primary_bottleneck === "engagement"
                ? "참여"
                : "전환"}
            {" — "}
            {analysisJson.ear_analysis.bottleneck_detail}
          </div>
          {analysisJson.ear_analysis.improvement_priority && (
            <div className="text-xs text-gray-500 mt-1">
              개선 우선순위: {analysisJson.ear_analysis.improvement_priority}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
