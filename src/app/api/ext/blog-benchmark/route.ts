import { NextRequest, NextResponse } from "next/server";
import { requireExtUser } from "../_shared";
import { benchmarkTopBlogs } from "@/lib/naver-blog-scraper";
import { handleOptions, withCors } from "../_cors";

const MAX_COUNT = 5;
const DEFAULT_COUNT = 3;

export function OPTIONS() {
  return handleOptions();
}

export async function GET(request: NextRequest) {
  const auth = await requireExtUser(request);
  if ("response" in auth) return withCors(auth.response);

  const searchParams = request.nextUrl.searchParams;
  const keyword = searchParams.get("keyword");

  if (!keyword || keyword.trim().length === 0) {
    return withCors(
      NextResponse.json(
        { error: "keyword 파라미터가 필요합니다." },
        { status: 400 }
      )
    );
  }

  const countParam = searchParams.get("count");
  let count = DEFAULT_COUNT;
  if (countParam !== null) {
    const parsed = parseInt(countParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      count = Math.min(parsed, MAX_COUNT);
    }
  }

  const result = await benchmarkTopBlogs(keyword.trim(), count);

  return withCors(NextResponse.json(result));
}
