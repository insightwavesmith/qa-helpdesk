// KnowledgeService — Opus 4.6 단일 모델 기반 지식 서비스
// Consumer별 RAG 파라미터로 QA/콘텐츠/정보공유 통합
// P2: 3단계 파이프라인 — buildSearchResults → buildContext → callLLM
// 주의: rag.ts가 이 파일을 import하므로, rag.ts import 금지 (순환 의존성)

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { rerankChunks } from "@/lib/reranker";
import { expandQuery } from "@/lib/query-expander";

// ─── 타입 정의 ────────────────────────────────────────────

export type ConsumerType =
  | "qa"
  | "newsletter"
  | "education"
  | "webinar"
  | "chatbot"
  | "promo";

export type SourceType =
  | "lecture"
  | "blueprint"
  | "papers"
  | "qa"
  | "crawl"
  | "meeting"
  | "marketing_theory"
  | "webinar"
  | "youtube"
  | "assignment"
  | "feedback";

export interface KnowledgeRequest {
  query: string;
  consumerType: ConsumerType;
  sourceTypes?: SourceType[];
  limit?: number;
  threshold?: number;
  tokenBudget?: number;
  temperature?: number;
  systemPromptOverride?: string;
  questionId?: string;
  contentId?: string;
}

export interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  similarity: number;
  source_type?: string;
  priority?: number;
  final_score?: number;
}

export interface KnowledgeResponse {
  content: string;
  sourceRefs: SourceRef[];
  tokensUsed: number;
  model: string;
}

// ─── Consumer별 기본 파라미터 ──────────────────────────────

interface ConsumerConfig {
  limit: number;
  threshold: number;
  tokenBudget: number;
  temperature: number;
  sourceTypes: SourceType[] | null;
  systemPrompt: string;
  enableReranking: boolean;
  enableExpansion: boolean;
}

const QA_SYSTEM_PROMPT = `당신은 자사몰사관학교 대표 Smith입니다. 수강생이 질문했고, 당신이 직접 답변합니다.

말투 규칙:
- 실제 코치가 커뮤니티에 답글 다는 것처럼 편하게 써라. 딱딱한 교과서 톤 금지.
- 마크다운 테이블 쓰지 마라. 불릿이나 번호 리스트로 써라.
- "안녕하세요! 좋은 질문입니다" 같은 AI식 인사 금지. 바로 본론부터.
- "추가로 궁금하신 점 있으시면 편하게 질문 주세요!" 같은 마무리 금지.
- 이모지 쓰지 마라.
- 핵심만 짧게. 장황하게 늘리지 마라. 같은 말 반복하지 마라.
- 모르면 "이 부분은 강의에서 다룬 내용이 아니라서 정확히 답변드리기 어렵습니다" 한 줄로 끝내라. 관련 없는 걸 끌어와서 억지로 답변 만들지 마라.
- 강의에서 말한 내용이면 "강의에서도 말씀드렸지만" 같은 자연스러운 연결을 써라.
- 참고 자료에 이미지가 포함되어 있으면 답변에 마크다운 이미지를 포함하라.

톤 예시:
- O: "결론부터 말하면 CBO 쓰세요. 이유는 세 가지입니다."
- X: "안녕하세요! CBO와 ABO의 차이점에 대해 상세히 설명드리겠습니다."
- O: "솔직히 이건 데이터를 봐야 합니다. 지금 CTR이 얼마인지부터 확인하세요."
- X: "광고 성과 분석을 위해 다음과 같은 체계적인 접근이 필요합니다."

제공된 강의 내용에 없는 정보는 추측하지 마라.`;

