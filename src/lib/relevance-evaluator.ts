// 검색 결과 관련성 평가 — Stage 1→2 게이트
// RAG 결과가 질문에 관련 있는지 Sonnet으로 평가

import type { ChunkResult } from "@/lib/knowledge";
import type { DomainAnalysis } from "@/lib/domain-intelligence";

const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 10_000;

export type RelevanceGrade = "CORRECT" | "AMBIGUOUS" | "INCORRECT";

export interface RelevanceEvaluation {
  grade: RelevanceGrade;
  confidence: number;
  reasoning: string;
}

const RELEVANCE_PROMPT = `수강생 질문과 검색된 강의 자료 청크를 비교하여 관련성을 평가하세요.
JSON 외에 다른 텍스트를 포함하지 마세요.

평가 기준:
- CORRECT: 검색 결과가 질문에 직접 답변할 수 있는 내용 포함 (confidence >= 0.7)
- AMBIGUOUS: 관련은 있지만 직접 답변하기엔 부족하거나 부분적 (0.3 <= confidence < 0.7)
- INCORRECT: 검색 결과가 질문과 거의 무관 (confidence < 0.3)

JSON 형식:
{ "grade": "CORRECT|AMBIGUOUS|INCORRECT", "confidence": 0.0~1.0, "reasoning": "판단 근거 1-2문장" }`;

/**
 * RAG 검색 결과의 관련성 평가
 * 실패 시 기본값 CORRECT 반환 (평가 실패 시 RAG 결과 신뢰)
 */
export async function evaluateRelevance(
  question: string,
  domainAnalysis: DomainAnalysis | null,
  chunks: ChunkResult[]
): Promise<RelevanceEvaluation> {
  const defaultResult: RelevanceEvaluation = {
    grade: "CORRECT",
    confidence: 0.4,
    reasoning: "평가 실패 — RAG 결과 신뢰 (웹검색 불필요)",
  };

  if (chunks.length === 0) {
    return {
      grade: "INCORRECT",
      confidence: 0.0,
      reasoning: "검색 결과 없음",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return defaultResult;

  // 상위 5개 청크만 평가 (토큰 절약)
  const topChunks = chunks.slice(0, 5);
  const chunksText = topChunks
    .map(
      (c) =>
        `[${c.lecture_name} - ${c.week}] (유사도: ${Math.round(c.similarity * 100)}%)\n${c.content.slice(0, 300)}`
    )
    .join("\n---\n");

  const intent = domainAnalysis?.intent || question;

  const userPrompt = `질문: ${question}\n질문 의도: ${intent}\n\n검색된 자료:\n${chunksText}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        temperature: 0.1,
        system: RELEVANCE_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(
        "[RelevanceEvaluator] API error:",
        response.status
      );
      return defaultResult;
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    );
    const text = textBlock?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[RelevanceEvaluator] JSON not found");
      return defaultResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validGrades: RelevanceGrade[] = [
      "CORRECT",
      "AMBIGUOUS",
      "INCORRECT",
    ];
    const grade = validGrades.includes(parsed.grade)
      ? parsed.grade
      : "AMBIGUOUS";
    const confidence = Math.max(
      0,
      Math.min(1, Number(parsed.confidence) || 0.5)
    );

    return {
      grade,
      confidence,
      reasoning: String(parsed.reasoning || ""),
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[RelevanceEvaluator] 타임아웃 (10초)");
    } else {
      console.error("[RelevanceEvaluator] 실패:", error);
    }
    return defaultResult;
  }
}
