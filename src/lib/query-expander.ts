// T2: Query Expansion — Gemini Flash로 질문 확장
// 짧은 질문 스킵, 실패 시 원본만 반환 (Graceful Degradation)

import { generateFlashText, generateEmbedding } from "@/lib/gemini";

const MIN_QUERY_LENGTH = 10;

const EXPAND_PROMPT_TEMPLATE = `사용자가 메타(Facebook) 광고 관련 질문을 했습니다.
이 질문과 같은 주제를 다른 표현으로 검색할 수 있는 쿼리 2개를 생성하세요.

규칙:
- 줄임말을 풀어쓰거나, 반대로 줄임말로 변환 (CAPI ↔ Conversions API)
- 한국어↔영어 혼용 표현 (광고세트 ↔ ad set)
- 관련 개념으로 확장 (리타겟팅 → 맞춤 타겟)
- 원본 질문의 핵심 의도를 유지할 것

원본 질문: {query}

확장 쿼리 2개를 한 줄에 하나씩, 번호 없이 출력하세요:`;

/**
 * 질문을 확장하여 [원본, 확장1, 확장2] 반환
 * 10자 미만 또는 실패 시 [원본]만 반환
 */
export async function expandQuery(query: string): Promise<string[]> {
  if (query.length < MIN_QUERY_LENGTH) return [query];

  try {
    const prompt = EXPAND_PROMPT_TEMPLATE.replace("{query}", query);
    const response = await generateFlashText(prompt, {
      temperature: 0.3,
      maxTokens: 256,
    });

    if (!response) return [query];

    // 응답에서 확장 쿼리 추출 (줄 단위)
    const lines = response
      .split("\n")
      .map((l) => l.replace(/^[\d.\-*)\s]+/, "").trim())
      .filter((l) => l.length > 3 && l.length < 200);

    if (lines.length === 0) return [query];

    // 유사도 체크: 원본 대비 0.3 미만이면 버림
    const expanded = await filterByRelevance(query, lines.slice(0, 2));

    return [query, ...expanded];
  } catch (err) {
    console.error("[QueryExpander] Error, returning original:", err);
    return [query];
  }
}

/**
 * 확장 쿼리의 원본 대비 임베딩 유사도 체크
 * 0.3 미만이면 해당 확장 버림
 * 반환값: { queries, embeddings } — T3a에서 임베딩 재사용 가능
 */
async function filterByRelevance(
  originalQuery: string,
  candidates: string[]
): Promise<string[]> {
  if (candidates.length === 0) return [];

  try {
    const originalEmbedding = await generateEmbedding(originalQuery);
    const filtered: string[] = [];

    for (const candidate of candidates) {
      const candidateEmbedding = await generateEmbedding(candidate);
      const sim = cosineSimilarity(originalEmbedding, candidateEmbedding);

      if (sim >= 0.3) {
        filtered.push(candidate);
      } else {
        console.warn(
          `[QueryExpander] Dropped low-relevance query (sim=${sim.toFixed(2)}): "${candidate}"`
        );
      }
    }

    return filtered;
  } catch {
    // 유사도 체크 실패 시 전부 포함 (관대 처리)
    return candidates;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
