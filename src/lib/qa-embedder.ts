// T1: QA 분리 임베딩 — 승인된 QA를 qa_question + qa_answer chunks로 분리 저장
// F-02 반영: 재승인 시 기존 chunks DELETE 후 재생성

import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding, generateVisionText } from "@/lib/gemini";
import { chunkText } from "@/lib/chunk-utils";

const VISION_PROMPT = `이 이미지는 메타(Facebook) 광고 관련 Q&A에 첨부된 이미지입니다.
이미지에 보이는 내용을 한국어로 설명하세요. 200~300자로 작성하세요.`;

/**
 * 승인된 QA 쌍을 knowledge_chunks에 분리 임베딩
 * 실패해도 throw하지 않음 (fire-and-forget 안전)
 */
export async function embedQAPair(
  questionId: string,
  answerId: string
): Promise<void> {
  try {
    const supabase = createServiceClient();

    // 1. 질문 + 답변 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: question } = await (supabase as any)
      .from("questions")
      .select("id, title, content, image_urls, category:qa_categories(slug)")
      .eq("id", questionId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: answer } = await (supabase as any)
      .from("answers")
      .select("id, content, image_urls, is_ai")
      .eq("id", answerId)
      .single();

    if (!question || !answer) {
      console.error(`[QAEmbed] Question or answer not found: q=${questionId}, a=${answerId}`);
      return;
    }

    // 2. F-02: 기존 chunks DELETE (재승인 대비)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("knowledge_chunks")
      .delete()
      .in("source_type", ["qa_question", "qa_answer"])
      .eq("metadata->>question_id", questionId);

    const lectureName = (question.title || "").slice(0, 50);
    const categorySlug = question.category?.slug || null;

    // 3. 질문 텍스트 구성 (이미지 설명 포함)
    let questionText = `${question.title}\n\n${question.content || ""}`;
    const qImageUrls: string[] = parseImageUrls(question.image_urls);
    if (qImageUrls.length > 0) {
      const desc = await getImageDescription(qImageUrls[0]);
      if (desc) questionText += `\n\n[이미지: ${desc}]`;
    }

    // 4. 답변 텍스트 구성 (이미지 설명 포함)
    let answerText = answer.content || "";
    const aImageUrls: string[] = parseImageUrls(answer.image_urls);
    if (aImageUrls.length > 0) {
      const desc = await getImageDescription(aImageUrls[0]);
      if (desc) answerText += `\n\n[이미지: ${desc}]`;
    }

    // 5. 질문 chunks 생성
    const qChunks = chunkText(questionText);
    let qCount = 0;
    for (let i = 0; i < qChunks.length; i++) {
      try {
        const embedding = await generateEmbedding(qChunks[i], { taskType: "RETRIEVAL_DOCUMENT" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("knowledge_chunks").insert({
          lecture_name: lectureName,
          week: "qa_question",
          chunk_index: i,
          content: qChunks[i],
          embedding_v2: embedding,
          source_type: "qa_question",
          priority: 2,
          chunk_total: qChunks.length,
          image_url: qImageUrls[0] || null,
          embedding_model_v2: process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview",
          metadata: { question_id: questionId, answer_id: answerId, category: categorySlug },
        });
        qCount++;
      } catch (err) {
        console.error(`[QAEmbed] Question chunk ${i} failed:`, err);
      }
    }

    // 6. 답변 chunks 생성
    const aChunks = chunkText(answerText);
    let aCount = 0;
    for (let i = 0; i < aChunks.length; i++) {
      try {
        const embedding = await generateEmbedding(aChunks[i], { taskType: "RETRIEVAL_DOCUMENT" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("knowledge_chunks").insert({
          lecture_name: lectureName,
          week: "qa_answer",
          chunk_index: i,
          content: aChunks[i],
          embedding_v2: embedding,
          source_type: "qa_answer",
          priority: 2,
          chunk_total: aChunks.length,
          image_url: aImageUrls[0] || null,
          embedding_model_v2: process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview",
          metadata: { question_id: questionId, answer_id: answerId, is_ai: answer.is_ai },
        });
        aCount++;
      } catch (err) {
        console.error(`[QAEmbed] Answer chunk ${i} failed:`, err);
      }
    }

    console.log(`[QAEmbed] questionId=${questionId}, q_chunks=${qCount}, a_chunks=${aCount}`);
  } catch (err) {
    console.error("[QAEmbed] Unexpected error:", err);
  }
}

/**
 * 꼬리질문 답변 승인 시: 원본 질문 전체 스레드를 하나의 맥락으로 임베딩
 * 스레드: 원본 질문 + 원본 답변 + 꼬리질문1 + 답변1 + 꼬리질문2 + 답변2 ...
 * source_type: "qa_thread"로 저장
 */
export async function embedQAThread(rootQuestionId: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    // 1. 원본 질문 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rootQuestion } = await (supabase as any)
      .from("questions")
      .select("id, title, content, image_urls, category:qa_categories(slug)")
      .eq("id", rootQuestionId)
      .single();

    if (!rootQuestion) {
      console.error(`[QAThread] Root question not found: ${rootQuestionId}`);
      return;
    }

    // 2. 원본 질문의 승인된 답변
    const { data: rootAnswers } = await supabase
      .from("answers")
      .select("id, content, is_ai")
      .eq("question_id", rootQuestionId)
      .eq("is_approved", true)
      .order("created_at", { ascending: true });

    // 3. 꼬리질문들 조회 (parent_question_id 컬럼 없으면 빈 배열)
    let followUps: { id: string; content: string; title: string }[] = [];
    try {
      const { data: fqs } = await supabase
        .from("questions")
        .select("id, title, content")
        .eq("parent_question_id", rootQuestionId)
        .order("created_at", { ascending: true });
      followUps = fqs || [];
    } catch {
      followUps = [];
    }

    // 4. 스레드 텍스트 구성
    const threadParts: string[] = [];

    // 원본 질문
    threadParts.push(`[질문] ${rootQuestion.title}\n${rootQuestion.content || ""}`);

    // 원본 답변들
    for (const ans of rootAnswers || []) {
      const label = ans.is_ai ? "[AI 답변]" : "[답변]";
      threadParts.push(`${label}\n${ans.content || ""}`);
    }

    // 꼬리질문 + 답변
    for (const fq of followUps) {
      threadParts.push(`[추가 질문] ${fq.content || ""}`);

      const { data: fqAnswers } = await supabase
        .from("answers")
        .select("id, content, is_ai")
        .eq("question_id", fq.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: true });

      for (const fqAns of fqAnswers || []) {
        const label = fqAns.is_ai ? "[AI 답변]" : "[답변]";
        threadParts.push(`${label}\n${fqAns.content || ""}`);
      }
    }

    const threadText = threadParts.join("\n\n---\n\n");

    // 5. 기존 qa_thread chunks 삭제 (이 rootQuestion에 대한 것만)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("knowledge_chunks")
      .delete()
      .eq("source_type", "qa_thread")
      .eq("metadata->>question_id", rootQuestionId);

    // 6. 청킹 + 임베딩
    const lectureName = (rootQuestion.title || "").slice(0, 50);
    const categorySlug = rootQuestion.category?.slug || null;
    const chunks = chunkText(threadText);
    let count = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i], { taskType: "RETRIEVAL_DOCUMENT" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("knowledge_chunks").insert({
          lecture_name: lectureName,
          week: "qa_thread",
          chunk_index: i,
          content: chunks[i],
          embedding_v2: embedding,
          source_type: "qa_thread",
          priority: 3, // 스레드는 개별 QA보다 높은 우선순위
          chunk_total: chunks.length,
          embedding_model_v2: process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview",
          metadata: {
            question_id: rootQuestionId,
            category: categorySlug,
            followup_count: followUps.length,
          },
        });
        count++;
      } catch (err) {
        console.error(`[QAThread] Chunk ${i} failed:`, err);
      }
    }

    console.log(`[QAThread] rootId=${rootQuestionId}, followups=${followUps.length}, chunks=${count}`);
  } catch (err) {
    console.error("[QAThread] Unexpected error:", err);
  }
}

function parseImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return [];
}

async function getImageDescription(imageUrl: string): Promise<string> {
  try {
    return await generateVisionText(imageUrl, VISION_PROMPT);
  } catch {
    return "";
  }
}
