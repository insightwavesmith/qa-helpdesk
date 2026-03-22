"use client";

import { useEffect, useRef, useCallback } from "react";

interface Fixation {
  x: number;
  y: number;
  weight: number;
  label: string;
}

interface EyeTrackingFrame {
  timestamp: number;
  fixations: Fixation[];
}

interface VideoHeatmapOverlayProps {
  eyeTracking: {
    frames: EyeTrackingFrame[];
  } | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  width?: number;
  height?: number;
}

export default function VideoHeatmapOverlay({
  eyeTracking,
  videoRef,
  width = 375,
  height = 667,
}: VideoHeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 현재 시간에 가장 가까운 프레임 찾기
  const findClosestFrame = useCallback(
    (currentTime: number): EyeTrackingFrame | null => {
      if (!eyeTracking?.frames?.length) return null;
      let closest = eyeTracking.frames[0];
      let minDiff = Math.abs(currentTime - closest.timestamp);
      for (const frame of eyeTracking.frames) {
        const diff = Math.abs(currentTime - frame.timestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closest = frame;
        }
      }
      return closest;
    },
    [eyeTracking]
  );

  // 구간별 색상: 0-3초 빨강(훅), 3-8초 파랑(제품), 8-15초 초록(CTA)
  const getColorForTimestamp = (timestamp: number): string => {
    if (timestamp < 3) return "rgba(239, 68, 68, 0.6)"; // 빨강
    if (timestamp < 8) return "rgba(59, 130, 246, 0.6)"; // 파랑
    return "rgba(34, 197, 94, 0.6)"; // 초록
  };

  // 가우시안 히트맵 원형 그리기
  const drawFixation = (
    ctx: CanvasRenderingContext2D,
    fixation: Fixation,
    color: string,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const x = fixation.x * canvasWidth;
    const y = fixation.y * canvasHeight;
    const radius = fixation.weight * 40 + 10;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 라벨
    ctx.font = "11px Pretendard, sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(fixation.label, x, y + radius + 14);
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !eyeTracking?.frames?.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleTimeUpdate = () => {
      const frame = findClosestFrame(video.currentTime);
      if (!frame) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const color = getColorForTimestamp(frame.timestamp);

      for (const fixation of frame.fixations) {
        drawFixation(ctx, fixation, color, canvas.width, canvas.height);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoRef, eyeTracking, findClosestFrame]);

  if (!eyeTracking?.frames?.length) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
