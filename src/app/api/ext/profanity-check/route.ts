import { NextRequest, NextResponse } from "next/server";
import { requireExtUser } from "../_shared";
import { checkProfanity } from "@/lib/profanity-db";
import { handleOptions, withCors } from "../_cors";

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

  const { text } = body as { text?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    return withCors(
      NextResponse.json(
        { error: "text 필드가 필요합니다." },
        { status: 400 }
      )
    );
  }

  const results = checkProfanity(text);

  const hasDanger = results.some((r) => r.severity === "high");
  const hasWarning = results.some((r) => r.severity === "medium");

  return withCors(
    NextResponse.json({
      results,
      summary: {
        total: results.length,
        high: results.filter((r) => r.severity === "high").length,
        medium: results.filter((r) => r.severity === "medium").length,
        low: results.filter((r) => r.severity === "low").length,
        status: hasDanger ? "danger" : hasWarning ? "warning" : "safe",
      },
    })
  );
}
