/**
 * 사전계산 오케스트레이터 — collect-daily 크론 완료 후 호출
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { precomputeT3Scores } from "./t3-precompute";
import { precomputeStudentPerformance } from "./performance-precompute";
import { precomputeDiagnosis } from "./diagnosis-precompute";
import { precomputeInsights } from "./insights-precompute";
import { precomputeOverlap } from "./overlap-precompute";
import { precomputeDashboardStats } from "./dashboard-precompute";
import { precomputeEmailCampaigns } from "./email-precompute";
import { precomputeKnowledgeStats } from "./knowledge-precompute";
import { precomputeSyncStatus } from "./sync-status-precompute";

interface SubResult { computed: number; errors: string[] }

export interface PrecomputeResult {
  t3: SubResult;
  performance: SubResult;
  diagnosis: SubResult;
  insights: SubResult;
  overlap: SubResult;
  dashboard: SubResult;
  email: SubResult;
  knowledge: SubResult;
  syncStatus: SubResult;
}

export async function runPrecomputeAll(
  supabase: SupabaseClient,
): Promise<PrecomputeResult> {
  console.log("[precompute] 사전계산 시작");

  const t3 = await precomputeT3Scores(supabase);
  console.log(`[precompute] T3 완료: ${t3.computed}건, 에러 ${t3.errors.length}건`);

  const performance = await precomputeStudentPerformance(supabase);
  console.log(`[precompute] 성과 완료: ${performance.computed}건, 에러 ${performance.errors.length}건`);

  const diagnosis = await precomputeDiagnosis(supabase);
  console.log(`[precompute] 진단 완료: ${diagnosis.computed}건, 에러 ${diagnosis.errors.length}건`);

  // T2: insights 일자별 사전집계
  const insights = await precomputeInsights(supabase);
  console.log(`[precompute] 인사이트 집계 완료: ${insights.computed}건, 에러 ${insights.errors.length}건`);

  // T1: overlap 타겟중복 사전계산 (Meta API 호출 포함 — 가장 오래 걸림)
  const overlap = await precomputeOverlap(supabase);
  console.log(`[precompute] 타겟중복 완료: ${overlap.computed}건, 에러 ${overlap.errors.length}건`);

  // Phase 2: 집계 캐시 4개
  const dashboard = await precomputeDashboardStats(supabase);
  console.log(`[precompute] 대시보드 완료: ${dashboard.computed}건, 에러 ${dashboard.errors.length}건`);

  const email = await precomputeEmailCampaigns(supabase);
  console.log(`[precompute] 이메일 완료: ${email.computed}건, 에러 ${email.errors.length}건`);

  const knowledge = await precomputeKnowledgeStats(supabase);
  console.log(`[precompute] 지식관리 완료: ${knowledge.computed}건, 에러 ${knowledge.errors.length}건`);

  const syncStatus = await precomputeSyncStatus(supabase);
  console.log(`[precompute] 동기화상태 완료: ${syncStatus.computed}건, 에러 ${syncStatus.errors.length}건`);

  // 에러 로깅
  const allErrors = [
    ...t3.errors, ...performance.errors, ...diagnosis.errors,
    ...insights.errors, ...overlap.errors,
    ...dashboard.errors, ...email.errors, ...knowledge.errors, ...syncStatus.errors,
  ];
  if (allErrors.length > 0) {
    console.error("[precompute] 에러:", allErrors);
  }

  console.log("[precompute] 사전계산 완료");
  return { t3, performance, diagnosis, insights, overlap, dashboard, email, knowledge, syncStatus };
}