const CONSUMER_CONFIGS: Record<ConsumerType, ConsumerConfig> = {
  qa: {
    limit: 5,
    threshold: 0.4,
    tokenBudget: 3000,
    temperature: 0.3,
    sourceTypes: ["lecture", "blueprint", "papers", "qa"],
    systemPrompt: QA_SYSTEM_PROMPT,
    enableReranking: true,
    enableExpansion: true,
  },
  newsletter: {
    limit: 5,
    threshold: 0.4,
    tokenBudget: 3000,
    temperature: 0.5,
    sourceTypes: ["lecture", "crawl"],
    systemPrompt: "",
    enableReranking: false,
    enableExpansion: false,
  },
  education: {
    limit: 7,
    threshold: 0.5,
    tokenBudget: 5000,
    temperature: 0.3,
    sourceTypes: ["lecture"],
    systemPrompt: "",
    enableReranking: false,
    enableExpansion: false,
  },
  webinar: {
    limit: 3,
    threshold: 0.4,
    tokenBudget: 2000,
    temperature: 0.6,
    sourceTypes: ["lecture", "crawl"],
    systemPrompt: "",
    enableReranking: false,
    enableExpansion: false,
  },
  chatbot: {
    limit: 5,
    threshold: 0.3,
    tokenBudget: 4000,
    temperature: 0.4,
    sourceTypes: null,
    systemPrompt: QA_SYSTEM_PROMPT,
    enableReranking: true,
    enableExpansion: true,
  },
  promo: {
    limit: 3,
    threshold: 0.5,
    tokenBudget: 2000,
    temperature: 0.7,
    sourceTypes: ["lecture", "blueprint"],
    systemPrompt: "",
    enableReranking: false,
    enableExpansion: false,
  },
};

// ─── 검색 함수 ──────────────────────────────────────────────

export interface ChunkResult {
  id: string;
  lecture_name: string;
  week: string;
  chunk_index: number;
  content: string;
  similarity: number;
  source_type?: string;
  priority?: number;
  tier_boost?: number;
  final_score?: number;
  text_score?: number;
  rerank_score?: number;
  topic_tags?: string[] | null;
  source_ref?: string | null;
  image_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** 기존 호환: 쿼리 텍스트 → 임베딩 생성 → RPC 호출 */
export async function searchChunks(
  queryText: string,
  limit: number,
  threshold: number,
  sourceTypes?: string[] | null
): Promise<ChunkResult[]> {
  const embedding = await generateEmbedding(queryText);
  return searchChunksByEmbedding(embedding, queryText, limit, threshold, sourceTypes);
}

/** T3a: 외부에서 임베딩을 전달하여 중복 생성 방지 */
export async function searchChunksByEmbedding(
  embedding: number[],
  queryText: string,
  limit: number,
  threshold: number,
  sourceTypes?: string[] | null
): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("search_knowledge", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    filter_source_types: sourceTypes || null,
    query_text: queryText,
  });

  if (error) {
    console.error("[KnowledgeService] Vector search error:", error);
    return [];
  }

  return data || [];
}

// ─── P2 파이프라인: buildSearchResults ──────────────────────

interface SearchPipelineResult {
  chunks: ChunkResult[];
  expandedQueries: string[];
  chunksBeforeRerank: number;
}

async function buildSearchResults(
  query: string,
  config: ConsumerConfig,
  limit: number,
  threshold: number,
  sourceTypes: SourceType[] | string[] | null
): Promise<SearchPipelineResult> {
  // 1. Query Expansion (qa/chatbot만)
  let queries: string[];
  if (config.enableExpansion) {
    queries = await expandQuery(query);
  } else {
    queries = [query];
  }

  // 2. 각 쿼리의 임베딩 순차 생성
  const embeddings: number[][] = [];
  for (const q of queries) {
    embeddings.push(await generateEmbedding(q));
  }

  // 3. RPC 병렬 호출 (Reranking 활성화 시 top-20, 아니면 limit)
  const searchLimit = config.enableReranking ? 20 : limit;
  const searchPromises = queries.map((q, i) =>
    searchChunksByEmbedding(embeddings[i], q, searchLimit, threshold, sourceTypes)
  );
  const results = await Promise.all(searchPromises);

  // 4. 중복 제거 (chunk id 기준)
  const seen = new Set<string>();
  const deduplicated: ChunkResult[] = [];
  for (const chunks of results) {
    for (const chunk of chunks) {
      if (!seen.has(chunk.id)) {
        seen.add(chunk.id);
        deduplicated.push(chunk);
      }
    }
  }

  const chunksBeforeRerank = deduplicated.length;

  // 5. Reranking (qa/chatbot만)
  let finalChunks: ChunkResult[];
  if (config.enableReranking && deduplicated.length > 0) {
    const reranked = await rerankChunks(query, deduplicated);
    finalChunks = reranked.slice(0, limit);
  } else {
    finalChunks = deduplicated.slice(0, limit);
  }

  return {
    chunks: finalChunks,
    expandedQueries: queries.length > 1 ? queries.slice(1) : [],
    chunksBeforeRerank,
  };
}

