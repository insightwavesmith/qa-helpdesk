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
        const embedding = await generateEmbedding(qChunks[i]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("knowledge_chunks").insert({
          lecture_name: lectureName,
          week: "qa_question",
          chunk_index: i,
          content: qChunks[i],
          embedding,
          source_type: "qa_question",
          priority: 2,
          chunk_total: qChunks.length,
          image_url: qImageUrls[0] || null,
          embedding_model: "gemini-embedding-001",
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
        const embedding = await generateEmbedding(aChunks[i]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("knowledge_chunks").insert({
          lecture_name: lectureName,
          week: "qa_answer",
          chunk_index: i,
          content: aChunks[i],
          embedding,
          source_type: "qa_answer",
          priority: 2,
          chunk_total: aChunks.length,
          image_url: aImageUrls[0] || null,
          embedding_model: "gemini-embedding-001",
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
