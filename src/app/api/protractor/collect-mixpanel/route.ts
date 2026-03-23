/**
 * POST /api/protractor/collect-mixpanel
 * 관리자 전용 매출데이터 수동 재수집 엔드포인트
 * — GCP Cloud Run 크론 서비스에 프록시
 */

import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

const GCP_CRON_URL =
  process.env.GCP_CRON_URL || "https://bscamp-cron-a4vkex7yiq-du.a.run.app";

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
    const res = await fetch(`${GCP_CRON_URL}/api/cron/collect-mixpanel`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      signal: AbortSignal.timeout(290_000),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return NextResponse.json(
        { error: (data.error as string) || "매출데이터 수집에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "매출데이터 재수집 완료 (GCP)",
      ...data,
    });
  } catch (e) {
    console.error("collect-mixpanel GCP proxy error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
