"use client";

import { useState } from "react";
import type { PrescriptionResponse } from "@/types/prescription";
import { AndromedaAlert } from "./AndromedaAlert";
import { FiveAxisScorecard } from "./FiveAxisScorecard";
import { PerformanceBacktrack } from "./PerformanceBacktrack";
import { CustomerJourneyBreakdown } from "./CustomerJourneyBreakdown";
import { PrescriptionList } from "./PrescriptionList";
import { BenchmarkComparison } from "./BenchmarkComparison";

interface PrescriptionPanelProps {
  creativeMediaId: string;
  accountId: string;
}

// ── 스켈레톤 UI ──────────────────────────────────────────────────────────

function SkeletonCard({ h = "h-32" }: { h?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${h}`} />;
}

function PrescriptionSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard h="h-24" />
      <SkeletonCard h="h-40" />
      <SkeletonCard h="h-56" />
      <SkeletonCard h="h-32" />
    </div>
  );
}

// ── 에러 배너 ─────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-red-500 mt-0.5">⚠</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800 mb-1">처방 생성 실패</p>
          <p className="text-xs text-red-600">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

// ── 약점 분석 (인라인) ────────────────────────────────────────────────────

function WeaknessAnalysis({ weaknesses }: { weaknesses: PrescriptionResponse["weakness_analysis"] }) {
  if (!weaknesses || weaknesses.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">약점 분석</h3>
        <p className="text-xs text-gray-500">백분위 하위 30% 이하 속성 — EAR 영향 정리</p>
      </div>
      <div className="divide-y divide-gray-50">
        {weaknesses.map((w, i) => (
          <div key={i} className="p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-800">{w.attribute_label}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{w.axis}</span>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700 font-medium">
                현재 {Math.round(w.current_percentile)}%ile
              </span>
              {w.global_percentile > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">
                  글로벌 {Math.round(w.global_percentile)}%ile
                </span>
              )}
            </div>
            {w.issue && <p className="text-xs text-gray-600 mb-1">{w.issue}</p>}
            {w.benchmark_comparison && <p className="text-[10px] text-gray-400">{w.benchmark_comparison}</p>}
            {w.ear_impact && (
              <p className="mt-1 text-[10px] text-orange-600 font-medium">EAR 영향: {w.ear_impact}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 메인 패널 ─────────────────────────────────────────────────────────────

export function PrescriptionPanel({ creativeMediaId, accountId }: PrescriptionPanelProps) {
  const [data, setData] = useState<PrescriptionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePrescription() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/protractor/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creative_media_id: creativeMediaId, account_id: accountId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "처방 생성 중 오류가 발생했습니다" }));
        throw new Error(err.error ?? "처방 생성 중 오류가 발생했습니다");
      }
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 처방 생성 버튼 */}
      {!data && !loading && (
        <div className="rounded-xl border border-gray-100 bg-white p-6 text-center">
          <div className="mb-3">
            <span className="text-3xl">💊</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">AI 처방 생성</h3>
          <p className="text-xs text-gray-500 mb-4">
            성과 데이터·내부 패턴·글로벌 벤치마크 3축을 기반으로<br />
            노출당구매확률을 올리는 Top3 처방을 15초 내에 생성합니다
          </p>
          <button
            onClick={generatePrescription}
            className="w-full rounded-lg bg-[#F75D5D] py-3 px-6 text-sm font-semibold text-white hover:bg-[#E54949] transition-colors"
          >
            처방 생성하기
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <span className="animate-spin text-base">⏳</span>
            <p className="text-xs text-blue-700 font-medium">AI가 소재를 분석하고 처방을 생성 중입니다… (약 15초 소요)</p>
          </div>
          <PrescriptionSkeleton />
        </div>
      )}

      {/* 에러 */}
      {error && !loading && (
        <ErrorBanner message={error} onRetry={generatePrescription} />
      )}

      {/* 결과 */}
      {data && !loading && (
        <>
          {/* 재생성 버튼 */}
          <div className="flex justify-end">
            <button
              onClick={generatePrescription}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ↺ 재생성
            </button>
          </div>

          {/* Andromeda 경고 (최상단) */}
          {data.andromeda_warning && data.andromeda_warning.level !== "low" && (
            <AndromedaAlert warning={data.andromeda_warning} />
          )}

          {/* 5축 점수 */}
          <FiveAxisScorecard scores={data.scores} percentiles={data.percentiles} />

          {/* 성과 역추적 (성과 데이터 있을 때만) */}
          {data.meta?.has_performance_data && data.performance_backtrack && (
            <PerformanceBacktrack backtrack={data.performance_backtrack} />
          )}

          {/* 고객 여정 4단계 */}
          <CustomerJourneyBreakdown
            journey={data.customer_journey_summary}
            backtrack={data.performance_backtrack?.journey_breakdown}
          />

          {/* Top3 처방 */}
          <PrescriptionList prescriptions={data.top3_prescriptions} />

          {/* 약점 분석 */}
          <WeaknessAnalysis weaknesses={data.weakness_analysis} />

          {/* 글로벌 벤치마크 비교 */}
          <BenchmarkComparison
            scores={data.scores}
            percentiles={data.percentiles}
            earAnalysis={data.ear_analysis}
          />

          {/* 메타 정보 */}
          {data.meta && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[10px] text-gray-400">
                모델: {data.meta.model} · 소요: {data.meta.latency_ms}ms ·
                패턴: {data.meta.patterns_count}건 · 벤치마크: {data.meta.benchmarks_count}건
                {data.meta.category_fallback ? " · 카테고리 fallback" : ""}
                {data.meta.axis2_used ? " · 축2 사용" : ""}
                {data.meta.axis3_used ? " · 축3 사용" : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
