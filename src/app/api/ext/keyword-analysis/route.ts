import { NextRequest, NextResponse } from "next/server";
import { requireExtUser } from "../_shared";
import { getKeywordAnalysis } from "@/lib/naver-keyword";
import { handleOptions, withCors } from "../_cors";

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  const auth = await requireExtUser(request);
  if ("response" in auth) return withCors(auth.response);

  let body: { keyword?: unknown };
  try {
    body = (await request.json()) as { keyword?: unknown };
  } catch {
    return withCors(
      NextResponse.json(
        { error: "잘못된 요청 형식입니다." },
        { status: 400 }
      )
    );
  }

  const keyword =
    typeof body.keyword === "string" ? body.keyword.trim() : "";

  if (!keyword) {
    return withCors(
      NextResponse.json(
        { error: "키워드를 입력해주세요." },
        { status: 400 }
      )
    );
  }

  const result = await getKeywordAnalysis(keyword);

  return withCors(NextResponse.json(result));
}
