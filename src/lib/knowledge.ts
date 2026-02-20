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
  | "qa_question"
  | "qa_answer"
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
  imageDescriptions?: string;
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
  model: string;
  enableThinking: boolean;
  thinkingBudget: number;
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

제공된 강의 내용에 없는 정보는 추측하지 마라.

유사 QA 활용 규칙:
- 유사한 기존 Q&A가 제공되면 내용을 참고하되, 강의 자료와 대조해라.
- 기존 답변을 그대로 복사하지 말고, 이 질문의 맥락에 맞게 재구성해라.
- 강의자료가 기존 답변과 다르면 최신 정보를 우선해라.`;

const CONSUMER_CONFIGS: Record<ConsumerType, ConsumerConfig> = {
  qa: {
    limit: 5,
    threshold: 0.4,
    tokenBudget: 3000,
    temperature: 0.3,
    sourceTypes: ["lecture", "blueprint", "papers", "qa", "qa_answer"],
    systemPrompt: QA_SYSTEM_PROMPT,
    enableReranking: true,
    enableExpansion: true,
    model: "claude-sonnet-4-6-20250514",
    enableThinking: true,
    thinkingBudget: 5000,
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
    model: "claude-opus-4-6",
    enableThinking: false,
    thinkingBudget: 0,
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
    model: "claude-opus-4-6",
    enableThinking: false,
    thinkingBudget: 0,
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
    model: "claude-opus-4-6",
    enableThinking: false,
    thinkingBudget: 0,
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
    model: "claude-sonnet-4-6-20250514",
    enableThinking: true,
    thinkingBudget: 5000,
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
    model: "claude-opus-4-6",
    enableThinking: false,
    thinkingBudget: 0,
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

// ─── Stage 1: 유사 QA 검색 ──────────────────────────────────

interface SimilarQA {
  question: ChunkResult;
  answers: ChunkResult[];
}

async function searchSimilarQuestions(
  queryText: string,
  embedding: number[]
): Promise<SimilarQA[]> {
  // qa_question chunks만 검색 (limit 3, threshold 0.70)
  const questionChunks = await searchChunksByEmbedding(
    embedding, queryText, 3, 0.70, ["qa_question"]
  );
  if (questionChunks.length === 0) return [];

  // question_id 추출 (중복 제거)
  const questionIds = [...new Set(
    questionChunks
      .map(c => (c.metadata as Record<string, unknown>)?.question_id as string)
      .filter(Boolean)
  )];
  if (questionIds.length === 0) return [];

  // 해당 question_id의 qa_answer chunks 조회
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: answerChunks } = await (supabase as any)
    .from("knowledge_chunks")
    .select("id, lecture_name, week, chunk_index, content, source_type, priority, image_url, metadata")
    .eq("source_type", "qa_answer")
    .in("metadata->>question_id", questionIds);

  // question별 그룹핑
  return questionChunks.map(qc => {
    const qId = (qc.metadata as Record<string, unknown>)?.question_id as string;
    const answers = (answerChunks || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ac: any) => (ac.metadata as Record<string, unknown>)?.question_id === qId
    );
    return { question: qc, answers };
  });
}

function buildSimilarQAContext(similarQAs: SimilarQA[]): string {
  if (similarQAs.length === 0) return "";

  const sections = similarQAs.map(({ question, answers }) => {
    const similarity = Math.round(question.similarity * 100) / 100;
    const answerText = answers.map(a => a.content).join("\n");
    return `[유사도 ${similarity}] 질문: ${question.content}\n검증된 답변: ${answerText}`;
  });

  return `## 유사한 기존 Q&A (검증된 답변)\n${sections.join("\n\n")}`;
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

const DEFAULT_MODEL = "claude-opus-4-6";
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
  const model = config.model || DEFAULT_MODEL;
  const isQAConsumer = request.consumerType === "qa" || request.consumerType === "chatbot";

  // ── Stage 0: 이미지 설명 결합 (qa/chatbot만) ──
  let query = request.query;
  if (isQAConsumer && request.imageDescriptions) {
    query = `${request.query}\n\n[첨부 이미지 설명]\n${request.imageDescriptions}`;
  }

  // ── Stage 1: 유사 QA 검색 (qa/chatbot만) ──
  let similarQAs: SimilarQA[] = [];
  let stage1Embedding: number[] | null = null;
  if (isQAConsumer) {
    // Stage 1과 Stage 2에서 임베딩 재사용을 위해 먼저 생성
    stage1Embedding = await generateEmbedding(query);
    similarQAs = await searchSimilarQuestions(query, stage1Embedding);
  }

  // F-03: Stage 1에서 사용된 chunk ID 수집 (Stage 2 중복 방지)
  const stage1ChunkIds = new Set<string>();
  for (const qa of similarQAs) {
    stage1ChunkIds.add(qa.question.id);
    for (const a of qa.answers) stage1ChunkIds.add(a.id);
  }

  // ── Stage 2: buildSearchResults (P2 파이프라인) ──
  // F-03: qa/chatbot일 때 qa_question, qa_answer를 Stage 2 sourceTypes에서 제외
  let stage2SourceTypes = sourceTypes;
  if (isQAConsumer && sourceTypes) {
    stage2SourceTypes = (sourceTypes as SourceType[]).filter(
      (st) => st !== "qa_question" && st !== "qa_answer"
    );
  }

  const searchResult = await buildSearchResults(
    query, config, limit, threshold, stage2SourceTypes
  );
  let { chunks } = searchResult;
  const { expandedQueries, chunksBeforeRerank } = searchResult;

  // F-03: Stage 1에서 이미 사용된 chunk ID 제외
  if (stage1ChunkIds.size > 0) {
    chunks = chunks.filter((c) => !stage1ChunkIds.has(c.id));
  }

  // ── Stage 2b: buildContext ──
  const contextText = buildContext(chunks, tokenBudget);
  const similarQAContext = buildSimilarQAContext(similarQAs);

  // ── Stage 3: callLLM ──
  let userContent = "";
  if (similarQAContext) {
    userContent += `${similarQAContext}\n\n`;
  }
  if (contextText) {
    userContent += `## 참고 강의 자료\n${contextText}\n\n`;
  }
  userContent += `## 질문\n${query}`;

  // Extended Thinking: temperature=1 고정 (Anthropic API 제약)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyObj: Record<string, any> = {
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    temperature: config.enableThinking ? 1 : temperature,
  };
  if (config.enableThinking) {
    bodyObj.thinking = { type: "enabled", budget_tokens: config.thinkingBudget };
  }

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
      body: JSON.stringify(bodyObj),
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

    // T5: Extended Thinking 응답 파싱 — text block만 사용
    let content: string;
    if (config.enableThinking && Array.isArray(data.content)) {
      const textBlock = data.content.find((b: { type: string }) => b.type === "text");
      content = textBlock?.text || "";
    } else {
      content = data.content?.[0]?.text || "";
    }

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
        model,
        question_id: request.questionId || null,
        content_id: request.contentId || null,
        duration_ms: Date.now() - startTime,
        // P2 확장 필드 (컬럼 없으면 무시됨)
        ...(rerankScores ? { rerank_scores: rerankScores } : {}),
        ...(expandedQueries.length > 0 ? { expanded_queries: expandedQueries } : {}),
        image_count: imageCount,
        chunks_before_rerank: chunksBeforeRerank,
        chunks_after_rerank: chunks.length,
        similar_qa_count: similarQAs.length,
      } as Record<string, unknown>)
    ).catch((err) => console.error("[KS] Usage log failed:", err));

    return { content, sourceRefs, tokensUsed, model };
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
