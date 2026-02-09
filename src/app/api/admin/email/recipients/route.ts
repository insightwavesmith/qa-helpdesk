import { NextResponse } from "next/server";
import { getRecipientStats } from "@/actions/recipients";

export async function GET() {
  const { stats, error } = await getRecipientStats();

  if (error || !stats) {
    const status = error === "인증이 필요합니다." ? 401
      : error === "관리자 권한이 필요합니다." ? 403
      : 500;
    return NextResponse.json(
      { error: error || "수신자 조회 중 오류가 발생했습니다." },
      { status }
    );
  }

  return NextResponse.json(stats);
}
