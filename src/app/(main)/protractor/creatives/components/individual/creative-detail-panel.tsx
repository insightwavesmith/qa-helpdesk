"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { jsonFetcher } from "@/lib/swr/config";
import type { AnalysisJsonV3 } from "@/types/prescription";
import { CreativeAnalysisV2 } from "./creative-analysis-v2";

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

interface PrescriptionResponse {
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
}

// ── Props ─────────────────────────────────────────────────────────

interface CreativeDetailPanelProps {
  creativeId: string;
  accountId: string;
  onClose: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function CreativeDetailPanel({
  creativeId,
  accountId,
  onClose: _onClose,
  currentIndex = 0,
  totalCount = 1,
  onPrev,
  onNext,
}: CreativeDetailPanelProps) {
  // 상세 데이터
  const { data: detail, isLoading: detailLoading } =
    useSWR<CreativeDetailResponse>(
      creativeId
        ? `/api/protractor/creative-detail?id=${creativeId}&account_id=${accountId}`
        : null,
      jsonFetcher,
    );

  // 처방 데이터 (lazy load)
  const { data: prescription } = useSWR<PrescriptionResponse>(
    creativeId ? `/api/protractor/prescription?id=${creativeId}` : null,
    jsonFetcher,
  );

  // 로딩 스켈레톤
  if (detailLoading || !detail) {
    return (
      <div className="space-y-4" style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const creative = detail.creative;

  // saliency → saliencyFrames 변환
  // 1순위: API saliency.frames (프레임별 히트맵 URL 자동 생성)
  // 2순위: video_analysis.heatmap_urls (레거시)
  // 3순위: saliency 단일 이미지
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const va = creative?.video_analysis as Record<string, any> | null;
  const heatmapUrls = va?.heatmap_urls as Array<{ sec: number; url: string }> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salFrames = (detail.saliency as any)?.frames as Array<{ sec: number; url: string }> | undefined;
  
  const frameSource = salFrames && salFrames.length > 0
    ? salFrames
    : heatmapUrls && heatmapUrls.length > 0
      ? heatmapUrls
      : null;

  const saliencyFrames = frameSource
    ? frameSource.map((h, i) => ({
        frame_index: i,
        timestamp_sec: h.sec,
        attention_map_url: h.url,
        top_fixations: detail.saliency?.top_fixations ?? [],
      }))
    : detail.saliency?.top_fixations
      ? [
          {
            frame_index: 0,
            timestamp_sec: 0,
            attention_map_url: detail.saliency.attention_map_url ?? "",
            top_fixations: detail.saliency.top_fixations,
          },
        ]
      : null;

  // CreativeAnalysisV2에 전달할 performance 매핑
  const v2Performance = detail.performance
    ? {
        impressions: detail.performance.impressions,
        reach: detail.performance.reach,
        spend: detail.performance.spend,
        ctr: detail.performance.ctr,
        cpc: detail.performance.cpc,
        roas: detail.performance.roas,
        video_p3s_rate: detail.performance.video_p3s_rate,
        video_thruplay_rate: detail.performance.video_thruplay_rate,
        purchase_count: detail.performance.purchase_count,
        reach_to_purchase_rate: detail.performance.reach_to_purchase_rate,
      }
    : null;

  return (
    <CreativeAnalysisV2
      creative={{
        id: creative.id,
        ad_id: creative.ad_id,
        media_type: creative.media_type,
        media_url: creative.media_url,
        storage_url: creative.storage_url,
        thumbnail_url: creative.thumbnail_url,
        ad_copy: creative.ad_copy,
        duration_seconds: creative.duration_seconds,
        analysis_json: creative.analysis_json,
      }}
      performance={v2Performance}
      benchmarks={detail.benchmarks}
      saliencyFrames={saliencyFrames}
      prescription={
        prescription
          ? {
              top3_prescriptions: prescription.top3_prescriptions,
              customer_journey_summary:
                prescription.customer_journey_summary,
            }
          : null
      }
      topCreative={detail.top_creative}
      currentIndex={currentIndex}
      totalCount={totalCount}
      onPrev={onPrev ?? (() => {})}
      onNext={onNext ?? (() => {})}
    />
  );
}
