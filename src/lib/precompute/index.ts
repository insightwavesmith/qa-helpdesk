/**
 * 사전계산 오케스트레이터 — collect-daily 크론 완료 후 호출
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { precomputeT3Scores } from "./t3-precompute";
import { precomputeStudentPerformance } from "./performance-precompute";
import { precomputeDiagnosis } from "./diagnosis-precompute";

export interface PrecomputeResult {
  t3: { computed: number; errors: string[] };
  performance: { computed: number; errors: string[] };
  diagnosis: { computed: number; errors: string[] };
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

  // 에러 로깅
  const allErrors = [...t3.errors, ...performance.errors, ...diagnosis.errors];
  if (allErrors.length > 0) {
    console.error("[precompute] 에러:", allErrors);
  }

  console.log("[precompute] 사전계산 완료");
  return { t3, performance, diagnosis };
}
