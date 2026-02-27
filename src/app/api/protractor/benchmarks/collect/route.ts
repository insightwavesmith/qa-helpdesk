/**
 * POST /api/protractor/benchmarks/collect
 * 관리자 전용 벤치마크 수동 재수집 엔드포인트
 *
 * - requireProtractorAccess()로 인증 확인
 * - profile.role === 'admin'이 아니면 403 반환
 * - collect-benchmarks cron 엔드포인트를 내부 fetch로 호출
 */

import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../../_shared";

export async function POST() {
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "관리자 전용 기능입니다." },
      { status: 403 }
    );
  }

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const cronUrl = new URL("/api/cron/collect-benchmarks", baseUrl);

    const res = await fetch(cronUrl.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      // 최대 5분 (Vercel Pro 기준)
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
