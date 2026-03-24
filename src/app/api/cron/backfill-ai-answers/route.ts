/**
 * POST /api/admin/backfill-ai-answers
 * AI 답변이 없는 질문에 대해 AI 답변 생성
 * CRON_SECRET 또는 admin 쿠키 인증
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAIAnswerForQuestion } from "@/lib/rag";

export const maxDuration = 300; // 5분

export async function POST(request: NextRequest) {
  // CRON_SECRET 인증 (CLI 호출용)
  const authHeader = request.headers.get("Authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const svc = createServiceClient();

  // AI 답변이 없는 질문 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: questions, error: qErr } = await (svc.from("questions") as any)
    .select("id, title, content, image_urls")
    .is("parent_question_id", null)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // 이미 AI 답변이 있는 질문 ID 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aiAnswers } = await (svc.from("answers") as any)
    .select("question_id")
    .eq("is_ai", true);

  const answeredIds = new Set((aiAnswers ?? []).map((a: { question_id: string }) => a.question_id));

  // AI 답변이 없는 질문만 필터
  const unanswered = (questions ?? []).filter(
    (q: { id: string }) => !answeredIds.has(q.id)
  );

  if (unanswered.length === 0) {
    return NextResponse.json({ message: "AI 답변 생성 필요한 질문 없음", count: 0 });
  }

  const results: { id: string; title: string; success: boolean; error?: string }[] = [];

  for (const q of unanswered as { id: string; title: string; content: string; image_urls?: string[] }[]) {
    console.log(`[백필] AI 답변 생성 시작: ${q.id} "${q.title}"`);
    try {
      const success = await createAIAnswerForQuestion(
        q.id,
        q.title,
        q.content,
        q.image_urls
      );
      results.push({ id: q.id, title: q.title, success });
      console.log(`[백필] ${q.id} ${success ? "성공" : "실패"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: q.id, title: q.title, success: false, error: msg });
      console.error(`[백필] ${q.id} 예외:`, msg);
    }
  }

  const successCount = results.filter(r => r.success).length;
  return NextResponse.json({
    message: `${successCount}/${unanswered.length}건 AI 답변 생성 완료`,
    count: unanswered.length,
    successCount,
    results,
  });
}
