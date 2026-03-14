import { NextRequest, NextResponse } from "next/server";
import { requireExtUser } from "../_shared";
import { checkForbiddenWords } from "@/lib/naver-forbidden";
import { handleOptions, withCors } from "../_cors";

const MAX_KEYWORDS = 50;

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  const auth = await requireExtUser(request);
  if ("response" in auth) return withCors(auth.response);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(
      NextResponse.json(
        { error: "요청 본문을 파싱할 수 없습니다." },
        { status: 400 }
      )
    );
  }

  const { keywords } = body as { keywords?: unknown };

  if (!Array.isArray(keywords) || keywords.length === 0) {
    return withCors(
      NextResponse.json(
        { error: "keywords 배열이 필요합니다." },
        { status: 400 }
      )
    );
  }

  if (keywords.length > MAX_KEYWORDS) {
    return withCors(
      NextResponse.json(
        { error: `키워드는 최대 ${MAX_KEYWORDS}개까지 허용됩니다.` },
        { status: 400 }
      )
    );
  }

  const validKeywords = keywords.filter(
    (k): k is string => typeof k === "string" && k.trim().length > 0
  );

  if (validKeywords.length === 0) {
    return withCors(
      NextResponse.json({ error: "유효한 키워드가 없습니다." }, { status: 400 })
    );
  }

  const results = await checkForbiddenWords(validKeywords.map((k) => k.trim()));

  return withCors(NextResponse.json({ results }));
}
