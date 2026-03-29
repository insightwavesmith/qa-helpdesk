/**
 * AI 답변 전체 재생성 스크립트
 *
 * 1. DB에서 is_ai=true인 기존 AI 답변의 question_id 목록 조회
 * 2. 각 question_id의 질문 정보 조회 (title, content, image_urls)
 * 3. 기존 AI 답변 DELETE
 * 4. createAIAnswerForQuestion 호출 (Gemini Thinking 모드)
 * 5. 답변 간 3초 딜레이 (Gemini API rate limit)
 * 6. 결과 보고
 *
 * 실행:
 *   npx tsx scripts/regen-ai-answers.ts
 *   npx tsx scripts/regen-ai-answers.ts --dry-run   # 삭제/생성 없이 대상 목록만 출력
 */

import { join } from "path";
import { Pool } from "pg";

// .env.local 로드 (rag/gemini 모듈 import 전에 먼저 실행)
const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
dotenv.config({ path: join(process.cwd(), ".env.local") });

// ────────────────────────────────────────────────────────────────────────────────
// 설정
// ────────────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_MS = 3000; // Gemini API rate limit 방지 (3초)

interface Question {
  id: string;
  title: string;
  content: string;
  image_urls: string[] | null;
}

// ────────────────────────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[ERROR] DATABASE_URL 환경변수가 없습니다. .env.local을 확인하세요.");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("[ERROR] GEMINI_API_KEY 환경변수가 없습니다. .env.local을 확인하세요.");
    process.exit(1);
  }

  console.log(`\n=== AI 답변 전체 재생성 스크립트 ===`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.slice(0, 30)}...`);
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "설정됨" : "없음"}\n`);

  // rag 모듈은 dotenv 로드 후 dynamic import — 모듈 레벨 GEMINI_API_KEY 상수가 env 세팅 후 읽히도록
  const { createAIAnswerForQuestion } = await import("@/lib/rag");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_URL.includes("/cloudsql/")
      ? undefined
      : { rejectUnauthorized: false },
  });

  try {
    // 1단계: is_ai=true 답변의 question_id 목록 조회
    console.log("[1/4] is_ai=true 기존 AI 답변 question_id 조회...");
    const aiAnswersResult = await pool.query<{ question_id: string }>(
      `SELECT DISTINCT question_id FROM answers WHERE is_ai = true ORDER BY question_id`
    );
    const aiQuestionIds = aiAnswersResult.rows.map((r) => r.question_id);
    console.log(`  → ${aiQuestionIds.length}개 질문에 AI 답변 존재\n`);

    if (aiQuestionIds.length === 0) {
      console.log("재생성할 AI 답변이 없습니다.");
      return;
    }

    // 2단계: 각 question_id의 질문 정보 조회
    console.log("[2/4] 질문 정보 조회...");
    const placeholders = aiQuestionIds.map((_, i) => `$${i + 1}`).join(", ");
    const questionsResult = await pool.query<Question>(
      `SELECT id, title, content, image_urls
       FROM questions
       WHERE id IN (${placeholders})
       ORDER BY created_at ASC`,
      aiQuestionIds
    );
    const questions = questionsResult.rows;
    console.log(`  → ${questions.length}개 질문 조회 완료\n`);

    if (DRY_RUN) {
      console.log("[DRY-RUN] 삭제/재생성하지 않고 대상 목록만 출력:\n");
      questions.forEach((q, i) => {
        console.log(`  ${i + 1}. [${q.id}] ${q.title?.slice(0, 50) ?? "(제목없음)"}`);
      });
      console.log(`\n총 ${questions.length}건. DRY-RUN 완료.`);
      return;
    }

    // 3단계: 기존 AI 답변 전체 DELETE
    console.log("[3/4] 기존 AI 답변 삭제...");
    const deleteResult = await pool.query(
      `DELETE FROM answers WHERE is_ai = true`
    );
    console.log(`  → ${deleteResult.rowCount}건 삭제 완료\n`);

    // 4단계: 각 질문에 AI 답변 재생성
    console.log(`[4/4] AI 답변 재생성 시작 (${questions.length}건, 답변 간 ${DELAY_MS / 1000}초 딜레이)...\n`);

    const results: { id: string; title: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const prefix = `[${i + 1}/${questions.length}]`;
      const shortTitle = q.title?.slice(0, 40) ?? "(제목없음)";

      console.log(`${prefix} 시작: "${shortTitle}" (${q.id})`);

      try {
        const success = await createAIAnswerForQuestion(
          q.id,
          q.title ?? "",
          q.content ?? "",
          q.image_urls ?? undefined
        );
        results.push({ id: q.id, title: shortTitle, success });
        console.log(`${prefix} ${success ? "성공" : "실패"}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: q.id, title: shortTitle, success: false, error: msg });
        console.error(`${prefix} 예외: ${msg}\n`);
      }

      // 마지막 항목은 딜레이 불필요
      if (i < questions.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    // 결과 요약
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    console.log("\n=== 결과 요약 ===");
    console.log(`성공: ${successCount}건`);
    console.log(`실패: ${failCount}건`);

    if (failCount > 0) {
      console.log("\n실패 목록:");
      results
        .filter((r) => !r.success)
        .forEach((r) => console.log(`  - [${r.id}] ${r.title}: ${r.error ?? "실패"}`));
    }

    // source_refs 저장 확인 (첫 번째 성공한 답변 샘플 확인)
    const firstSuccessId = results.find((r) => r.success)?.id;
    if (firstSuccessId) {
      console.log("\n[source_refs 확인] 첫 번째 성공 답변 샘플:");
      const sampleResult = await pool.query<{ id: string; source_refs: unknown }>(
        `SELECT id, source_refs FROM answers WHERE question_id = $1 AND is_ai = true LIMIT 1`,
        [firstSuccessId]
      );
      if (sampleResult.rows.length > 0) {
        const sample = sampleResult.rows[0];
        const sourceRefs = sample.source_refs;
        const isArray = Array.isArray(sourceRefs);
        console.log(`  answer_id: ${sample.id}`);
        console.log(`  source_refs type: ${typeof sourceRefs} (Array: ${isArray})`);
        console.log(`  source_refs 개수: ${isArray ? (sourceRefs as unknown[]).length : "N/A"}`);
        if (isArray && (sourceRefs as unknown[]).length > 0) {
          console.log(`  첫 번째 ref: ${JSON.stringify((sourceRefs as unknown[])[0])}`);
        }
      }
    }

    console.log("\n완료.");
  } finally {
    await pool.end();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[FATAL]", err instanceof Error ? err.message : err);
  process.exit(1);
});
