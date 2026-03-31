"use client";

import useSWR from "swr";
import { X, Image as ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { jsonFetcher } from "@/lib/swr/config";
import type { AnalysisJsonV3, PrescriptionResponse } from "@/types/prescription";
import { ThreeAxisScore } from "./three-axis-score";
import { FiveAxisCard } from "./five-axis-card";
import { CustomerJourney } from "./customer-journey";
import { GazeAnalysis } from "./gaze-analysis";
import { PrescriptionCards } from "./prescription-cards";
import { SceneDetailAnalysis } from "./scene-detail-analysis";
import { AudioAnalysis } from "./audio-analysis";
import { AdAxisCard } from "./ad-axis-card";

// ── API 응답 타입 ─────────────────────────────────────────────────

interface CreativeDetailResponse {
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
    video_analysis: Record<string, unknown> | null;
  };
  performance: {
    impressions: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    roas: number;
    video_p3s_rate: number | null;
    video_thruplay_rate: number | null;
    video_p25_rate: number | null;
    video_p50_rate: number | null;
    video_p75_rate: number | null;
    video_p100_rate: number | null;
    shares_per_10k: number | null;
    saves_per_10k: number | null;
    purchase_count: number;
    reach_to_purchase_rate: number;
  } | null;
  saliency: {
    attention_map_url: string | null;
    top_fixations: Array<{ x: number; y: number; ratio: number }>;
    cta_attention_score: number;
    cognitive_load: number;
  } | null;
  benchmarks: {
    category: string;
    metrics: Record<string, { p25: number; p50: number; p75: number }>;
  } | null;
  top_creative: {
    id: string;
    media_url: string;
    ad_copy: string | null;
    roas: number;
    ctr: number;
    reach_to_purchase_rate: number;
  } | null;
}

// ── Props ─────────────────────────────────────────────────────────

