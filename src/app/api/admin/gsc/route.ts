import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../_shared";
import { getSearchAnalytics } from "@/lib/gsc";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const dimensions = searchParams.get("dimensions")?.split(",") ?? ["query"];

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate, endDate 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const data = await getSearchAnalytics(startDate, endDate, dimensions);
  return NextResponse.json({ data });
}
