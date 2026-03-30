"use client";

import type { AnalysisJsonV3 } from "@/types/prescription";

interface FiveAxisCardProps {
  analysisJson: AnalysisJsonV3;
}

// ── 축별 태그 색상 ───────────────────────────────────────────────

const TAG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  hook: {
    bg: "rgba(247,93,93,0.12)",
    color: "#F75D5D",
    border: "rgba(247,93,93,0.3)",
  },
  messaging: {
    bg: "rgba(139,92,246,0.12)",
    color: "#8b5cf6",
    border: "rgba(139,92,246,0.3)",
  },
  target: {
    bg: "rgba(59,130,246,0.12)",
    color: "#3b82f6",
    border: "rgba(59,130,246,0.3)",
  },
  category: {
    bg: "rgba(16,185,129,0.12)",
    color: "#10b981",
    border: "rgba(16,185,129,0.3)",
  },
  style: {
    bg: "rgba(245,158,11,0.12)",
    color: "#f59e0b",
    border: "rgba(245,158,11,0.3)",
  },
};

// ── 한국어 레이블 ─────────────────────────────────────────────────

const HOOK_TYPE_LABELS: Record<string, string> = {
  problem: "문제제기",
  curiosity: "호기심",
  benefit: "혜택",
  shock: "충격",
  question: "질문",
  confession: "고백",
  contrast: "대비",
  relatability: "공감",
  none: "없음",
};

const HEADLINE_TYPE_LABELS: Record<string, string> = {
  benefit: "혜택",
  curiosity: "호기심",
  question: "질문",
  shock: "충격",
  problem: "문제제기",
  none: "없음",
};

const SOCIAL_PROOF_LABELS: Record<string, string> = {
  testimonial: "후기",
  numbers: "수치",
  celebrity: "유명인",
  expert: "전문가",
  none: "없음",
};

const VISUAL_STYLE_LABELS: Record<string, string> = {
  ugc: "UGC",
  professional: "프로페셔널",
  minimal: "미니멀",
  bold: "볼드",
  lifestyle: "라이프스타일",
  before_after: "비포/애프터",
};

const PRODUCTION_LABELS: Record<string, string> = {
  professional: "프로",
  semi: "세미프로",
  ugc: "UGC",
  low: "저품질",
};

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function FiveAxisCard({ analysisJson }: FiveAxisCardProps) {
  const tags: Array<{ axis: string; icon: string; label: string; value: string }> = [];

  // 스타일 + 포맷
  if (analysisJson.hook?.visual_style) {
    const vs = VISUAL_STYLE_LABELS[analysisJson.hook.visual_style] ?? analysisJson.hook.visual_style;
    const prod = analysisJson.quality?.production_quality
      ? PRODUCTION_LABELS[analysisJson.quality.production_quality] ?? analysisJson.quality.production_quality
      : null;
    tags.push({
      axis: "style",
      icon: "🎬",
      label: "",
      value: prod ? `${vs} · ${prod}` : vs,
    });
  }

  // 훅
  if (analysisJson.hook?.hook_type && analysisJson.hook.hook_type !== "none") {
    tags.push({
      axis: "hook",
      icon: "🪝",
      label: "훅",
      value: HOOK_TYPE_LABELS[analysisJson.hook.hook_type] ?? analysisJson.hook.hook_type,
    });
  }

  // 메시징
  if (analysisJson.text?.headline_type && analysisJson.text.headline_type !== "none") {
    const hl = HEADLINE_TYPE_LABELS[analysisJson.text.headline_type] ?? analysisJson.text.headline_type;
    const sp = analysisJson.psychology?.social_proof_type && analysisJson.psychology.social_proof_type !== "none"
      ? SOCIAL_PROOF_LABELS[analysisJson.psychology.social_proof_type] ?? analysisJson.psychology.social_proof_type
      : null;
    tags.push({
      axis: "messaging",
      icon: "💬",
      label: "메시징",
      value: sp ? `${hl}+${sp}` : hl,
    });
  }

  // 심리 (사회적 증거가 별도 표시 안 됐으면)
  if (
    analysisJson.psychology?.authority &&
    analysisJson.psychology.authority !== "none"
  ) {
    tags.push({
      axis: "messaging",
      icon: "🛡",
      label: "설득",
      value: analysisJson.psychology.authority,
    });
  }

  // 카테고리 (andromeda_signals에서 또는 quality에서)
  if (analysisJson.andromeda_signals?.visual_fingerprint) {
    tags.push({
      axis: "category",
      icon: "🏷️",
      label: "",
      value: analysisJson.andromeda_signals.visual_fingerprint,
    });
  }

  if (tags.length === 0) {
    return null;
  }

  // 정보 카드 그리드
  const infoCards: Array<{ label: string; value: string }> = [];

  if (analysisJson.hook?.composition) {
    infoCards.push({ label: "구도", value: analysisJson.hook.composition });
  }
  if (analysisJson.visual?.color_scheme) {
    infoCards.push({ label: "색감", value: analysisJson.visual.color_scheme });
  }
  if (analysisJson.visual?.product_visibility) {
    infoCards.push({ label: "제품 노출", value: analysisJson.visual.product_visibility });
  }
  if (analysisJson.psychology?.urgency && analysisJson.psychology.urgency !== "none") {
    infoCards.push({ label: "긴급성", value: analysisJson.psychology.urgency });
  }

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#E54949" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-base"
          style={{ background: "rgba(99,102,241,0.15)", color: "#E54949" }}
        >
          📋
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "#E54949" }}>
            광고축 — 네가 만든 콘텐츠는 이런 거야
          </div>
          <div className="text-xs text-gray-500">5축 분석 기반 카테고리 분류</div>
        </div>
      </div>

      {/* 태그 칩 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map((tag, i) => {
          const style = TAG_STYLES[tag.axis] ?? TAG_STYLES.hook;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{
                background: style.bg,
                color: style.color,
                border: `1px solid ${style.border}`,
              }}
            >
              {tag.icon} {tag.label ? `${tag.label}: ` : ""}{tag.value}
            </span>
          );
        })}
      </div>

      {/* 정보 카드 그리드 */}
      {infoCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {infoCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-lg p-2.5 text-center"
            >
              <div className="text-[11px] text-gray-500">{card.label}</div>
              <div className="text-xs font-bold text-gray-800 mt-0.5">
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
