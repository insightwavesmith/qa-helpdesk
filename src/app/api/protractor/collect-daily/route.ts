/**
 * POST /api/protractor/collect-daily
 * 관리자 전용 광고데이터 수동 재수집 엔드포인트
 * — 내부 fetch 대신 runCollectDaily()를 직접 호출하여 배포 URL 문제 제거
 */

import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";

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
    const data = await runCollectDaily();

    return NextResponse.json({
      success: true,
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
