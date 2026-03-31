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
  const sceneJourney = analysisJson.scene_journey;

  // scene_journey도 scene_analysis도 없으면 렌더 안 함
  if (
    (!sceneAnalysis || !sceneAnalysis.scenes || sceneAnalysis.scenes.length === 0) &&
    (!sceneJourney || sceneJourney.length === 0)
  ) {
    return null;
  }

  // scene_journey 인덱스 맵 (time 기준으로 매칭)
  const journeyByTime = new Map(
    (sceneJourney ?? []).map((sj) => [sj.time, sj])
  );

  const scenes = sceneAnalysis?.scenes ?? [];

  // scene_journey만 있고 scene_analysis가 없는 경우
  const useJourneyOnly = scenes.length === 0 && sceneJourney && sceneJourney.length > 0;

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
        {useJourneyOnly
          ? /* scene_journey만 있는 경우 */
            sceneJourney!.map((sj, idx) => {
              const borderColor = SCENE_BORDER_COLORS[sj.type] ?? "#64748b";
              const { start } = parseSceneTime(sj.time);
              const frameUrl = findClosestFrame(saliencyFrames, start);

              // 처방 target에서 여정 단계 추출
              const stageKey = sj.prescription.target.includes("감각")
                ? "감각"
                : sj.prescription.target.includes("사고")
                  ? "사고"
                  : "행동";
              const stageBadge = STAGE_BADGES[stageKey];

              return (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-3"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                    <div>
                      {frameUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={frameUrl}
                          alt={`${sj.time} 시선`}
                          className="w-[100px] h-[178px] object-cover rounded-md"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-[100px] h-[178px] bg-slate-100 rounded-md flex flex-col items-center justify-center text-xs">
                          <span className="text-lg mb-1">👁</span>
                          <span style={{ color: "#94a3b8" }}>수집 중</span>
                        </div>
                      )}
                      <div className="text-[10px] font-semibold text-center mt-1" style={{ color: borderColor }}>
                        {sj.time} · {sj.type}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 leading-relaxed mb-2 space-y-0.5">
                        <div><strong>👁 봤다:</strong> {sj.watched}</div>
                        <div><strong>👂 들었다:</strong> {sj.heard}</div>
                        <div><strong>🧠 느꼈다:</strong> {sj.felt}</div>
                        <div>
                          <strong>📍 시선:</strong> {sj.gaze_point}
                          {sj.cognitive_load && (
                            <span> · 인지부하 {sj.cognitive_load}</span>
                          )}
                        </div>
                      </div>
                      {sj.subtitle_text && (
                        <div
                          className="text-[11px] text-gray-500 mb-2 px-2 py-1 rounded"
                          style={{ background: "#f8fafc" }}
                        >
                          📝 &quot;{sj.subtitle_text}&quot;
                          {sj.subtitle_position && (
                            <span> · {sj.subtitle_position}</span>
                          )}
                          {sj.subtitle_safety_zone !== undefined && (
                            <span>
                              {" · "}세이프티존 {sj.subtitle_safety_zone ? "✅" : "❌"}
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        className="text-[11px] p-2 rounded-md"
                        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
                      >
                        <span>💊 </span>
                        {stageBadge && (
                          <span
                            className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold mr-1"
                            style={{ background: stageBadge.bg, color: stageBadge.color }}
                          >
                            {stageBadge.icon} {stageKey}
                          </span>
                        )}
                        <span>{sj.prescription.action}</span>
                        <div className="text-[10px] text-gray-400 mt-0.5">근거: {sj.prescription.reasoning}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          : /* scene_analysis + scene_journey 병합 */
            scenes.map((scene, idx) => {
              const borderColor = SCENE_BORDER_COLORS[scene.type] ?? "#64748b";
              const { start } = parseSceneTime(scene.time);
              const frameUrl = findClosestFrame(saliencyFrames, start);

              // v3: scene_journey에서 매칭되는 데이터 병합
              const journey = journeyByTime.get(scene.time);

              const elements = scene.element_attention ?? [];
              const dominantRegion = scene.deepgaze.dominant_region;

              const improvementLevel = scene.type === "cta" || scene.type === "CTA" ? "필수" : "개선";
              const impStyle = IMPROVEMENT_STYLES[improvementLevel] ?? IMPROVEMENT_STYLES["개선"];

              // v3: journey의 prescription.target에서 여정 단계, fallback → 위치 기반 추정
              const stageKey = journey
                ? (journey.prescription.target.includes("감각")
                    ? "감각"
                    : journey.prescription.target.includes("사고")
                      ? "사고"
                      : "행동")
                : (idx === 0 ? "감각" : idx < scenes.length - 1 ? "사고" : "행동");
              const stageBadge = STAGE_BADGES[stageKey];

              return (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-3"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
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
                        <div className="w-[100px] h-[178px] bg-slate-100 rounded-md flex flex-col items-center justify-center text-xs">
                          <span className="text-lg mb-1">👁</span>
                          <span style={{ color: "#94a3b8" }}>수집 중</span>
                        </div>
                      )}
                      <div className="text-[10px] font-semibold text-center mt-1" style={{ color: borderColor }}>
                        {scene.time} · {scene.type}
                      </div>
                    </div>

                    <div>
                      {/* v3: scene_journey 데이터 우선, fallback → scene_analysis */}
                      <div className="text-xs text-gray-600 leading-relaxed mb-2 space-y-0.5">
                        <div>
                          <strong>👁 봤다:</strong> {journey?.watched ?? scene.desc}
                        </div>
                        {journey?.heard && (
                          <div>
                            <strong>👂 들었다:</strong> {journey.heard}
                          </div>
                        )}
                        <div>
                          <strong>🧠 느꼈다:</strong> {journey?.felt ?? scene.analysis.viewer_action ?? "-"}
                        </div>
                        <div>
                          <strong>📍 시선:</strong> {journey?.gaze_point ?? `${dominantRegion} 집중`}
                          {!journey && elements.length > 0 && (
                            <span>
                              {" · "}
                              {elements.map((e) => `${e.type} ${Math.round(e.attention_pct)}%`).join(", ")}
                            </span>
                          )}
                          {journey?.cognitive_load && (
                            <span> · 인지부하 {journey.cognitive_load}</span>
                          )}
                        </div>
                      </div>
                      {journey?.subtitle_text && (
                        <div
                          className="text-[11px] text-gray-500 mb-2 px-2 py-1 rounded"
                          style={{ background: "#f8fafc" }}
                        >
                          📝 &quot;{journey.subtitle_text}&quot;
                          {journey.subtitle_position && (
                            <span> · {journey.subtitle_position}</span>
                          )}
                          {journey.subtitle_safety_zone !== undefined && (
                            <span>
                              {" · "}세이프티존 {journey.subtitle_safety_zone ? "✅" : "❌"}
                            </span>
                          )}
                        </div>
                      )}

                      {/* v3: scene_journey 처방 우선, fallback → scene_analysis improvement */}
                      {journey ? (
                        <div
                          className="text-[11px] p-2 rounded-md"
                          style={{ background: impStyle.bg, border: `1px solid ${impStyle.border}` }}
                        >
                          <span>💊 </span>
                          {stageBadge && (
                            <span
                              className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold mr-1"
                              style={{ background: stageBadge.bg, color: stageBadge.color }}
                            >
                              {stageBadge.icon} {stageKey}
                            </span>
                          )}
                          <span>{journey.prescription.action}</span>
                          <div className="text-[10px] text-gray-400 mt-0.5">근거: {journey.prescription.reasoning}</div>
                        </div>
                      ) : scene.analysis.improvement ? (
                        <div
                          className="text-[11px] p-2 rounded-md"
                          style={{ background: impStyle.bg, border: `1px solid ${impStyle.border}` }}
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
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
