/**
 * POST /api/protractor/collect-daily
 * 관리자 전용 광고데이터 수동 재수집 엔드포인트
 */

import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

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

    const cronUrl = new URL("/api/cron/collect-daily", baseUrl);

    const res = await fetch(cronUrl.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      signal: AbortSignal.timeout(290_000),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return NextResponse.json(
        { error: (data.error as string) || "광고데이터 수집에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "광고데이터 재수집 완료",
      ...data,
    });
  } catch (e) {
    console.error("collect-daily error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
