"use client";

import type { AnalysisJsonV3 } from "@/types/prescription";

// ── 씬별 시선 분석 + 처방 ────────────────────────────────────────
// 목업: 각 씬에 saliency 이미지 + 봤다/들었다/느꼈다/시선포인트/자막/개선안

interface SceneDetailAnalysisProps {
  analysisJson: AnalysisJsonV3;
  saliencyFrames: Array<{
    frame_index: number;
    timestamp_sec: number;
    attention_map_url: string;
    top_fixations: Array<{ x: number; y: number; ratio: number }>;
  }> | null;
}

// ── 씬 타입별 색상 ──────────────────────────────────────────────
const SCENE_BORDER_COLORS: Record<string, string> = {
  훅: "#ef4444",
  hook: "#ef4444",
  전환: "#ef4444",
  데모: "#3b82f6",
  demo: "#3b82f6",
  결과: "#3b82f6",
  result: "#3b82f6",
  브랜드: "#8b5cf6",
  brand: "#8b5cf6",
  CTA: "#10b981",
  cta: "#10b981",
  임상: "#10b981",
  팁: "#3b82f6",
  제형: "#3b82f6",
  유지: "#3b82f6",
};

// 개선 우선도 색상
const IMPROVEMENT_STYLES: Record<string, { bg: string; border: string; label: string; color: string }> = {
  필수: {
    bg: "rgba(239,68,68,0.06)",
    border: "rgba(239,68,68,0.2)",
    label: "필수",
    color: "#ef4444",
  },
  개선: {
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.2)",
    label: "개선",
    color: "#f59e0b",
  },
};

// 여정 단계 뱃지
const STAGE_BADGES: Record<string, { bg: string; color: string; icon: string }> = {
  감각: { bg: "rgba(6,182,212,0.15)", color: "#06b6d4", icon: "👁" },
  사고: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", icon: "🧠" },
  행동: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", icon: "🖱" },
};

function findClosestFrame(
  frames: SceneDetailAnalysisProps["saliencyFrames"],
  startSec: number,
): string | null {
  if (!frames || frames.length === 0) return null;
  let closest = frames[0];
  let minDiff = Math.abs(frames[0].timestamp_sec - startSec);
  for (const f of frames) {
    const diff = Math.abs(f.timestamp_sec - startSec);
    if (diff < minDiff) {
      minDiff = diff;
      closest = f;
    }
  }
  return closest.attention_map_url;
}

function parseSceneTime(time: string): { start: number; end: number } {
  const match = time.match(/(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)/);
  if (!match) return { start: 0, end: 0 };
  return { start: parseFloat(match[1]), end: parseFloat(match[2]) };
}

export function SceneDetailAnalysis({
  analysisJson,
  saliencyFrames,
}: SceneDetailAnalysisProps) {
  const sceneAnalysis = analysisJson.scene_analysis;
  if (!sceneAnalysis || !sceneAnalysis.scenes || sceneAnalysis.scenes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">👁</span>
        <div className="text-sm font-bold text-gray-800">씬별 시선 분석 + 처방</div>
      </div>
      <div className="text-[11px] text-gray-500 mb-3">
        AI가 영상을 씬 단위로 분할 → 각 씬별 시선 분포 + 고객 반응 + 개선안 자동 생성
      </div>

      {/* 씬 카드들 */}
      <div className="space-y-2">
        {sceneAnalysis.scenes.map((scene, idx) => {
          const borderColor = SCENE_BORDER_COLORS[scene.type] ?? "#64748b";
          const { start } = parseSceneTime(scene.time);
          const frameUrl = findClosestFrame(saliencyFrames, start);

          // element_attention에서 주요 요소 추출
          const elements = scene.element_attention ?? [];
          const dominantRegion = scene.deepgaze.dominant_region;

          // improvement 분류
          const improvementLevel =
            scene.type === "cta" || scene.type === "CTA" ? "필수" : "개선";
          const impStyle = IMPROVEMENT_STYLES[improvementLevel] ?? IMPROVEMENT_STYLES["개선"];

          // 여정 단계 추정
          const stageKey =
            idx === 0 ? "감각" : idx < sceneAnalysis.scenes.length - 1 ? "사고" : "행동";
          const stageBadge = STAGE_BADGES[stageKey];

          return (
            <div
              key={idx}
              className="bg-white rounded-lg p-3"
              style={{ borderLeft: `4px solid ${borderColor}` }}
            >
              <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                {/* 시선 프레임 이미지 */}
                <div>
                  {frameUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={frameUrl}
                      alt={`${scene.time} 시선`}
                      className="w-[100px] h-[178px] object-cover rounded-md"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-[100px] h-[178px] bg-slate-100 rounded-md flex items-center justify-center text-gray-300 text-xs">
                      프레임 없음
                    </div>
                  )}
                  <div
                    className="text-[10px] font-semibold text-center mt-1"
                    style={{ color: borderColor }}
                  >
                    {scene.time} · {scene.type}
                  </div>
                </div>

                {/* 분석 내용 */}
                <div>
                  {/* 봤다/들었다/느꼈다/시선 */}
                  <div className="text-xs text-gray-600 leading-relaxed mb-2 space-y-0.5">
                    <div>
                      <strong>👁:</strong> {scene.desc}
                    </div>
                    {scene.analysis.viewer_action && (
                      <div>
                        <strong>🧠:</strong> {scene.analysis.viewer_action}
                      </div>
                    )}
                    <div>
                      <strong>📍:</strong> {dominantRegion} 집중
                      {elements.length > 0 && (
                        <span>
                          {" · "}
                          {elements.map((e) => `${e.type} ${Math.round(e.attention_pct)}%`).join(", ")}
                        </span>
                      )}
                      {" · "}
                      인지부하{" "}
                      {scene.analysis.attention_quality === "high"
                        ? "low"
                        : scene.analysis.attention_quality === "low"
                          ? "high"
                          : "medium"}
                    </div>
                  </div>

                  {/* 개선안 */}
                  {scene.analysis.improvement && (
                    <div
                      className="text-[11px] p-2 rounded-md"
                      style={{
                        background: impStyle.bg,
                        border: `1px solid ${impStyle.border}`,
                      }}
                    >
                      <span>💊 </span>
                      <span className="font-bold" style={{ color: impStyle.color }}>
                        {impStyle.label}
                      </span>
                      {stageBadge && (
                        <span
                          className="inline-flex items-center ml-1 px-1 py-0.5 rounded text-[9px] font-semibold"
                          style={{ background: stageBadge.bg, color: stageBadge.color }}
                        >
                          {stageBadge.icon} {stageKey}
                        </span>
                      )}
                      <span className="ml-1">{" — "}</span>
                      <span>{scene.analysis.improvement}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
