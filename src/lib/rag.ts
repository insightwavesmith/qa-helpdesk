// RAG (Retrieval-Augmented Generation) 서비스
// 질문에 대해 강의 자료 기반 AI 답변 생성

import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding, generateAnswer } from "@/lib/gemini";

interface LectureChunk {
  id: string;
  lecture_name: string;
  week: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  similarity: number;
}

/**
 * 질문 텍스트로 관련 강의 청크 검색
 */
export async function searchRelevantChunks(
  questionText: string,
  limit: number = 5,
  threshold: number = 0.5
): Promise<LectureChunk[]> {
  const supabase = createServiceClient();
  
  // 질문 임베딩 생성
  const embedding = await generateEmbedding(questionText);
  
  // 벡터 유사도 검색 (RPC 함수 호출)
  const { data, error } = await supabase.rpc("match_lecture_chunks", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });
  
  if (error) {
    console.error("Vector search error:", error);
    return [];
  }
  
  return data || [];
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
    
    // 1. 관련 강의 청크 검색
    const chunks = await searchRelevantChunks(questionText, 5, 0.4);
    
    if (chunks.length === 0) {
      console.log("No relevant chunks found for question");
      // 청크가 없어도 일반 답변 시도
      const answer = await generateAnswer(questionText, [
        "강의 자료에서 직접적으로 관련된 내용을 찾지 못했습니다. 일반적인 메타 광고 지식을 바탕으로 답변드립니다.",
      ]);
      return {
        answer,
        sourceRefs: [],
      };
    }
    
    // 2. 청크 컨텐츠 추출
    const contextTexts = chunks.map(
      (chunk) =>
        `[${chunk.lecture_name} - ${chunk.week}]\n${chunk.content}`
    );
    
    // 3. AI 답변 생성
    const answer = await generateAnswer(questionText, contextTexts);
    
    // 4. 출처 참조 정보 생성
    const sourceRefs: SourceRef[] = chunks.map((chunk) => ({
      lecture_name: chunk.lecture_name,
      week: chunk.week,
      chunk_index: chunk.chunk_index,
      similarity: Math.round(chunk.similarity * 100) / 100,
    }));
    
    return { answer, sourceRefs };
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
    const { error } = await supabase.from("answers").insert({
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
    
    console.log(`AI answer created for question ${questionId}`);
    return true;
  } catch (error) {
    console.error("createAIAnswerForQuestion error:", error);
    return false;
  }
}
