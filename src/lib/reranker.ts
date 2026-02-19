// T1: Reranking — Gemini Flash로 질문-chunk 관련도 재평가
// timeout 2초, 실패 시 원본 반환 (Graceful Degradation)

import { generateFlashText } from "@/lib/gemini";
import type { ChunkResult } from "@/lib/knowledge";

const RERANK_TIMEOUT_MS = 2000;

const RERANK_PROMPT_TEMPLATE = `당신은 검색 결과의 관련성을 평가하는 전문가입니다.

질문: {query}

아래 {count}개의 문서가 위 질문에 답변하는 데 얼마나 관련 있는지 평가하세요.
각 문서에 대해 0.0(전혀 무관) ~ 1.0(정확히 답변) 점수를 매기세요.

반드시 JSON 배열로만 응답하세요. 다른 텍스트 없이 숫자 배열만.
예: [0.9, 0.3, 0.7, ...]

문서 목록:
{documents}

JSON 점수 배열:`;

/**
 * chunks를 질문 관련도 기준으로 재정렬
 * timeout 초과 또는 실패 시 원본 그대로 반환
 */
export async function rerankChunks(
  query: string,
  chunks: ChunkResult[],
  options?: { timeout?: number }
): Promise<ChunkResult[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= 3) return chunks; // 3개 이하면 reranking 불필요

  const timeoutMs = options?.timeout ?? RERANK_TIMEOUT_MS;

  try {
    const result = await Promise.race([
      doRerank(query, chunks),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result) {
      console.warn("[Reranker] Timeout, returning original order");
      return chunks;
    }

    return result;
  } catch (err) {
    console.error("[Reranker] Error, returning original order:", err);
    return chunks;
  }
}

async function doRerank(
  query: string,
  chunks: ChunkResult[]
): Promise<ChunkResult[]> {
  // 문서 목록 구성 (200자로 잘라서 토큰 절약)
  const documents = chunks
    .map((c, i) => `[${i}] ${c.content.slice(0, 200)}`)
    .join("\n\n");

  const prompt = RERANK_PROMPT_TEMPLATE
    .replace("{query}", query)
    .replace("{count}", String(chunks.length))
    .replace("{documents}", documents);

  const response = await generateFlashText(prompt, {
    temperature: 0.0,
    maxTokens: 256,
  });

  if (!response) return chunks;

  // 점수 파싱: JSON 우선, 실패 시 정규식
  const scores = parseScores(response, chunks.length);

  // 점수 부여 + 정렬
  const scored = chunks.map((chunk, i) => ({
    ...chunk,
    rerank_score: scores[i] ?? 0.5,
  }));

  scored.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
  return scored;
}

function parseScores(response: string, expectedCount: number): number[] {
  // 1차: JSON 배열 파싱
  try {
    const match = response.match(/\[[\d.,\s]+\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as number[];
      if (Array.isArray(parsed) && parsed.length >= expectedCount) {
        return parsed.slice(0, expectedCount).map((n) =>
          typeof n === "number" && !isNaN(n) ? Math.min(Math.max(n, 0), 1) : 0.5
        );
      }
    }
  } catch {
    // JSON 파싱 실패 → 정규식 fallback
  }

  // 2차: 정규식으로 숫자 추출
  const numbers = response.match(/[\d.]+/g);
  if (numbers && numbers.length >= expectedCount) {
    return numbers.slice(0, expectedCount).map((n) => {
      const val = parseFloat(n);
      return !isNaN(val) ? Math.min(Math.max(val, 0), 1) : 0.5;
    });
  }

  // 파싱 완전 실패 → 전부 0.5
  console.warn("[Reranker] Score parsing failed, using default 0.5");
  return new Array(expectedCount).fill(0.5);
}
