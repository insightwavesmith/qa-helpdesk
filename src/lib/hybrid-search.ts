// Stage 1 개선: Hybrid Search — 벡터 검색 + BM25 키워드 검색 결합
// RRF (Reciprocal Rank Fusion)으로 두 결과를 결합

import { generateEmbedding } from "@/lib/gemini";
import { searchChunksByEmbedding, type ChunkResult } from "@/lib/knowledge";
import { rerankChunks } from "@/lib/reranker";
import { createServiceClient } from "@/lib/db";

export interface HybridSearchOptions {
  queries: string[];
  embedding: number[];
  limit: number;
  threshold: number;
  sourceTypes: string[] | null;
  enableReranking: boolean;
}

export interface HybridSearchResult {
  chunks: ChunkResult[];
  vectorCount: number;
  bm25Count: number;
  finalCount: number;
}

const RRF_K = 60; // RRF 상수

/**
 * BM25 키워드 검색 (search_knowledge_bm25 RPC)
 * RPC가 없으면 빈 배열 반환 (graceful degradation)
 */
async function searchBM25(
  queryText: string,
  matchCount: number,
  filterSourceTypes: string[] | null
): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      "search_knowledge_bm25",
      {
        query_text: queryText,
        match_count: matchCount,
        filter_source_types: filterSourceTypes || null,
      }
    );

    if (error) {
      // RPC가 아직 없으면 조용히 빈 배열 반환
      if (
        error.message?.includes("function") &&
        error.message?.includes("does not exist")
      ) {
        console.warn(
          "[HybridSearch] search_knowledge_bm25 RPC 미존재, BM25 스킵"
        );
        return [];
      }
      console.error("[HybridSearch] BM25 search error:", error);
      return [];
    }

    // BM25 결과를 ChunkResult 형태로 변환
    return (data || []).map(
      (row: {
        id: string;
        lecture_name: string;
        week: string;
        chunk_index: number;
        content: string;
        source_type?: string;
        priority?: number;
        image_url?: string;
        metadata?: Record<string, unknown>;
        text_score: number;
      }) => ({
        id: row.id,
        lecture_name: row.lecture_name,
        week: row.week,
        chunk_index: row.chunk_index,
        content: row.content,
        source_type: row.source_type,
        priority: row.priority,
        image_url: row.image_url,
        metadata: row.metadata,
        similarity: 0, // BM25에는 벡터 유사도 없음
        text_score: row.text_score,
      })
    );
  } catch (err) {
    console.error("[HybridSearch] BM25 exception:", err);
    return [];
  }
}

/**
 * RRF (Reciprocal Rank Fusion) 스코어 계산
 * 여러 랭킹 리스트를 하나로 결합
 */
function computeRRFScores(
  vectorResults: ChunkResult[],
  bm25Results: ChunkResult[],
  vectorWeight: number = 0.6,
  bm25Weight: number = 0.4
): Map<string, { chunk: ChunkResult; rrfScore: number }> {
  const scores = new Map<
    string,
    { chunk: ChunkResult; rrfScore: number }
  >();

  // 벡터 검색 결과
  vectorResults.forEach((chunk, rank) => {
    const score = vectorWeight * (1 / (RRF_K + rank + 1));
    const existing = scores.get(chunk.id);
    if (existing) {
      existing.rrfScore += score;
    } else {
      scores.set(chunk.id, { chunk, rrfScore: score });
    }
  });

  // BM25 결과
  bm25Results.forEach((chunk, rank) => {
    const score = bm25Weight * (1 / (RRF_K + rank + 1));
    const existing = scores.get(chunk.id);
    if (existing) {
      existing.rrfScore += score;
    } else {
      scores.set(chunk.id, { chunk, rrfScore: score });
    }
  });

  return scores;
}

/**
 * Hybrid Search: 벡터 검색 + BM25 검색 결합
 */
export async function hybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult> {
  const {
    queries,
    embedding,
    limit,
    threshold,
    sourceTypes,
    enableReranking,
  } = options;

  // 1. 벡터 검색 — 각 쿼리별 (Reranking 시 top-20)
  const searchLimit = enableReranking ? 20 : limit;

  // 첫 번째 쿼리는 이미 임베딩이 있으므로 재사용
  const vectorPromises: Promise<ChunkResult[]>[] = [
    searchChunksByEmbedding(
      embedding,
      queries[0],
      searchLimit,
      threshold,
      sourceTypes
    ),
  ];

  // 나머지 쿼리들 (Stage 0의 suggestedSearchQueries)
  for (let i = 1; i < queries.length; i++) {
    vectorPromises.push(
      (async () => {
        const emb = await generateEmbedding(queries[i], { taskType: "RETRIEVAL_QUERY" });
        return searchChunksByEmbedding(
          emb,
          queries[i],
          searchLimit,
          threshold,
          sourceTypes
        );
      })()
    );
  }

  // 2. BM25 검색 — 각 쿼리별
  const bm25Promises = queries.map((q) =>
    searchBM25(q, searchLimit, sourceTypes)
  );

  // 3. 병렬 실행
  const [vectorResultArrays, bm25ResultArrays] = await Promise.all([
    Promise.all(vectorPromises),
    Promise.all(bm25Promises),
  ]);

  // 4. 각 결과 병합 (중복 제거)
  const vectorSeen = new Set<string>();
  const allVectorResults: ChunkResult[] = [];
  for (const results of vectorResultArrays) {
    for (const chunk of results) {
      if (!vectorSeen.has(chunk.id)) {
        vectorSeen.add(chunk.id);
        allVectorResults.push(chunk);
      }
    }
  }

  const bm25Seen = new Set<string>();
  const allBM25Results: ChunkResult[] = [];
  for (const results of bm25ResultArrays) {
    for (const chunk of results) {
      if (!bm25Seen.has(chunk.id)) {
        bm25Seen.add(chunk.id);
        allBM25Results.push(chunk);
      }
    }
  }

  // 5. RRF 스코어 결합
  const rrfMap = computeRRFScores(allVectorResults, allBM25Results);

  // 6. RRF 스코어 기준 정렬
  const sorted = [...rrfMap.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ chunk, rrfScore }) => ({
      ...chunk,
      final_score: rrfScore,
    }));

  // 7. Reranking (선택적)
  let finalChunks: ChunkResult[];
  if (enableReranking && sorted.length > 0) {
    const reranked = await rerankChunks(queries[0], sorted);
    finalChunks = reranked.slice(0, limit);
  } else {
    finalChunks = sorted.slice(0, limit);
  }

  return {
    chunks: finalChunks,
    vectorCount: allVectorResults.length,
    bm25Count: allBM25Results.length,
    finalCount: finalChunks.length,
  };
}