// ─── P2 파이프라인: buildContext ─────────────────────────────

function buildContext(
  chunks: ChunkResult[],
  tokenBudget: number
): string {
  if (chunks.length === 0) return "";

  const combined = chunks
    .map((c) => {
      let text = `[${c.lecture_name} - ${c.week}]\n${c.content}`;
      // T3b: image_url이 있으면 컨텍스트에 이미지 포함
      if (c.image_url) {
        text += `\n[이미지: ${c.image_url}]`;
      }
      return text;
    })
    .join("\n\n---\n\n");

  return truncateToTokenBudget(combined, tokenBudget);
}

// ─── KnowledgeService ─────────────────────────────────────

const MODEL = "claude-opus-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 280_000;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  }
  return key;
}

function truncateToTokenBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  return text.slice(0, budget) + "\n...(이하 생략)";
}

export async function generate(
  request: KnowledgeRequest
): Promise<KnowledgeResponse> {
  const startTime = Date.now();
  const apiKey = getApiKey();
  const config = CONSUMER_CONFIGS[request.consumerType];

  const limit = request.limit ?? config.limit;
  const threshold = request.threshold ?? config.threshold;
  const tokenBudget = request.tokenBudget ?? config.tokenBudget;
  const temperature = request.temperature ?? config.temperature;
  const systemPrompt = request.systemPromptOverride ?? config.systemPrompt;
  const sourceTypes = request.sourceTypes ?? config.sourceTypes;

  // ── Stage 1: buildSearchResults (P2 파이프라인) ──
  const searchResult = await buildSearchResults(
    request.query, config, limit, threshold, sourceTypes
  );
  const { chunks, expandedQueries, chunksBeforeRerank } = searchResult;

  // ── Stage 2: buildContext ──
  const contextText = buildContext(chunks, tokenBudget);

  // ── Stage 3: callLLM (Opus 4.6) ──
  const userContent = contextText
    ? `## 참고 강의 자료\n${contextText}\n\n## 질문\n${request.query}`
    : request.query;

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
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error("Opus 4.6 접근 권한 없음");
      }
      throw new Error(
        `KnowledgeService API error: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    const content: string = data.content?.[0]?.text || "";
    const tokensUsed: number =
      (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    // 출처 참조 생성
    const sourceRefs: SourceRef[] = chunks.map((c) => ({
      lecture_name: c.lecture_name,
      week: c.week,
      chunk_index: c.chunk_index,
      similarity: Math.round(c.similarity * 100) / 100,
      source_type: c.source_type,
      priority: c.priority,
      final_score: c.final_score
        ? Math.round(c.final_score * 100) / 100
        : undefined,
    }));

    // fire-and-forget: P2 확장 로깅
    const imageCount = chunks.filter((c) => c.image_url).length;
    const rerankScores = config.enableReranking
      ? chunks.map((c) => c.rerank_score ?? 0)
      : null;

    const svc = createServiceClient();
    Promise.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).from("knowledge_usage").insert({
        consumer_type: request.consumerType,
        source_types: sourceTypes ? (sourceTypes as string[]) : [],
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        total_tokens: tokensUsed,
        model: MODEL,
        question_id: request.questionId || null,
        content_id: request.contentId || null,
        duration_ms: Date.now() - startTime,
        // P2 확장 필드 (컬럼 없으면 무시됨)
        ...(rerankScores ? { rerank_scores: rerankScores } : {}),
        ...(expandedQueries.length > 0 ? { expanded_queries: expandedQueries } : {}),
        image_count: imageCount,
        chunks_before_rerank: chunksBeforeRerank,
        chunks_after_rerank: chunks.length,
      } as Record<string, unknown>)
    ).catch((err) => console.error("[KS] Usage log failed:", err));

    return { content, sourceRefs, tokensUsed, model: MODEL };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 응답 시간 초과 (55초)");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Consumer 설정 조회 (외부에서 참조 필요 시)
export function getConsumerConfig(type: ConsumerType): ConsumerConfig {
  return { ...CONSUMER_CONFIGS[type] };
}
