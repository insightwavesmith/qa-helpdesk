import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { runStyleLearning } from "@/lib/style-learner";

export async function POST() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const result = await runStyleLearning();

    return NextResponse.json({
      success: true,
      answerCount: result.answerCount,
      profile: result.profile,
      styleTextPreview: result.styleText.slice(0, 500),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("[style-learn] 실패:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
