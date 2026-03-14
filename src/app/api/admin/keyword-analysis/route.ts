import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../_shared";
import { getKeywordAnalysis } from "@/lib/naver-keyword";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  let body: { keyword?: unknown };
  try {
    body = (await request.json()) as { keyword?: unknown };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const keyword =
    typeof body.keyword === "string" ? body.keyword.trim() : "";

  if (!keyword) {
    return NextResponse.json(
      { error: "키워드를 입력해주세요." },
      { status: 400 },
    );
  }

  const result = await getKeywordAnalysis(keyword);

  return NextResponse.json(result);
}
