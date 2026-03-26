"use client";

import { useState } from "react";
import type { PrescriptionResponse } from "@/types/prescription";

interface PrescriptionListProps {
  prescriptions: PrescriptionResponse["top3_prescriptions"];
}

const DIFFICULTY_STYLES: Record<string, string> = {
  "쉬움": "bg-emerald-100 text-emerald-700",
  "보통": "bg-amber-100 text-amber-700",
  "어려움": "bg-red-100 text-red-700",
};

const STAGE_STYLES: Record<string, string> = {
  "감각": "bg-purple-100 text-purple-700",
  "사고": "bg-blue-100 text-blue-700",
  "행동(클릭)": "bg-orange-100 text-orange-700",
  "행동(구매)": "bg-emerald-100 text-emerald-700",
};

const RANK_STYLES = ["bg-[#F75D5D] text-white", "bg-gray-700 text-white", "bg-gray-400 text-white"];

function EvidenceAccordion({ axis1, axis2, axis3 }: { axis1: string; axis2: string; axis3: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <span>처방 근거 보기</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 py-2 space-y-2">
          <div>
            <span className="text-[10px] font-semibold text-purple-600">축1 (레퍼런스 원론)</span>
            <p className="mt-0.5 text-xs text-gray-600">{axis1 || "-"}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-blue-600">축2 (내부 패턴)</span>
            <p className="mt-0.5 text-xs text-gray-600">{axis2 || "-"}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-emerald-600">축3 (글로벌 벤치마크)</span>
            <p className="mt-0.5 text-xs text-gray-600">{axis3 || "-"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function PrescriptionList({ prescriptions }: PrescriptionListProps) {
  if (!prescriptions || prescriptions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400">
        처방 결과가 없습니다
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Top 3 처방</h3>
        <p className="text-xs text-gray-500">노출당구매확률 향상을 위한 우선순위 실행 처방</p>
      </div>
      <div className="flex flex-col divide-y divide-gray-50">
        {prescriptions.map((p, idx) => (
          <div key={idx} className={`p-4 ${p.performance_driven ? "bg-yellow-50/30" : "bg-white"}`}>
            <div className="flex flex-wrap items-start gap-2 mb-2">
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RANK_STYLES[idx] ?? "bg-gray-300 text-white"}`}>
                {p.rank}
              </span>
              {p.performance_driven && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                  ⚡ 성과 기반
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_STYLES[p.journey_stage] ?? "bg-gray-100 text-gray-600"}`}>
                {p.journey_stage}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${DIFFICULTY_STYLES[p.difficulty] ?? "bg-gray-100 text-gray-600"}`}>
                {p.difficulty}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">{p.title}</h4>
            <p className="text-sm text-gray-700 mb-2 leading-relaxed">{p.action}</p>
            {p.expected_impact && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2">
                <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                <p className="text-xs text-emerald-700 font-medium">{p.expected_impact}</p>
              </div>
            )}
            {p.difficulty_reason && (
              <p className="text-[10px] text-gray-400 mb-1">난이도 이유: {p.difficulty_reason}</p>
            )}
            <EvidenceAccordion
              axis1={p.evidence_axis1}
              axis2={p.evidence_axis2}
              axis3={p.evidence_axis3}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
