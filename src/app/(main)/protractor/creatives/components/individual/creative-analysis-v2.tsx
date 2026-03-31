"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  AnalysisJsonV3,
  SceneJourneyItem,
  CustomerJourneyDetail,
} from "@/types/prescription";

// ── 목업 CSS 재현 (hover, 반응형 등 인라인으로 불가능한 스타일) ────────
const MOCKUP_STYLES = `
  .cav2-journey-content:hover { background: rgba(99,102,241,.04) !important; }
  @media(max-width:768px) {
    .cav2-root { padding: 1rem !important; }
    .cav2-video-grid { grid-template-columns: 1fr !important; }
  }
  @keyframes cav2-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

// ── CSS 변수 (목업 :root 동일) ───────────────────────────────────────
const CSS_VARS: Record<string, string> = {
  "--bg": "#ffffff",
  "--bg2": "#f8fafc",
  "--bg3": "#e2e8f0",
  "--bd": "#e2e8f0",
  "--ac": "#F75D5D",
  "--ac2": "#E54949",
  "--t": "#1e293b",
  "--t2": "#475569",
  "--t3": "#64748b",
  "--g": "#10b981",
  "--a": "#f59e0b",
  "--r": "#ef4444",
  "--p": "#8b5cf6",
  "--cy": "#06b6d4",
  "--b": "#3b82f6",
};

// ── 타입 ─────────────────────────────────────────────────────────────

interface PerformanceData {
  impressions: number;
  reach: number;
  spend: number;
  ctr: number;
  cpc: number;
  roas: number;
  video_p3s_rate: number | null;
  video_thruplay_rate: number | null;
  purchase_count: number;
  reach_to_purchase_rate: number;
}

interface BenchmarkMetrics {
  [metric: string]: { p25: number; p50: number; p75: number };
}

interface SaliencyFrame {
  frame_index: number;
  timestamp_sec: number;
  attention_map_url: string;
  top_fixations: Array<{ x: number; y: number; ratio: number }>;
}

interface EyeFrame {
  t: number;
  fixes: Array<{ x: number; y: number; w: number; l: string }>;
}

interface TopCreativeData {
  id: string;
  media_url: string;
  ad_copy: string | null;
  roas: number;
  ctr: number;
  reach_to_purchase_rate: number;
}

export interface CreativeAnalysisV2Props {
  creative: {
    id: string;
    ad_id: string;
    media_type: "IMAGE" | "VIDEO";
    media_url: string;
    storage_url: string | null;
    thumbnail_url: string | null;
    ad_copy: string | null;
    duration_seconds: number | null;
    analysis_json: AnalysisJsonV3 | null;
  } | null;
  performance: PerformanceData | null;
  benchmarks: { category: string; metrics: BenchmarkMetrics } | null;
  saliencyFrames: SaliencyFrame[] | null;
  prescription: {
    top3_prescriptions?: Array<{
      rank: number;
      title: string;
      action: string;
      journey_stage: string;
      difficulty: "쉬움" | "보통" | "어려움";
    }>;
    customer_journey_summary?: {
      sensation: string;
      thinking: string;
      action_click: string;
      action_purchase: string;
    };
  } | null;
  topCreative: TopCreativeData | null;
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
}

// ── 유틸 ─────────────────────────────────────────────────────────────

function v(name: string): string {
  return `var(${name})`;
}

function pct(val: number | null | undefined, multiplier = 1): string {
  if (val == null) return "0%";
  return `${(val * multiplier).toFixed(2)}%`;
}

function rateColor(
  actual: number | null,
  benchmark: number | null,
): string {
  if (actual == null || benchmark == null) return v("--t3");
  return actual >= benchmark ? v("--g") : v("--r");
}

function rateEmoji(
  actual: number | null,
  benchmark: number | null,
): string {
  if (actual == null || benchmark == null) return "";
  return actual >= benchmark ? "🟢" : "🔴";
}

// ── 씬 색상 ──────────────────────────────────────────────────────────

const SCENE_COLOR_MAP: Record<
  string,
  { color: string; bg: string; borderColor: string }
> = {
  훅: { color: v("--r"), bg: "rgba(239,68,68,.04)", borderColor: v("--r") },
  hook: { color: v("--r"), bg: "rgba(239,68,68,.04)", borderColor: v("--r") },
  전환: { color: v("--r"), bg: "rgba(239,68,68,.04)", borderColor: v("--r") },
  데모: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
  demo: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
  결과: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
  result: {
    color: v("--b"),
    bg: "rgba(59,130,246,.04)",
    borderColor: v("--b"),
  },
  브랜드: {
    color: v("--p"),
    bg: "rgba(139,92,246,.04)",
    borderColor: v("--p"),
  },
  brand: {
    color: v("--p"),
    bg: "rgba(139,92,246,.04)",
    borderColor: v("--p"),
  },
  CTA: { color: v("--g"), bg: "rgba(16,185,129,.04)", borderColor: v("--g") },
  cta: { color: v("--g"), bg: "rgba(16,185,129,.04)", borderColor: v("--g") },
  임상: { color: v("--g"), bg: "rgba(16,185,129,.04)", borderColor: v("--g") },
  팁: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
  제형: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
  유지: { color: v("--b"), bg: "rgba(59,130,246,.04)", borderColor: v("--b") },
};

const DEFAULT_SC = {
  color: v("--t3"),
  bg: "rgba(100,116,139,.04)",
  borderColor: v("--bd"),
};

function sceneColor(type: string) {
  return SCENE_COLOR_MAP[type] ?? DEFAULT_SC;
}

// 씬 border 4px 색상 (scene detail)
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

// ── 감정 흐름 뱃지 색상 ──────────────────────────────────────────────

const FLOW_BADGE_COLORS: Array<{
  keyword: string;
  bg: string;
  color: string;
}> = [
  { keyword: "공감", bg: "rgba(239,68,68,.12)", color: "#fca5a5" },
  { keyword: "문제", bg: "rgba(239,68,68,.12)", color: "#fca5a5" },
  { keyword: "신뢰", bg: "rgba(139,92,246,.12)", color: "#c4b5fd" },
  { keyword: "권위", bg: "rgba(139,92,246,.12)", color: "#c4b5fd" },
  { keyword: "감탄", bg: "rgba(59,130,246,.12)", color: "#93c5fd" },
  { keyword: "물광", bg: "rgba(59,130,246,.12)", color: "#93c5fd" },
  { keyword: "유익", bg: "rgba(16,185,129,.12)", color: "#6ee7b7" },
  { keyword: "꿀팁", bg: "rgba(16,185,129,.12)", color: "#6ee7b7" },
  { keyword: "제안", bg: "rgba(245,158,11,.12)", color: "#fde68a" },
  { keyword: "할인", bg: "rgba(245,158,11,.12)", color: "#fde68a" },
  { keyword: "기대", bg: "rgba(59,130,246,.12)", color: "#93c5fd" },
  { keyword: "만족", bg: "rgba(16,185,129,.12)", color: "#6ee7b7" },
];

function badgeColor(text: string) {
  for (const item of FLOW_BADGE_COLORS) {
    if (text.includes(item.keyword)) return item;
  }
  return { bg: "rgba(100,116,139,.12)", color: "#94a3b8" };
}

// 개선 우선도 뱃지
const IMP_STYLES: Record<
  string,
  { bg: string; border: string; label: string; color: string }
> = {
  필수: {
    bg: "rgba(239,68,68,.06)",
    border: "rgba(239,68,68,.2)",
    label: "필수",
    color: "#ef4444",
  },
  개선: {
    bg: "rgba(245,158,11,.06)",
    border: "rgba(245,158,11,.2)",
    label: "개선",
    color: "#f59e0b",
  },
};

// 여정 단계 뱃지
const STAGE_BADGE: Record<
  string,
  { bg: string; color: string; icon: string }
> = {
  감각: { bg: "rgba(6,182,212,.15)", color: "#06b6d4", icon: "👁" },
  사고: { bg: "rgba(139,92,246,.15)", color: "#8b5cf6", icon: "🧠" },
  행동: { bg: "rgba(245,158,11,.15)", color: "#f59e0b", icon: "🖱" },
  "행동(클릭)": {
    bg: "rgba(245,158,11,.15)",
    color: "#f59e0b",
    icon: "🖱",
  },
  "행동(구매)": {
    bg: "rgba(239,68,68,.15)",
    color: "#ef4444",
    icon: "💳",
  },
};

// Top3 rank 스타일
const RANK_STYLES = [
  { bg: "rgba(239,68,68,.15)", color: "#ef4444" },
  { bg: "rgba(245,158,11,.15)", color: "#f59e0b" },
  { bg: "rgba(59,130,246,.15)", color: "#3b82f6" },
];

const DIFFICULTY_BADGE: Record<string, { bg: string; color: string }> = {
  쉬움: { bg: "rgba(16,185,129,.12)", color: "#10b981" },
  보통: { bg: "rgba(245,158,11,.12)", color: "#f59e0b" },
  어려움: { bg: "rgba(239,68,68,.12)", color: "#ef4444" },
};

// ── 3축 벤치마크 비교 데이터 추출 ──────────────────────────────────────

interface AxisDetail {
  label: string;
  actual: string;
  benchmark: string;
  good: boolean;
}

interface AxisCard {
  key: string;
  label: string;
  subLabel: string;
  color: string;
  score: number;
  primaryLabel: string;
  primaryActual: string;
  emoji: string;
  good: boolean;
  details: AxisDetail[];
}

function buildAxes(
  perf: PerformanceData | null,
  bm: BenchmarkMetrics | null,
): AxisCard[] {
  if (!perf) {
    return [
      {
        key: "foundation",
        label: "기반",
        subLabel: "보긴 하나?",
        color: "#10b981",
        score: 0,
        primaryLabel: "3초시청률",
        primaryActual: "데이터 없음",
        emoji: "🟢",
        good: false,
        details: [],
      },
      {
        key: "engagement",
        label: "참여",
        subLabel: "관심 갖나?",
        color: "#f59e0b",
        score: 0,
        primaryLabel: "참여",
        primaryActual: "데이터 없음",
        emoji: "🟡",
        good: false,
        details: [],
      },
      {
        key: "conversion",
        label: "전환",
        subLabel: "돈이 되나?",
        color: "#ef4444",
        score: 0,
        primaryLabel: "구매전환율",
        primaryActual: "데이터 없음",
        emoji: "🔴",
        good: false,
        details: [],
      },
    ];
  }

  const getBm = (key: string) => bm?.[key]?.p50 ?? null;

  // 기반 축
  const p3s = perf.video_p3s_rate;
  const thru = perf.video_thruplay_rate;
  const p3sBm = getBm("video_p3s_rate");
  const thruBm = getBm("video_thruplay_rate");

  const foundationScore = (() => {
    const val = p3s ?? perf.ctr;
    const bench = p3sBm ?? getBm("ctr") ?? 0.3;
    if (!bench) return 50;
    return Math.min(100, Math.round((val / bench) * 50));
  })();

  const foundationDetails: AxisDetail[] = [];
  if (p3s != null) {
    foundationDetails.push({
      label: "3초시청률",
      actual: pct(p3s),
      benchmark: p3sBm != null ? pct(p3sBm) : "-",
      good: p3sBm != null ? p3s >= p3sBm : true,
    });
  }
  if (thru != null) {
    foundationDetails.push({
      label: "ThruPlay율",
      actual: pct(thru),
      benchmark: thruBm != null ? pct(thruBm) : "-",
      good: thruBm != null ? thru >= thruBm : true,
    });
  }

  // 참여 축 (engagement)
  const engScore = 38; // placeholder — would calculate from actual engagement data
  const engDetails: AxisDetail[] = [];

  // 전환 축
  const ctr = perf.ctr;
  const ctrBm = getBm("ctr");
  const rtp = perf.reach_to_purchase_rate;
  const rtpBm = getBm("reach_to_purchase_rate");

  const convScore = (() => {
    if (!rtpBm) return Math.min(100, Math.round(rtp * 100 * 10));
    return Math.min(100, Math.round((rtp / rtpBm) * 50));
  })();

  const convDetails: AxisDetail[] = [
    {
      label: "CTR",
      actual: pct(ctr),
      benchmark: ctrBm != null ? pct(ctrBm) : "-",
      good: ctrBm != null ? ctr >= ctrBm : true,
    },
    {
      label: "구매전환율",
      actual: pct(rtp),
      benchmark: rtpBm != null ? pct(rtpBm) : "-",
      good: rtpBm != null ? rtp >= rtpBm : false,
    },
    {
      label: "노출당구매확률",
      actual: pct(rtp),
      benchmark: rtpBm != null ? pct(rtpBm) : "-",
      good: rtpBm != null ? rtp >= rtpBm : false,
    },
    {
      label: "ROAS",
      actual: perf.roas.toFixed(2),
      benchmark: "",
      good: perf.roas > 0,
    },
  ];

  return [
    {
      key: "foundation",
      label: "기반",
      subLabel: "보긴 하나?",
      color: "#10b981",
      score: foundationScore,
      primaryLabel: "3초시청률",
      primaryActual:
        p3s != null ? `${p3s.toFixed(2)}%` : "데이터 없음",
      emoji: "🟢",
      good: foundationScore >= 50,
      details: foundationDetails,
    },
    {
      key: "engagement",
      label: "참여",
      subLabel: "관심 갖나?",
      color: "#f59e0b",
      score: engScore,
      primaryLabel: "참여",
      primaryActual: "데이터 없음",
      emoji: "🟡",
      good: engScore >= 50,
      details: engDetails,
    },
    {
      key: "conversion",
      label: "전환",
      subLabel: "돈이 되나?",
      color: "#ef4444",
      score: convScore,
      primaryLabel: "구매전환율",
      primaryActual: pct(rtp),
      emoji: "🔴",
      good: convScore >= 50,
      details: convDetails,
    },
  ];
}

// ── 시선 데이터 → eyeData 변환 ──────────────────────────────────────

function buildEyeData(frames: SaliencyFrame[] | null): EyeFrame[] {
  if (!frames || frames.length === 0) return [];
  return frames.map((f) => ({
    t: Math.floor(f.timestamp_sec),
    fixes: f.top_fixations.map((fix) => ({
      x: fix.x,
      y: fix.y,
      w: fix.ratio,
      l: "",
    })),
  }));
}

// ── saliency 프레임 URL 찾기 ────────────────────────────────────────

function findClosestFrame(
  frames: SaliencyFrame[] | null,
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

// ═══════════════════════════════════════════════════════════════════
//  메인 컴포넌트
// ═══════════════════════════════════════════════════════════════════

export function CreativeAnalysisV2({
  creative,
  performance,
  benchmarks,
  saliencyFrames,
  prescription,
  topCreative,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}: CreativeAnalysisV2Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analysisJson = creative?.analysis_json ?? null;
  const sceneJourney = analysisJson?.scene_journey ?? [];
  const adAxis = analysisJson?.ad_axis ?? null;
  const audioDetail = analysisJson?.audio_analysis_detail ?? null;
  const audioBasic = analysisJson?.audio ?? null;
  const journeyDetail = analysisJson?.customer_journey_detail ?? null;
  const journeySummary =
    prescription?.customer_journey_summary ??
    analysisJson?.customer_journey_summary ??
    null;
  const top3 =
    prescription?.top3_prescriptions ??
    analysisJson?.top3_prescriptions ??
    null;

  const rawMediaUrl =
    creative?.storage_url ?? creative?.media_url ?? "";
  // gs:// → public HTTPS URL 변환
  const mediaUrl = rawMediaUrl.startsWith("gs://")
    ? rawMediaUrl.replace("gs://", "https://storage.googleapis.com/")
    : rawMediaUrl;
  const isVideo = creative?.media_type === "VIDEO";
  const durationSec = creative?.duration_seconds ?? 0;

  const axes = buildAxes(performance, benchmarks?.metrics ?? null);
  const eyeData = buildEyeData(saliencyFrames);

  // ── 히트맵 그리기 ────────────────────────────────────────────────

  const drawHeat = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || eyeData.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      let frame = eyeData[0];
      for (const f of eyeData) {
        if (f.t <= t) frame = f;
      }

      const fix = frame.fixes[0];
      if (!fix) return;
      const px = fix.x * W;
      const py = fix.y * H;

      const r = 40;
      const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 2.5);
      grd.addColorStop(0, "rgba(239,68,68,.85)");
      grd.addColorStop(0.25, "rgba(239,68,68,.25)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239,68,68,.85)";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    },
    [eyeData],
  );

  // ── 비디오 동기화 ────────────────────────────────────────────────

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const handleTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      drawHeat(vid.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(vid.duration);
    };

    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [drawHeat]);

  // 초기 히트맵 그리기
  useEffect(() => {
    drawHeat(0);
  }, [drawHeat]);

  // ── 현재 씬 인덱스 계산 ─────────────────────────────────────────

  const currentSceneIdx = (() => {
    for (let i = 0; i < sceneJourney.length; i++) {
      const { start, end } = parseSceneTime(sceneJourney[i].time);
      if (currentTime >= start && currentTime <= end) return i;
    }
    return -1;
  })();

  // ── 이탈 곡선 마커 X 위치 ──────────────────────────────────────

  const retentionMarkerX =
    duration > 0 ? Math.min((currentTime / duration) * 200, 200) : 0;

  // ═══════════════════════════════════════════════════════════════
  //  렌더
  // ═══════════════════════════════════════════════════════════════

  return (
    <>
      {/* 목업 CSS 재현 (hover, 반응형, 애니메이션) */}
      <style dangerouslySetInnerHTML={{ __html: MOCKUP_STYLES }} />
      <div
        className="cav2-root"
        style={{
          ...CSS_VARS,
          maxWidth: 1200,
          margin: "0 auto",
          fontFamily:
            "'Pretendard Variable', -apple-system, BlinkMacSystemFont, sans-serif",
          color: v("--t"),
          lineHeight: 1.7,
          fontSize: "14px",
          padding: "2rem",
        } as React.CSSProperties}
      >
      {/* ═══ 소재 네비게이션 ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 12,
          marginBottom: "1rem",
          background: v("--bg2"),
          borderRadius: 10,
          border: `1px solid ${v("--bd")}`,
        }}
      >
        <button
          onClick={onPrev}
          style={{
            background: "none",
            border: `1px solid ${v("--bd")}`,
            color: v("--t"),
            width: 36,
            height: 36,
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &lt;
        </button>
        <span style={{ fontSize: ".9rem", fontWeight: 700, color: v("--t") }}>
          {currentIndex + 1} / {totalCount}
        </span>
        <button
          onClick={onNext}
          style={{
            background: "none",
            border: `1px solid ${v("--bd")}`,
            color: v("--t"),
            width: 36,
            height: 36,
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &gt;
        </button>
      </div>

      {/* ═══ 헤더 ═══ */}
      <div
        style={{
          textAlign: "center",
          padding: "2rem",
          borderRadius: 14,
          border: `1px solid ${v("--bd")}`,
          marginBottom: "2rem",
          background:
            "linear-gradient(135deg, #fef2f2, #fdf2f8, var(--bg2))",
        }}
      >
        <h1
          style={{
            fontSize: "1.6rem",
            background: `linear-gradient(135deg, ${v("--ac")}, ${v("--p")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontWeight: 800,
          }}
        >
          🎬{" "}
          {creative?.ad_copy
            ? `${creative.ad_copy.slice(0, 30)} — 고객 여정 분석`
            : "소재 분석 — 고객 여정 뷰"}
        </h1>
        <div
          style={{
            color: v("--t3"),
            fontSize: ".82rem",
            marginTop: ".4rem",
          }}
        >
          &ldquo;모든 숫자는 고객이 만든다. 보고, 듣고, 생각하고, 행동한 것의
          합.&rdquo;
        </div>
        <div
          style={{
            color: v("--t3"),
            fontSize: ".72rem",
            marginTop: ".3rem",
          }}
        >
          {durationSec > 0 && `${durationSec}초`}
          {creative?.ad_id && ` · ad_id: ${creative.ad_id}`}
          {performance ? " · 실제 데이터 기반" : " · 데이터 없음"}
        </div>
      </div>

      {/* ═══ 성과 카드 ═══ */}
      <Section borderColor={v("--r")}>
        <StepHeader
          emoji="📊"
          title="성과 — 이 광고는 지금 이 정도야"
          subtitle="벤치마크 대비 어디가 부족한지"
          color={v("--r")}
          numBg="rgba(239,68,68,.15)"
        />

        {/* 3축 카드 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: ".4rem",
          }}
        >
          {axes.map((ax) => (
            <div
              key={ax.key}
              style={{
                background: v("--bg"),
                borderRadius: 10,
                padding: "1rem",
                textAlign: "center",
                borderTop: `3px solid ${ax.color}`,
              }}
            >
              <div style={{ fontSize: ".7rem", color: v("--t3") }}>
                {ax.emoji} {ax.label} ({ax.subLabel})
              </div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  color: ax.good ? ax.color : "#ef4444",
                }}
              >
                {ax.score}
              </div>
              <div style={{ fontSize: ".72rem", color: v("--t2") }}>
                {ax.primaryLabel} {ax.primaryActual}{" "}
                <span style={{ color: ax.good ? "#10b981" : "#ef4444" }}>
                  {ax.good ? "🟢" : "🔴"}
                </span>
              </div>
              {/* 프로그레스 바 */}
              <div
                style={{
                  background: v("--bg3"),
                  height: 5,
                  borderRadius: 3,
                  marginTop: 6,
                }}
              >
                <div
                  style={{
                    background: ax.good ? ax.color : "#ef4444",
                    width: `${ax.score}%`,
                    height: "100%",
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 세부항목 토글 */}
        <div style={{ textAlign: "center", marginBottom: ".8rem" }}>
          <button
            onClick={() => setShowDetail(!showDetail)}
            style={{
              background: v("--bg"),
              border: `1px solid ${v("--bd")}`,
              color: v("--t3"),
              padding: "6px 16px",
              borderRadius: 8,
              fontSize: ".75rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {showDetail ? "▴ 세부항목 접기" : "▾ 세부항목 보기"}
          </button>
        </div>

        {/* 세부항목 */}
        {showDetail && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            {axes.map((ax) => (
              <div
                key={ax.key}
                style={{
                  background: v("--bg"),
                  borderRadius: 8,
                  padding: 10,
                  border: `1px solid ${ax.color}33`,
                }}
              >
                <div
                  style={{
                    fontSize: ".72rem",
                    fontWeight: 700,
                    color: ax.color,
                    marginBottom: 6,
                  }}
                >
                  {ax.emoji} {ax.label}
                </div>
                {ax.details.length === 0 ? (
                  <div style={{ fontSize: ".7rem", color: v("--t3") }}>
                    데이터 없음
                  </div>
                ) : (
                  <div style={{ fontSize: ".7rem", color: v("--t2"), lineHeight: 2 }}>
                    {ax.details.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        {d.label}
                        <span>
                          {d.actual} / {d.benchmark}{" "}
                          <span
                            style={{ color: d.good ? "#10b981" : "#ef4444" }}
                          >
                            {d.good ? "🟢" : "🔴"}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ═══ 광고축 ═══ */}
      <Section borderColor={v("--ac")}>
        <StepHeader
          emoji="📋"
          title="광고축 — 네가 만든 콘텐츠는 이런 거야"
          subtitle="5축 분석 기반 카테고리 분류"
          color={v("--ac2")}
          numBg="rgba(99,102,241,.15)"
        />

        {adAxis ? (
          <>
            {/* 태그 칩 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: "1rem",
              }}
            >
              <TagChip
                bg="rgba(239,68,68,.12)"
                color="#ef4444"
                border="rgba(239,68,68,.3)"
              >
                🎬 {adAxis.format}
              </TagChip>
              <TagChip
                bg="rgba(99,102,241,.12)"
                color="#E54949"
                border="rgba(99,102,241,.3)"
              >
                🪝 훅: {adAxis.hook_type}
              </TagChip>
              <TagChip
                bg="rgba(139,92,246,.12)"
                color="#8b5cf6"
                border="rgba(139,92,246,.3)"
              >
                💬 메시징: {adAxis.messaging_strategy}
              </TagChip>
              <TagChip
                bg="rgba(6,182,212,.12)"
                color="#06b6d4"
                border="rgba(6,182,212,.3)"
              >
                👤 타겟: {adAxis.target_persona}
              </TagChip>
              <TagChip
                bg="rgba(245,158,11,.12)"
                color="#f59e0b"
                border="rgba(245,158,11,.3)"
              >
                🏷️ {adAxis.category.join(" · ")}
              </TagChip>
            </div>

            {/* 4컬럼 그리드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {[
                { label: "포맷", value: `세로 영상 ${durationSec}초` },
                { label: "구조", value: adAxis.structure },
                { label: "설득 전략", value: adAxis.persuasion },
                { label: "오퍼", value: adAxis.offer },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: v("--bg"),
                    borderRadius: 8,
                    padding: ".8rem",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: ".7rem", color: v("--t3") }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: ".85rem", fontWeight: 700 }}>
                    {item.value || "데이터 없음"}
                  </div>
                </div>
              ))}
            </div>

            {/* Andromeda + PDA */}
            <div
              style={{
                marginTop: ".8rem",
                fontSize: ".75rem",
                color: v("--t3"),
              }}
            >
              Andromeda:{" "}
              <span style={{ color: v("--ac2") }}>
                {adAxis.andromeda_code || "-"}
              </span>{" "}
              · P.D.A:{" "}
              <span style={{ color: v("--a") }}>
                {adAxis.pda_code || "-"}
              </span>
            </div>
          </>
        ) : (
          <NoData />
        )}
      </Section>

      {/* ═══ Step 1: 고객 이해 ═══ */}
      {isVideo && (
        <Section borderColor={v("--cy")}>
          <StepHeader
            emoji="1"
            emojiIsNum
            title="고객 이해 — 이 영상을 본 고객은 이렇게 반응했어"
            subtitle="보고 → 듣고 → 생각하고 → 행동했다 (시간순)"
            color={v("--cy")}
            numBg="rgba(6,182,212,.15)"
          />

          {/* 영상 + 타임라인 그리드 */}
          <div
            className="cav2-video-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "210px 1fr",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* 좌측: 영상 + 히트맵 + 이탈 곡선 */}
            <div>
              {/* 영상 + 캔버스 오버레이 */}
              <div style={{ position: "relative", width: 200 }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  ref={videoRef}
                  style={{
                    width: 200,
                    borderRadius: 10,
                    display: "block",
                  }}
                  controls
                  preload="metadata"
                  src={mediaUrl}
                />
                <canvas
                  ref={canvasRef}
                  width={200}
                  height={356}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 200,
                    height: 356,
                    borderRadius: 10,
                    pointerEvents: "none",
                  }}
                />
                {/* 시간 오버레이 */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    background: "rgba(0,0,0,.7)",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: ".75rem",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    pointerEvents: "none",
                  }}
                >
                  {String(Math.floor(currentTime)).padStart(2, "0")}초
                </div>
                {/* 시선 추적 라벨 */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontSize: ".55rem",
                    color: "rgba(255,255,255,.5)",
                    pointerEvents: "none",
                  }}
                >
                  🔴 시선 추적
                </div>
              </div>
              <div
                style={{
                  fontSize: ".65rem",
                  color: v("--t3"),
                  marginTop: ".3rem",
                  textAlign: "center",
                }}
              >
                영상 재생 → 히트맵 + 타임라인 실시간 동기화
              </div>

              {/* 이탈 곡선 (SVG) */}
              <RetentionCurve markerX={retentionMarkerX} />
            </div>

            {/* 우측: 고객 여정 타임라인 */}
            <div
              style={{ maxHeight: 420, overflowY: "auto" }}
            >
              {sceneJourney.length > 0 ? (
                sceneJourney.map((scene, idx) => (
                  <JourneyRow
                    key={idx}
                    scene={scene}
                    isActive={currentSceneIdx === idx}
                  />
                ))
              ) : (
                <NoData />
              )}
            </div>
          </div>

          {/* 고객 여정 요약 */}
          <JourneySummarySection
            summary={journeySummary}
            detail={journeyDetail}
          />

          {/* 씬별 시선 분석 + 처방 */}
          <SceneDetailSection
            scenes={sceneJourney}
            saliencyFrames={saliencyFrames}
          />
        </Section>
      )}

      {/* ═══ 오디오 분석 ═══ */}
      {isVideo && (audioDetail || audioBasic) && (
        <Section borderColor={v("--p")}>
          <h2
            style={{
              color: v("--ac2"),
              fontSize: "1.15rem",
              fontWeight: 700,
              marginBottom: ".8rem",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🔊 오디오 분석
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                background: v("--bg"),
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: ".72rem",
                  color: v("--t3"),
                  marginBottom: ".3rem",
                }}
              >
                나레이션 톤
              </div>
              <div style={{ fontSize: ".82rem" }}>
                {audioDetail?.narration_tone ?? "데이터 없음"}
              </div>
              <div
                style={{
                  fontSize: ".72rem",
                  color: v("--t3"),
                  marginTop: ".5rem",
                }}
              >
                BGM
              </div>
              <div style={{ fontSize: ".82rem" }}>
                {audioDetail?.bgm_genre ?? "데이터 없음"}
              </div>
            </div>

            <div
              style={{
                background: v("--bg"),
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: ".72rem",
                  color: v("--t3"),
                  marginBottom: ".3rem",
                }}
              >
                감정 흐름
              </div>
              {audioDetail?.emotion_flow ? (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    fontSize: ".72rem",
                    flexWrap: "wrap",
                    marginTop: ".3rem",
                  }}
                >
                  {audioDetail.emotion_flow
                    .split("→")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((step, idx, arr) => (
                      <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span
                          style={{
                            background: badgeColor(step).bg,
                            padding: "3px 8px",
                            borderRadius: 10,
                            color: badgeColor(step).color,
                          }}
                        >
                          {step}
                        </span>
                        {idx < arr.length - 1 && (
                          <span style={{ color: v("--t3") }}>→</span>
                        )}
                      </span>
                    ))}
                </div>
              ) : (
                <div style={{ fontSize: ".82rem", color: v("--t3") }}>
                  데이터 없음
                </div>
              )}
            </div>
          </div>

          {/* 사운드 오프 개선 팁 */}
          <div
            style={{
              fontSize: ".72rem",
              padding: 8,
              background: v("--bg"),
              borderRadius: 6,
              borderLeft: `3px solid ${v("--a")}`,
            }}
          >
            💊{" "}
            <strong style={{ color: v("--a") }}>개선:</strong> 사운드
            오프에서도 핵심 키워드 자막 가독성 높이기 + CTA 구간 진입 시 효과음으로
            시청자 주의 환기 → 클릭 유도
          </div>
        </Section>
      )}

      {/* ═══ 개선 우선순위 Top 3 ═══ */}
      <Section
        borderColor={v("--a")}
        extraStyle={{
          border: "2px solid rgba(245,158,11,.4)",
          borderLeft: `4px solid ${v("--a")}`,
        }}
      >
        <h2
          style={{
            color: v("--a"),
            fontSize: "1.15rem",
            fontWeight: 700,
            marginBottom: ".8rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🏆 개선 우선순위 Top 3
        </h2>

        {top3 && top3.length > 0 ? (
          top3.slice(0, 3).map((rx, idx) => {
            const rs = RANK_STYLES[idx] ?? RANK_STYLES[2];
            const diff = DIFFICULTY_BADGE[rx.difficulty] ?? DIFFICULTY_BADGE["보통"];
            const stage =
              STAGE_BADGE[rx.journey_stage] ?? STAGE_BADGE["감각"];
            return (
              <div
                key={idx}
                style={{
                  background: v("--bg"),
                  borderRadius: 10,
                  padding: "1rem",
                  marginBottom: 8,
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: rs.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: rs.color,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: ".88rem",
                      fontWeight: 700,
                      color: v("--t"),
                    }}
                  >
                    {rx.title}
                  </div>
                  <div
                    style={{
                      fontSize: ".75rem",
                      color: v("--t2"),
                      marginTop: ".2rem",
                    }}
                  >
                    {rx.action}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: ".4rem",
                    }}
                  >
                    {stage && (
                      <span
                        style={{
                          fontSize: ".6rem",
                          background: stage.bg,
                          color: stage.color,
                          padding: "2px 6px",
                          borderRadius: 8,
                        }}
                      >
                        {stage.icon} {rx.journey_stage}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: ".6rem",
                        background: diff.bg,
                        color: diff.color,
                        padding: "2px 6px",
                        borderRadius: 8,
                      }}
                    >
                      난이도: {rx.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <NoData />
        )}
      </Section>

      {/* ═══ 성과 비교 (접기) ═══ */}
      {(topCreative || performance) && (
        <details
          style={{ marginBottom: ".8rem" }}
        >
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: v("--bg"),
              borderRadius: 8,
              padding: ".7rem 1rem",
              border: `1px solid ${v("--bd")}`,
              fontWeight: 600,
              color: v("--t"),
              fontSize: ".85rem",
            }}
          >
            📈 같은 계정 성과 좋은 소재와 비교
          </summary>
          <div
            style={{
              background: v("--bg"),
              borderRadius: "0 0 8px 8px",
              padding: "1rem",
              border: `1px solid ${v("--bd")}`,
              borderTop: "none",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: v("--bg2"),
                  borderRadius: 8,
                  padding: "1rem",
                  borderTop: `3px solid ${v("--t3")}`,
                }}
              >
                <div
                  style={{
                    fontSize: ".75rem",
                    color: v("--t3"),
                    marginBottom: ".3rem",
                  }}
                >
                  이 소재
                </div>
                <div style={{ fontSize: ".82rem" }}>
                  CTR{" "}
                  <strong>
                    {performance ? pct(performance.ctr) : "데이터 없음"}
                  </strong>{" "}
                  · 3초{" "}
                  <strong>
                    {performance?.video_p3s_rate != null
                      ? pct(performance.video_p3s_rate)
                      : "-"}
                  </strong>{" "}
                  · ROAS{" "}
                  <strong>{performance?.roas?.toFixed(2) ?? "-"}</strong>
                </div>
              </div>
              <div
                style={{
                  background: v("--bg2"),
                  borderRadius: 8,
                  padding: "1rem",
                  borderTop: `3px solid #10b981`,
                }}
              >
                <div
                  style={{
                    fontSize: ".75rem",
                    color: "#10b981",
                    marginBottom: ".3rem",
                  }}
                >
                  ✅ 같은 계정 Top
                </div>
                <div style={{ fontSize: ".82rem" }}>
                  {topCreative ? (
                    <>
                      CTR{" "}
                      <strong style={{ color: "#10b981" }}>
                        {pct(topCreative.ctr)}
                      </strong>{" "}
                      · ROAS{" "}
                      <strong style={{ color: "#10b981" }}>
                        {topCreative.roas.toFixed(2)}
                      </strong>
                    </>
                  ) : (
                    "데이터 없음"
                  )}
                </div>
              </div>
            </div>
            {topCreative && (
              <div
                style={{
                  marginTop: ".8rem",
                  fontSize: ".78rem",
                  color: v("--t2"),
                }}
              >
                <strong>차이점:</strong> Top 소재와 비교하여 개선 포인트를
                참고하세요.
              </div>
            )}
          </div>
        </details>
      )}

      {/* ═══ 푸터 ═══ */}
      <div
        style={{
          textAlign: "center",
          padding: "1.5rem",
          color: v("--t3"),
          fontSize: ".75rem",
          marginTop: "1rem",
        }}
      >
        🍡 AI 자동 생성 처방 (시선 예측 + 5축 분석 + 처방 가이드 합산)
        <br />
        &ldquo;모든 숫자는 고객이 만든다&rdquo;
      </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  하위 컴포넌트
// ═══════════════════════════════════════════════════════════════════

// ── 섹션 래퍼 ────────────────────────────────────────────────────────

function Section({
  borderColor,
  children,
  extraStyle,
}: {
  borderColor: string;
  children: React.ReactNode;
  extraStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: v("--bg2"),
        borderRadius: 12,
        padding: "1.5rem",
        marginBottom: "1.2rem",
        border: `1px solid ${v("--bd")}`,
        borderLeft: `4px solid ${borderColor}`,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ── 스텝 헤더 ────────────────────────────────────────────────────────

function StepHeader({
  emoji,
  emojiIsNum,
  title,
  subtitle,
  color,
  numBg,
}: {
  emoji: string;
  emojiIsNum?: boolean;
  title: string;
  subtitle: string;
  color: string;
  numBg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: "1.2rem",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: emojiIsNum ? "1rem" : "1rem",
          fontWeight: 800,
          background: numBg,
          color,
        }}
      >
        {emoji}
      </div>
      <div>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, color }}>
          {title}
        </div>
        <div style={{ fontSize: ".78rem", color: v("--t3") }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

// ── 태그 칩 ──────────────────────────────────────────────────────────

function TagChip({
  bg,
  color,
  border,
  children,
}: {
  bg: string;
  color: string;
  border: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        borderRadius: 16,
        fontSize: ".7rem",
        fontWeight: 600,
        margin: 2,
        background: bg,
        color,
        border: `1px solid ${border}`,
      }}
    >
      {children}
    </span>
  );
}

// ── "데이터 없음" 플레이스홀더 ────────────────────────────────────────

function NoData() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "2rem",
        color: v("--t3"),
        fontSize: ".85rem",
      }}
    >
      데이터 없음
    </div>
  );
}

// ── 이탈 곡선 (SVG) ─────────────────────────────────────────────────

function RetentionCurve({ markerX }: { markerX: number }) {
  return (
    <>
      <div
        style={{
          marginTop: 8,
          position: "relative",
          width: 200,
          height: 80,
          background: v("--bg"),
          borderRadius: 8,
          border: `1px solid ${v("--bd")}`,
          overflow: "visible",
          padding: "4px 0",
        }}
      >
        <svg
          width="200"
          height="80"
          viewBox="0 0 200 80"
          style={{ display: "block" }}
        >
          {/* 그리드 */}
          {[0, 20, 40, 60].map((y) => (
            <line
              key={y}
              x1={0}
              y1={y}
              x2={200}
              y2={y}
              stroke="rgba(71,85,105,.15)"
              strokeWidth={0.5}
            />
          ))}
          {/* 라벨 */}
          <text x={2} y={8} fontSize={7} fill="#64748b" opacity={0.6}>
            100%
          </text>
          <text x={2} y={28} fontSize={7} fill="#64748b" opacity={0.6}>
            75%
          </text>
          <text x={2} y={48} fontSize={7} fill="#64748b" opacity={0.6}>
            50%
          </text>
          <text x={2} y={68} fontSize={7} fill="#64748b" opacity={0.6}>
            25%
          </text>
          {/* 이탈 곡선 */}
          <polyline
            points="0,0 19,57 52,66 97,72 148,76 200,78"
            fill="none"
            stroke="#ef4444"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="0,0 19,57 52,66 97,72 148,76 200,78 200,80 0,80"
            fill="url(#dropGrad2)"
            stroke="none"
          />
          <defs>
            <linearGradient id="dropGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ef4444" stopOpacity={0.2} />
              <stop offset="1" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {/* 데이터 포인트 */}
          <circle cx={0} cy={0} r={3} fill="#10b981" />
          <circle cx={19} cy={57} r={3} fill="#f59e0b" />
          <circle cx={52} cy={66} r={3} fill="#f59e0b" />
          <circle cx={97} cy={72} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1} />
          <circle cx={148} cy={76} r={3} fill="#e2e8f0" />
          <circle cx={200} cy={78} r={3} fill="#e2e8f0" />
          {/* 라벨 */}
          <text
            x={19}
            y={53}
            fontSize={7}
            fill="#f59e0b"
            textAnchor="middle"
            fontWeight={600}
          >
            28%
          </text>
          <text
            x={97}
            y={68}
            fontSize={8}
            fill="#ef4444"
            textAnchor="middle"
            fontWeight={700}
          >
            10% 📉
          </text>
          {/* 씬 경계 세로선 */}
          {[19, 77, 174].map((x) => (
            <line
              key={x}
              x1={x}
              y1={0}
              x2={x}
              y2={80}
              stroke="#e2e8f0"
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
          ))}
          {/* 씬 라벨 */}
          <text x={9} y={78} fontSize={6} fill="#64748b" textAnchor="middle">
            훅
          </text>
          <text x={48} y={78} fontSize={6} fill="#64748b" textAnchor="middle">
            데모
          </text>
          <text x={125} y={78} fontSize={6} fill="#64748b" textAnchor="middle">
            증거
          </text>
          <text x={187} y={78} fontSize={6} fill="#64748b" textAnchor="middle">
            CTA
          </text>
          {/* 재생 위치 마커 */}
          <line
            x1={markerX}
            y1={0}
            x2={markerX}
            y2={80}
            stroke="#E54949"
            strokeWidth={2}
            opacity={0.9}
          />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: 200,
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: ".6rem", color: v("--t3") }}>0초</span>
        <span
          style={{
            fontSize: ".6rem",
            color: v("--r"),
            fontWeight: 600,
          }}
        >
          15초 급락
        </span>
        <span style={{ fontSize: ".6rem", color: v("--t3") }}>31초</span>
      </div>
    </>
  );
}

