"use client";

import { useState } from "react";

// ── 타입 ──────────────────────────────────────────────────────────

interface SaliencyData {
  attention_map_url: string;
  top_fixations: Array<{ x: number; y: number; ratio: number }>;
  cta_attention_score: number;
  cognitive_load: number;
}

interface SaliencyFrame {
  frame_index: number;
  timestamp_sec: number;
  attention_map_url: string;
  top_fixations: Array<{ x: number; y: number; ratio: number }>;
}

interface GazeAnalysisProps {
  saliency: SaliencyData | null;
  saliencyFrames: SaliencyFrame[] | null;
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
}

// ── 게이지 바 ─────────────────────────────────────────────────────

function GaugeBar({
  label,
  value,
  color,
  maxValue = 1,
}: {
  label: string;
  value: number;
  color: string;
  maxValue?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span style={{ color: "#475569" }}>{label}</span>
        <span className="font-semibold" style={{ color }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#e2e8f0" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function GazeAnalysis({
  saliency,
  saliencyFrames,
  mediaType,
  mediaUrl,
}: GazeAnalysisProps) {
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  // saliency가 null인 경우 — "시선 데이터 수집 중" 상태
  if (!saliency) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(6,182,212,0.15)" }}
          >
            <span className="text-sm">👁</span>
          </div>
          <div className="text-sm font-bold" style={{ color: "#1e293b" }}>시선 분석</div>
        </div>

        {/* 수집 중 상태 표시 */}
        <div className="relative rounded-lg overflow-hidden mb-3" style={{ background: "#f1f5f9" }}>
          {mediaUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl}
              alt="소재 원본"
              className="w-full h-auto block"
              style={{ opacity: 0.4, filter: "grayscale(0.5)" }}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-40" />
          )}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(248,250,252,0.6)" }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
              style={{ background: "rgba(6,182,212,0.15)" }}
            >
              <span className="text-xl">👁</span>
            </div>
            <div className="text-sm font-semibold" style={{ color: "#475569" }}>
              시선 데이터 수집 중
            </div>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "4px" }}>
              DeepGaze 분석 완료 후 히트맵이 표시됩니다
            </div>
          </div>
        </div>

        {/* 빈 게이지 */}
        <div className="space-y-2.5">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "#475569" }}>CTA 주목도</span>
              <span style={{ color: "#cbd5e1" }}>—</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: "#e2e8f0" }} />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "#475569" }}>인지부하</span>
              <span style={{ color: "#cbd5e1" }}>—</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: "#e2e8f0" }} />
          </div>
        </div>
      </div>
    );
  }

  const isVideo = mediaType === "VIDEO";
  const hasFrames = isVideo && saliencyFrames && saliencyFrames.length > 0;
  const currentFrame = hasFrames ? saliencyFrames[currentFrameIdx] : null;
  const heatmapUrl = currentFrame?.attention_map_url ?? saliency.attention_map_url;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "rgba(6,182,212,0.15)" }}
        >
          <span className="text-sm">👁</span>
        </div>
        <div className="text-sm font-bold" style={{ color: "#1e293b" }}>시선 분석</div>
      </div>

      {/* 히트맵 오버레이 */}
      <div className="relative rounded-lg overflow-hidden mb-3" style={{ background: "#f1f5f9" }}>
        {/* 원본 이미지/썸네일 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="소재 원본"
          className="w-full h-auto block"
          loading="lazy"
        />
        {/* 히트맵 오버레이 */}
        {heatmapUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={heatmapUrl}
            alt="시선 히트맵"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.6 }}
            loading="lazy"
          />
        )}
        {/* 주시점 오버레이 */}
        {(currentFrame?.top_fixations ?? saliency.top_fixations).map(
          (fix, idx) => (
            <div
              key={idx}
              className="absolute rounded-full"
              style={{
                left: `${fix.x * 100}%`,
                top: `${fix.y * 100}%`,
                width: `${Math.max(12, fix.ratio * 40)}px`,
                height: `${Math.max(12, fix.ratio * 40)}px`,
                background: `rgba(239,68,68,${Math.min(0.8, fix.ratio)})`,
                border: "2px solid white",
                transform: "translate(-50%, -50%)",
              }}
            />
          )
        )}
        {/* 시선 추적 라벨 */}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded text-white"
          style={{ fontSize: "0.6rem", background: "rgba(0,0,0,0.6)" }}
        >
          🔴 시선 추적
        </div>
      </div>

      {/* VIDEO 프레임 슬라이더 */}
      {hasFrames && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1" style={{ fontSize: "0.72rem", color: "#64748b" }}>
            <span>프레임 {currentFrameIdx + 1} / {saliencyFrames.length}</span>
            <span>{currentFrame?.timestamp_sec.toFixed(1)}초</span>
          </div>
          <input
            type="range"
            min={0}
            max={saliencyFrames.length - 1}
            value={currentFrameIdx}
            onChange={(e) => setCurrentFrameIdx(Number(e.target.value))}
            className="w-full h-1.5"
            style={{ accentColor: "#F75D5D" }}
          />
        </div>
      )}

      {/* 지표 바 */}
      <div className="space-y-2.5">
        <GaugeBar
          label="CTA 주목도"
          value={saliency.cta_attention_score}
          color="#F75D5D"
        />
        <GaugeBar
          label="인지부하"
          value={saliency.cognitive_load}
          color={saliency.cognitive_load <= 0.4 ? "#10b981" : saliency.cognitive_load <= 0.6 ? "#f59e0b" : "#ef4444"}
        />
      </div>
    </div>
  );
}
