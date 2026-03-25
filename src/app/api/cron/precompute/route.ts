/**
 * GET /api/cron/precompute
 * Cron: 3가지 사전계산을 순차 실행
 *   1. T3 점수 (t3_scores_precomputed)
 *   2. 수강생 성과 (student_performance_daily)
 *   3. 광고 진단 (ad_diagnosis_cache)
 *
 * 스케줄: collect-daily(18:00 UTC) 완료 후 → 19:30 UTC
 * 개별 실행: ?only=t3|student|diagnosis
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { precomputeT3Scores } from "@/lib/precompute/t3-precompute";
import { precomputeStudentPerformance } from "@/lib/precompute/student-precompute";
import { precomputeDiagnosis } from "@/lib/precompute/diagnosis-precompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PhaseResult {
  count: number;
  ms: number;
  errors?: string[];
}

interface CronResult {
  t3?: PhaseResult;
  student?: PhaseResult;
  diagnosis?: PhaseResult;
  skipped?: string[];
  totalMs: number;
}

export async function GET(req: NextRequest) {
  // Cron 인증 확인
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const only = searchParams.get("only"); // t3 | student | diagnosis | null(전체)

  const svc = createServiceClient();
  const result: CronResult = { totalMs: 0, skipped: [] };
  const startAll = Date.now();

  // 1. T3 점수 사전계산
  if (!only || only === "t3") {
    console.log("[precompute] T3 점수 사전계산 시작");
    const t3Start = Date.now();
    try {
      const t3Res = await precomputeT3Scores(svc);
      result.t3 = {
        count: t3Res.computed,
        ms: Date.now() - t3Start,
        errors: t3Res.errors.length > 0 ? t3Res.errors : undefined,
      };
      console.log(`[precompute] T3 완료: ${t3Res.computed}건, 에러=${t3Res.errors.length}건`);
      if (t3Res.errors.length > 0) {
        console.warn("[precompute] T3 에러:", t3Res.errors);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.t3 = { count: 0, ms: Date.now() - t3Start, errors: [msg] };
      console.error("[precompute] T3 치명 에러:", msg);
    }
  } else {
    result.skipped?.push("t3");
  }

  // 2. 수강생 성과 사전계산
  if (!only || only === "student") {
    console.log("[precompute] 수강생 성과 사전계산 시작");
    const studentStart = Date.now();
    try {
      const studentRes = await precomputeStudentPerformance(svc);
      result.student = {
        count: studentRes.computed,
        ms: Date.now() - studentStart,
        errors: studentRes.errors.length > 0 ? studentRes.errors : undefined,
      };
      console.log(`[precompute] 수강생 완료: ${studentRes.computed}건, 에러=${studentRes.errors.length}건`);
      if (studentRes.errors.length > 0) {
        console.warn("[precompute] 수강생 에러:", studentRes.errors);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.student = { count: 0, ms: Date.now() - studentStart, errors: [msg] };
      console.error("[precompute] 수강생 치명 에러:", msg);
    }
  } else {
    result.skipped?.push("student");
  }

  // 3. 광고 진단 사전계산
  if (!only || only === "diagnosis") {
    console.log("[precompute] 광고 진단 사전계산 시작");
    const diagStart = Date.now();
    try {
      const diagRes = await precomputeDiagnosis(svc);
      result.diagnosis = {
        count: diagRes.computed,
        ms: Date.now() - diagStart,
        errors: diagRes.errors.length > 0 ? diagRes.errors : undefined,
      };
      console.log(`[precompute] 진단 완료: ${diagRes.computed}건, 에러=${diagRes.errors.length}건`);
      if (diagRes.errors.length > 0) {
        console.warn("[precompute] 진단 에러:", diagRes.errors);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.diagnosis = { count: 0, ms: Date.now() - diagStart, errors: [msg] };
      console.error("[precompute] 진단 치명 에러:", msg);
    }
  } else {
    result.skipped?.push("diagnosis");
  }

  result.totalMs = Date.now() - startAll;
  console.log(`[precompute] 전체 완료: ${result.totalMs}ms`);

  return NextResponse.json(result);
}