// ── 여정 행 ──────────────────────────────────────────────────────────

function JourneyRow({
  scene,
  isActive,
}: {
  scene: SceneJourneyItem;
  isActive: boolean;
}) {
  const sc = sceneColor(scene.type);
  const activeBg = isActive ? sc.bg.replace(".04", ".12") : sc.bg;
  const activeBorder = isActive
    ? `2px solid ${sc.borderColor}`
    : "none";
  const activeShadow = isActive
    ? `0 0 12px ${sc.bg.replace(".04", ".25")}`
    : "none";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr",
        gap: 0,
        marginBottom: 2,
      }}
    >
      <div
        style={{
          fontSize: ".72rem",
          fontWeight: 700,
          padding: "10px 8px",
          textAlign: "center",
          borderRight: `2px solid ${sc.borderColor}`,
          color: sc.color,
          background: isActive ? sc.bg : "transparent",
        }}
      >
        {scene.time}
        <br />
        <span style={{ fontSize: ".6rem" }}>{scene.type}</span>
      </div>
      <div
        className="cav2-journey-content"
        style={{
          padding: "8px 12px",
          borderRadius: "0 8px 8px 0",
          background: activeBg,
          border: activeBorder,
          boxShadow: activeShadow,
        }}
      >
        <EmojiRow icon="👁" label="봤다:" text={scene.watched} />
        <EmojiRow icon="👂" label="들었다:" text={scene.heard} />
        <EmojiRow icon="🧠" label="느꼈다:" text={scene.felt} />
      </div>
    </div>
  );
}