interface CreativeDetailPanelProps {
  creativeId: string;
  accountId: string;
  onClose: () => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function CreativeDetailPanel({
  creativeId,
  accountId,
  onClose,
}: CreativeDetailPanelProps) {
  // 상세 데이터
  const { data: detail, isLoading: detailLoading } =
    useSWR<CreativeDetailResponse>(
      creativeId
        ? `/api/protractor/creative-detail?id=${creativeId}&account_id=${accountId}`
        : null,
      jsonFetcher
    );

  // 처방 데이터 (lazy load)
  const { data: prescription, isLoading: prescriptionLoading } =
    useSWR<PrescriptionResponse>(
      creativeId ? `/api/protractor/prescription?id=${creativeId}` : null,
      jsonFetcher
    );

  const creative = detail?.creative;
  const performance = detail?.performance;
  const benchmarks = detail?.benchmarks;
  const analysisJson = creative?.analysis_json;
  const isVideo = creative?.media_type === "VIDEO";
  const mediaUrl = creative?.thumbnail_url ?? creative?.storage_url ?? creative?.media_url ?? "";

  // 로딩 스켈레톤
  if (detailLoading || !detail) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 sticky top-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // ad_axis가 있으면 AdAxisCard 사용, 없으면 FiveAxisCard fallback
  const hasAdAxis = !!analysisJson?.ad_axis;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 sticky top-4"
      style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
    >
      {/* 미디어 프리뷰 헤더 (카드 상단) */}
      <div className="relative w-full rounded-t-2xl overflow-hidden" style={{ background: "#f1f5f9" }}>
        <div className="w-full h-48">
          {mediaUrl ? (
            isVideo ? (
              <video
                src={mediaUrl}
                className="w-full h-full object-cover"
                controls
                preload="metadata"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl}
                alt="소재"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
        </div>
        {/* 그라데이션 오버레이 + 닫기 */}
        <div
          className="absolute top-0 left-0 right-0 flex items-start justify-between p-3"
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)" }}
        >
          <h3 className="text-sm font-bold text-white">소재 풀분석</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        {/* 미디어 타입 뱃지 */}
        <div className="absolute bottom-2 left-3 flex gap-1.5">
          <span
            className="px-2 py-0.5 rounded text-white text-xs font-semibold"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            {creative?.media_type}
            {creative?.duration_seconds ? ` · ${creative.duration_seconds}초` : ""}
          </span>
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="px-5 pt-3 pb-1">
        {creative?.ad_copy && (
          <p className="text-sm text-gray-700 line-clamp-2 mb-1">
            {creative.ad_copy}
          </p>
        )}
        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
          {creative?.ad_id && `ad_id: ${creative.ad_id}`}
          {performance ? " · 실제 데이터 기반" : ""}
        </div>
      </div>

      {/* 분석 섹션들 */}
      <div className="px-5 pb-5 space-y-3 mt-2">
        {/* 1. 성과 3대축 */}
        <ThreeAxisScore
          performance={performance ?? null}
          benchmarks={benchmarks ?? null}
        />

        {/* 2. 광고축 카테고리 (ad_axis 우선, fallback → 5축 태그) */}
        {analysisJson && (
          hasAdAxis
            ? <AdAxisCard analysisJson={analysisJson} />
            : <FiveAxisCard analysisJson={analysisJson} />
        )}

        {/* 3. 고객 여정 타임라인 (VIDEO만) */}
        {isVideo && analysisJson && creative?.duration_seconds && (
          <CustomerJourney
            analysisJson={analysisJson}
            durationSeconds={creative.duration_seconds}
            customerJourneySummary={
              prescription?.customer_journey_summary ?? null
            }
          />
        )}

        {/* 4. 씬별 시선 분석 + 처방 (VIDEO만) */}
        {isVideo && analysisJson && (
          <SceneDetailAnalysis
            analysisJson={analysisJson}
            saliencyFrames={null}
          />
        )}

        {/* 5. 오디오 분석 (VIDEO만) */}
        {isVideo && analysisJson && (
          <AudioAnalysis analysisJson={analysisJson} />
        )}

        {/* 6. 시선 분석 */}
        <GazeAnalysis
          saliency={detail.saliency ?? null}
          saliencyFrames={null}
          mediaType={creative?.media_type ?? "IMAGE"}
          mediaUrl={mediaUrl}
        />

        {/* 7. 처방 Top 3 */}
        <PrescriptionCards
          prescriptions={
            prescription?.top3_prescriptions ??
            analysisJson?.top3_prescriptions ??
            null
          }
          isLoading={prescriptionLoading}
        />

        {/* 8. Top 소재 비교 */}
        {detail.top_creative && performance && (
          <TopCompare current={performance} top={detail.top_creative} />
        )}

        {/* 푸터 */}
        <div className="text-center pt-2" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
          AI 자동 생성 분석 (시선 예측 + 5축 분석 + 처방 가이드)
        </div>
      </div>
    </div>
  );
}

// ── Top 소재 비교 (인라인) ────────────────────────────────────────

function TopCompare({
  current,
  top,
}: {
  current: {
    ctr: number;
    roas: number;
    video_p3s_rate: number | null;
    reach_to_purchase_rate: number;
  };
  top: {
    id: string;
    media_url: string;
    ad_copy: string | null;
    roas: number;
    ctr: number;
    reach_to_purchase_rate: number;
  };
}) {
  const metrics = [
    {
      label: "CTR",
      mine: `${(current.ctr * 100).toFixed(2)}%`,
      theirs: `${(top.ctr * 100).toFixed(2)}%`,
    },
    {
      label: "ROAS",
      mine: current.roas.toFixed(1),
      theirs: top.roas.toFixed(1),
    },
    {
      label: "노출당구매확률",
      mine: `${(current.reach_to_purchase_rate * 100).toFixed(2)}%`,
      theirs: `${(top.reach_to_purchase_rate * 100).toFixed(2)}%`,
    },
  ];

  if (current.video_p3s_rate != null) {
    metrics.splice(1, 0, {
      label: "3초시청률",
      mine: `${(current.video_p3s_rate * 100).toFixed(1)}%`,
      theirs: "-",
    });
  }

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📈</span>
        <div className="text-sm font-bold text-gray-800">같은 계정 성과 비교</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 내 소재 */}
        <div className="bg-white rounded-lg p-3" style={{ borderLeft: "4px solid #ef4444" }}>
          <div className="text-xs font-semibold text-gray-500 mb-2">이 소재</div>
          {metrics.map((m) => (
            <div key={m.label} className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{m.label}</span>
              <span className="font-semibold">{m.mine}</span>
            </div>
          ))}
        </div>

        {/* Top 소재 */}
        <div className="bg-white rounded-lg p-3" style={{ borderLeft: "4px solid #10b981" }}>
          <div className="text-xs font-semibold text-gray-500 mb-2">✅ Top 소재</div>
          {metrics.map((m) => (
            <div key={m.label} className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{m.label}</span>
              <span className="font-semibold text-emerald-600">{m.theirs}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
