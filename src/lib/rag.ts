// RAG (Retrieval-Augmented Generation) 서비스
// 질문에 대해 강의 자료 기반 AI 답변 생성

import { createServiceClient } from "@/lib/supabase/server";
import {
  generate as ksGenerate,
  searchChunks,
  type ChunkResult,
  type SourceRef,
} from "@/lib/knowledge";

export type LectureChunk = ChunkResult;

/**
 * 질문 텍스트로 관련 강의 청크 검색 (search_knowledge RPC)
 */
export async function searchRelevantChunks(
  questionText: string,
  limit: number = 5,
  threshold: number = 0.5,
  sourceTypes?: string[]
): Promise<LectureChunk[]> {
  return searchChunks(questionText, limit, threshold, sourceTypes);
}

/**
 * 질문에 대한 AI 답변 생성 (RAG 기반)
 */
export async function generateRAGAnswer(
  questionTitle: string,
  questionContent: string
): Promise<{ answer: string; sourceRefs: SourceRef[] } | null> {
  try {
    const questionText = `${questionTitle}\n\n${questionContent}`;

    // KnowledgeService (Opus 4.6) 위임
    const result = await ksGenerate({
      query: questionText,
      consumerType: "qa",
    });

    return {
      answer: result.content,
      sourceRefs: result.sourceRefs,
    };
  } catch (error) {
    console.error("RAG answer generation error:", error);
    return null;
  }
}

/**
 * 질문에 AI 답변 생성 및 저장
 * 질문 생성 후 호출됨
 */
export async function createAIAnswerForQuestion(
  questionId: string,
  questionTitle: string,
  questionContent: string
): Promise<boolean> {
  const supabase = createServiceClient();
  
  try {
    // RAG 기반 답변 생성
    const result = await generateRAGAnswer(questionTitle, questionContent);
    
    if (!result) {
      console.error("Failed to generate AI answer for question:", questionId);
      return false;
    }
    
    // AI 답변 저장 (승인 대기 상태)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("answers") as any).insert({
      question_id: questionId,
      author_id: null, // AI 답변
      content: result.answer,
      is_ai: true,
      is_approved: false, // 관리자 승인 필요
      source_refs: result.sourceRefs,
    });
    
    if (error) {
      console.error("Failed to save AI answer:", error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("createAIAnswerForQuestion error:", error);
    return false;
  }
}
