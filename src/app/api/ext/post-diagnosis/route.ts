import { NextRequest, NextResponse } from "next/server";
import { requireExtUser } from "../_shared";
import { diagnosePost, type DiagnosisInput } from "@/lib/post-diagnosis";
import { handleOptions, withCors } from "../_cors";

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  const auth = await requireExtUser(request);
  if ("response" in auth) return withCors(auth.response);

  let body: DiagnosisInput;
  try {
    body = await request.json();
  } catch {
    return withCors(
      NextResponse.json(
        { error: "잘못된 요청 형식입니다." },
        { status: 400 }
      )
    );
  }

  const { title, content, targetKeyword, imageCount, externalLinks } = body;

  if (
    typeof title !== "string" ||
    typeof content !== "string" ||
    typeof targetKeyword !== "string"
  ) {
    return withCors(
      NextResponse.json(
        { error: "title, content, targetKeyword는 필수입니다." },
        { status: 400 }
      )
    );
  }

  if (typeof imageCount !== "number") {
    return withCors(
      NextResponse.json(
        { error: "imageCount는 숫자여야 합니다." },
        { status: 400 }
      )
    );
  }

  if (!Array.isArray(externalLinks)) {
    return withCors(
      NextResponse.json(
        { error: "externalLinks는 배열이어야 합니다." },
        { status: 400 }
      )
    );
  }

  const results = diagnosePost({
    title,
    content,
    targetKeyword,
    imageCount,
    externalLinks,
  });
  const passCount = results.filter((r) => r.status === "pass").length;
  const overallScore = Math.round((passCount / results.length) * 100);

  return withCors(NextResponse.json({ results, overallScore }));
}
