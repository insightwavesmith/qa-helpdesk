import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding, generateAnswer } from "@/lib/gemini";

export const maxDuration = 60; // Vercel 서버리스 함수 타임아웃 (초)

export async function POST(request: NextRequest) {
  try {
    const { questionId, questionText } = await request.json();

    if (!questionId || !questionText) {
      return NextResponse.json(
        { error: "questionId와 questionText가 필요합니다." },
        { status: 400 }
      );
    }

    // 1. 질문 텍스트로 Gemini 임베딩 생성
    const embedding = await generateEmbedding(questionText);

    // 2. search_lecture_chunks RPC로 관련 청크 5개 검색
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: chunks, error: searchError } = await (supabase.rpc as any)(
      "search_lecture_chunks",
      {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.3,
        match_count: 5,
      }
    );

    if (searchError) {
      console.error("search_lecture_chunks RPC error:", searchError);
      return NextResponse.json(
        { error: "벡터 검색 실패" },
        { status: 500 }
      );
    }

    if (!chunks || chunks.length === 0) {
      console.log("관련 강의 청크를 찾지 못했습니다.");
      return NextResponse.json(
        { error: "관련 강의 내용을 찾지 못했습니다." },
        { status: 404 }
      );
    }

    // 3. 검색된 청크를 컨텍스트로 Gemini에 전달하여 답변 생성
    const contextTexts = chunks.map(
      (chunk: { content: string; lecture_name: string; week: string }) =>
        `[${chunk.week} - ${chunk.lecture_name}]\n${chunk.content}`
    );

    const aiAnswerText = await generateAnswer(questionText, contextTexts);

    // 4. 소스 참조 정보 저장
    const sourceRefs = chunks.map(
      (chunk: {
        id: string;
        lecture_name: string;
        week: string;
        similarity: number;
      }) => ({
        chunk_id: chunk.id,
        lecture_name: chunk.lecture_name,
        week: chunk.week,
        similarity: chunk.similarity,
      })
    );

    // 5. answers 테이블에 is_ai=true, is_approved=false로 저장
    const { data: answer, error: insertError } = await supabase
      .from("answers")
      .insert({
        question_id: questionId,
        content: aiAnswerText,
        is_ai: true,
        is_approved: false,
        author_id: null,
        source_refs: sourceRefs,
      })
      .select()
      .single();

    if (insertError) {
      console.error("AI 답변 저장 실패:", insertError);
      return NextResponse.json(
        { error: "AI 답변 저장 실패" },
        { status: 500 }
      );
    }

    // 6. 질문 상태를 answered로 변경
    await supabase
      .from("questions")
      .update({ status: "answered" })
      .eq("id", questionId);

    console.log(`AI 답변 생성 완료: question=${questionId}, answer=${answer.id}`);

    return NextResponse.json({ success: true, answerId: answer.id });
  } catch (error) {
    console.error("AI 답변 생성 중 오류:", error);
    return NextResponse.json(
      { error: "AI 답변 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
