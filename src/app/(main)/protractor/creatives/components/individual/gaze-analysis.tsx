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
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold" style={{ color }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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

  if (!saliency) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
        <div className="text-sm text-gray-500 text-center">시선 분석 데이터 없음</div>
      </div>
    );
  }

  const isVideo = mediaType === "VIDEO";
  const hasFrames = isVideo && saliencyFrames && saliencyFrames.length > 0;
  const currentFrame = hasFrames ? saliencyFrames[currentFrameIdx] : null;
  const heatmapUrl = currentFrame?.attention_map_url ?? saliency.attention_map_url;

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">👁</span>
        <div className="text-sm font-bold text-gray-800">시선 분석</div>
      </div>

      {/* 히트맵 오버레이 */}
      <div className="relative rounded-lg overflow-hidden bg-gray-100 mb-3">
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
              className="absolute rounded-full border-2 border-white"
              style={{
                left: `${fix.x * 100}%`,
                top: `${fix.y * 100}%`,
                width: `${Math.max(12, fix.ratio * 40)}px`,
                height: `${Math.max(12, fix.ratio * 40)}px`,
                background: `rgba(239,68,68,${Math.min(0.8, fix.ratio)})`,
                transform: "translate(-50%, -50%)",
              }}
            />
          )
        )}
      </div>

      {/* VIDEO 프레임 슬라이더 */}
      {hasFrames && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>프레임 {currentFrameIdx + 1} / {saliencyFrames.length}</span>
            <span>{currentFrame?.timestamp_sec.toFixed(1)}초</span>
          </div>
          <input
            type="range"
            min={0}
            max={saliencyFrames.length - 1}
            value={currentFrameIdx}
            onChange={(e) => setCurrentFrameIdx(Number(e.target.value))}
            className="w-full h-1.5 accent-[#F75D5D]"
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