function EmojiRow({
  icon,
  label,
  text,
}: {
  icon: string;
  label: string;
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        fontSize: ".78rem",
        marginTop: 4,
      }}
    >
      <span
        style={{
          color: v("--t3"),
          minWidth: 20,
          textAlign: "center",
        }}
      >
        {icon}
      </span>
      <span>
        <strong>{label}</strong> {text || "-"}
      </span>
    </div>
  );
}

// ── 고객 여정 요약 ──────────────────────────────────────────────────

function JourneySummarySection({
  summary,
  detail,
}: {
  summary: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  } | null;
  detail: CustomerJourneyDetail | null;
}) {
  const vals = detail
    ? {
        sensation: detail.sensation.summary,
        thinking: detail.thinking.summary,
        action_click: detail.action_click.summary,
        action_purchase: detail.action_purchase.summary,
      }
    : summary
      ? summary
      : null;

  const subs = detail
    ? {
        sensation: detail.sensation.detail,
        thinking: detail.thinking.detail,
        action_click: detail.action_click.metric,
        action_purchase: detail.action_purchase.metric,
      }
    : null;

  const insight = detail?.core_insight;

  const stages = [
    {
      key: "sensation",
      emoji: "👁👂",
      label: "감각",
      color: "#06b6d4",
    },
    {
      key: "thinking",
      emoji: "🧠",
      label: "사고",
      color: "#8b5cf6",
    },
    {
      key: "action_click",
      emoji: "🖱",
      label: "행동 (선행)",
      color: "#f59e0b",
    },
    {
      key: "action_purchase",
      emoji: "💳",
      label: "행동 (후행)",
      color: "#ef4444",
    },
  ] as const;

  return (
    <div
      style={{
        background: v("--bg"),
        borderRadius: 10,
        padding: "1.2rem",
        border: `1px solid ${v("--bd")}`,
        marginBottom: "1.2rem",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: v("--t"),
          marginBottom: ".6rem",
          fontSize: ".9rem",
        }}
      >
        📊 고객 여정 요약
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          marginBottom: "1rem",
        }}
      >
        {stages.map((s) => (
          <div
            key={s.key}
            style={{
              textAlign: "center",
              padding: ".6rem",
              background: v("--bg2"),
              borderRadius: 8,
              borderTop: `3px solid ${s.color}`,
            }}
          >
            <div style={{ fontSize: "1.5rem" }}>{s.emoji}</div>
            <div style={{ fontSize: ".7rem", color: v("--t3") }}>
              {s.label}
            </div>
            <div
              style={{
                fontSize: ".75rem",
                fontWeight: 700,
                color: s.color,
              }}
            >
              {vals
                ? vals[s.key as keyof typeof vals] || "데이터 없음"
                : "데이터 없음"}
            </div>
            {subs && (
              <div
                style={{
                  fontSize: ".62rem",
                  color: v("--t3"),
                }}
              >
                {subs[s.key as keyof typeof subs] || ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {insight && (
        <div
          style={{
            fontSize: ".8rem",
            color: v("--t2"),
            lineHeight: 1.8,
          }}
          dangerouslySetInnerHTML={{ __html: insight }}
        />
      )}
    </div>
  );
}

// ── 씬별 시선 분석 + 처방 ─────────────────────────────────────────

function SceneDetailSection({
  scenes,
  saliencyFrames,
}: {
  scenes: SceneJourneyItem[];
  saliencyFrames: SaliencyFrame[] | null;
}) {
  if (!scenes || scenes.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.2rem" }}>
      <div
        style={{
          fontSize: ".9rem",
          fontWeight: 700,
          color: v("--t"),
          marginBottom: ".5rem",
        }}
      >
        👁 씬별 시선 분석 + 처방
      </div>
      <div
        style={{
          fontSize: ".7rem",
          color: v("--t3"),
          marginBottom: 12,
        }}
      >
        AI가 영상을 씬 단위로 분할 → 각 씬별 시선 분포 + 고객 반응 + 개선안 자동
        생성
      </div>

      {scenes.map((scene, idx) => {
        const { start } = parseSceneTime(scene.time);
        const borderCol = SCENE_BORDER_COLORS[scene.type] ?? "#64748b";
        const imgUrl = findClosestFrame(saliencyFrames, start);

        // 처방 우선도 결정 (마지막 씬이면 "필수", 나머지 "개선")
        const impStyle =
          scene.prescription?.target?.includes("행동")
            ? IMP_STYLES["필수"]
            : IMP_STYLES["개선"];
        const targetBadge = (() => {
          const t = scene.prescription?.target ?? "";
          if (t.includes("감각"))
            return {
              bg: "rgba(6,182,212,.15)",
              color: "#06b6d4",
              label: "👁 감각",
            };
          if (t.includes("사고"))
            return {
              bg: "rgba(139,92,246,.15)",
              color: "#8b5cf6",
              label: "🧠 사고",
            };
          if (t.includes("행동"))
            return {
              bg: "rgba(245,158,11,.15)",
              color: "#f59e0b",
              label: "🖱 행동",
            };
          return null;
        })();

        return (
          <div
            key={idx}
            style={{
              background: v("--bg"),
              borderRadius: 10,
              padding: "1rem",
              marginBottom: 8,
              borderLeft: `4px solid ${borderCol}`,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 12,
              }}
            >
              {/* 이미지 */}
              <div>
                {imgUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imgUrl}
                    alt={`${scene.time} ${scene.type}`}
                    style={{
                      width: 120,
                      height: 213,
                      objectFit: "cover",
                      borderRadius: 6,
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: 120,
                      height: 213,
                      borderRadius: 6,
                      background: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: ".7rem",
                      color: "#94a3b8",
                    }}
                  >
                    이미지 없음
                  </div>
                )}
                <div
                  style={{
                    fontSize: ".6rem",
                    color: borderCol,
                    fontWeight: 600,
                    textAlign: "center",
                    marginTop: 3,
                  }}
                >
                  {scene.time} · {scene.type}
                </div>
              </div>

              {/* 상세 내용 */}
              <div>
                <div
                  style={{
                    fontSize: ".75rem",
                    color: v("--t2"),
                    marginBottom: 6,
                    lineHeight: 1.7,
                  }}
                >
                  <strong>👁:</strong> {scene.watched || "-"}
                  <br />
                  <strong>👂:</strong> {scene.heard || "-"}
                  <br />
                  <strong>🧠:</strong> {scene.felt || "-"}
                  <br />
                  {scene.gaze_point && (
                    <>
                      <strong>📍:</strong> {scene.gaze_point}
                    </>
                  )}
                </div>

                {/* 자막 정보 */}
                {scene.subtitle_text && (
                  <div
                    style={{
                      fontSize: ".72rem",
                      color: v("--t3"),
                      marginBottom: 4,
                      padding: "4px 8px",
                      background: v("--bg2"),
                      borderRadius: 4,
                    }}
                  >
                    📝 {scene.subtitle_text}
                    {scene.subtitle_position &&
                      ` · ${scene.subtitle_position}`}
                    {scene.subtitle_safety_zone != null &&
                      (scene.subtitle_safety_zone
                        ? " · 세이프티존 ✅"
                        : " · ⚠️ 세이프티존 밖")}
                    {scene.cognitive_load === "high" && (
                      <span style={{ color: "#f59e0b" }}>
                        {" "}
                        · 인지부하 high
                      </span>
                    )}
                  </div>
                )}

                {/* 처방 */}
                {scene.prescription?.action && (
                  <div
                    style={{
                      fontSize: ".72rem",
                      padding: "6px 8px",
                      background: impStyle.bg,
                      border: `1px solid ${impStyle.border}`,
                      borderRadius: 6,
                    }}
                  >
                    💊{" "}
                    <span
                      style={{
                        color: impStyle.color,
                        fontWeight: 700,
                      }}
                    >
                      {impStyle.label}
                    </span>
                    {targetBadge && (
                      <>
                        {" "}
                        ·{" "}
                        <span
                          style={{
                            fontSize: ".6rem",
                            background: targetBadge.bg,
                            color: targetBadge.color,
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          {targetBadge.label}
                        </span>
                      </>
                    )}
                    {" — "}
                    {scene.prescription.action}
                    <br />
                    <span style={{ color: v("--t3") }}>
                      근거: {scene.prescription.reasoning}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
