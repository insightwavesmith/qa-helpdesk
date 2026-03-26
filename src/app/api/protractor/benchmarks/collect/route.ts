/**
 * POST /api/protractor/benchmarks/collect
 * 관리자 전용 벤치마크 수동 재수집 엔드포인트
 *
 * - requireProtractorAccess()로 인증 확인
 * - profile.role === 'admin'이 아니면 403 반환
 * - body 없음: collect-benchmarks cron 엔드포인트를 내부 fetch로 호출
 * - body 있음(BenchmarkSeedRequest): prescription_benchmarks에 직접 upsert
 */

import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess } from "../../_shared";
import type { BenchmarkSeedRequest } from "@/types/prescription";

export async function POST(req: NextRequest) {
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "관리자 전용 기능입니다." },
      { status: 403 }
    );
  }

  // body가 있으면 BenchmarkSeedRequest 처리 (prescription_benchmarks upsert)
  let body: BenchmarkSeedRequest | null = null;
  try {
    const raw = await req.text();
    if (raw && raw.trim().length > 2) {
      body = JSON.parse(raw) as BenchmarkSeedRequest;
    }
  } catch {
    // body 파싱 실패 → 기존 cron 트리거 모드로 진행
  }

  if (body) {
    return handleBenchmarkSeed(auth.svc, body);
  }

  // 기존 로직: collect-benchmarks cron 엔드포인트 호출
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bscamp.app";
    const cronUrl = new URL("/api/cron/collect-benchmarks", baseUrl);

    const res = await fetch(cronUrl.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      // 최대 5분 (Cloud Run 기준)
      signal: AbortSignal.timeout(290_000),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return NextResponse.json(
        { error: (data.error as string) || "벤치마크 수집에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "벤치마크 재수집 완료",
      ...data,
    });
  } catch (e) {
    console.error("benchmarks/collect error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * BenchmarkSeedRequest 처리: prescription_benchmarks 테이블에 upsert
 */
async function handleBenchmarkSeed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  body: BenchmarkSeedRequest
) {
  const { source, media_type, category, period, metrics } = body;

  if (!source || !period || !metrics) {
    return NextResponse.json(
      { error: "source, period, metrics 필드가 필요합니다." },
      { status: 400 }
    );
  }

  const rows = Object.entries(metrics).map(([metric, dist]) => ({
    source,
    media_type: media_type ?? null,
    category: category ?? null,
    metric,
    p10: dist.p10,
    p25: dist.p25,
    p50: dist.p50,
    p75: dist.p75,
    p90: dist.p90,
    sample_count: dist.sample_count,
    period,
    updated_at: new Date().toISOString(),
  }));

  let upserted = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const { error } = await svc
        .from("prescription_benchmarks")
        .upsert(row, {
          onConflict: "source,media_type,category,metric,period",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error("[benchmark-seed] upsert error:", error);
        errors++;
      } else {
        upserted++;
      }
    } catch (e) {
      console.error("[benchmark-seed] row error:", e);
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Motion 글로벌 벤치마크 시드 완료`,
    upserted,
    errors,
    source,
    period,
    metrics_count: rows.length,
  });
}
