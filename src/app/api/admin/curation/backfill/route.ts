import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_shared";
import { backfillAiSummary, backfillImportanceScore } from "@/actions/curation";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await req.json();
  const { type } = body as { type: string };

  if (type === "ai_summary") {
    const result = await backfillAiSummary();
    return NextResponse.json(result);
  }

  if (type === "importance_score") {
    const result = await backfillImportanceScore();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "유효하지 않은 타입입니다." }, { status: 400 });
}
