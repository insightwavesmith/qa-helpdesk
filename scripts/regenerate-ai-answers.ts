#!/usr/bin/env npx tsx
/**
 * open 상태 질문의 AI 답변 재생성 스크립트
 * 사용법: DATABASE_URL="..." GEMINI_API_KEY="..." npx tsx scripts/regenerate-ai-answers.ts
 */

import { createAIAnswerForQuestion } from "../src/lib/rag";
import { createServiceClient } from "../src/lib/db";

async function main() {
  const supabase = createServiceClient();

  // open 상태 질문 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: questions, error } = await (supabase.from("questions") as any)
    .select("id, title, content, image_urls")
    .eq("status", "open")
    .is("parent_question_id", null)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("질문 조회 실패:", error.message);
    process.exit(1);
  }

  console.log(`\n=== open 질문 ${questions.length}개 AI 답변 재생성 시작 ===\n`);

  for (const q of questions) {
    console.log(`\n[질문] ${q.title} (${q.id})`);
    const imageUrls = Array.isArray(q.image_urls) ? q.image_urls : [];
    const success = await createAIAnswerForQuestion(
      q.id,
      q.title,
      q.content || "",
      imageUrls
    );
    console.log(`[결과] ${success ? "성공" : "실패"}`);
  }

  console.log("\n=== 재생성 완료 ===\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("스크립트 오류:", e);
  process.exit(1);
});
