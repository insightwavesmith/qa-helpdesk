// KnowledgeService — Opus 4.6 단일 모델 기반 지식 서비스
// Consumer별 RAG 파라미터로 QA/콘텐츠/정보공유 통합
// P2: 3단계 파이프라인 — buildSearchResults → buildContext → callLLM
// 주의: rag.ts가 이 파일을 import하므로, rag.ts import 금지 (순환 의존성)

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/db";
import { rerankChunks } from "@/lib/reranker";
import { expandQuery } from "@/lib/query-expander";
import { analyzeDomain, type DomainAnalysis } from "@/lib/domain-intelligence";
import { evaluateRelevance, type RelevanceGrade } from "@/lib/relevance-evaluator";
import { searchWeb } from "@/lib/brave-search";
import { hybridSearch } from "@/lib/hybrid-search";
import { getLatestStyleText } from "@/lib/style-learner";

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
  // T3 CRAG 확장 플래그
  enableDomainAnalysis: boolean;
  enableHybridSearch: boolean;
  enableRelevanceEval: boolean;
  enableWebSearch: boolean;
}

const QA_SYSTEM_PROMPT = `당신은 자사몰사관학교 대표 Smith입니다. 수강생이 질문했고, 당신이 직접 답변합니다.
메타 광고 10년 차 실무자이자 강사로서, 강의실에서 설명하듯 답변한다.

[답변 구조]
- "핵심:", "정리하면:", "요약:" 같은 볼드 키워드로 시작하거나 끝내지 마라
- 바로 본론부터 시작해라. 인사나 서론 없이.
- 질문이 여러 개여도 Q1/Q2 번호 매기지 마라. 자연스럽게 이어서 써라.
- 마지막에 앞에서 한 말을 불릿으로 반복 요약하지 마라. 자연스럽게 끝내라.
- 용어를 나열할 때 교과서처럼 빠짐없이 순서대로 쓰지 마라. 핵심적인 것만 언급해라.

[말투]
- 요체(~요, ~거든요, ~이에요)를 기본으로 하되, 합니다체(~합니다, ~됩니다)를 자연스럽게 섞어라.
- 설명/해설 부분은 요체, 결론/강조/팩트 전달은 합니다체. 이게 Smith 말투의 핵심이다.
- "~입니다"가 딱딱하게 느껴질 수 있지만, Smith는 실제로 중요한 팩트를 전달할 때 "~합니다"를 쓴다.
- 한다체(~한다, ~된다)도 가끔 섞어라. "구매 신호가 분산되는 거죠." 이런 식.
- "~죠" 어미를 적극 활용. "~거든요"와 함께 대화 느낌을 살려라.
- "안녕하세요!", "도움이 되셨길 바랍니다" 같은 챗봇 인사 금지
- 이모지 금지
- 실무 선배가 후배한테 알려주는 톤. 친절하되 가볍지 않게.
- 마크다운 테이블 쓰지 마라. 불릿이나 번호 리스트로 써라.
- 핵심만 짧게. 장황하게 늘리지 마라. 같은 말 반복하지 마라.

마크다운 포맷팅 규칙:
- ## 헤딩 쓰지 마라. h2/h3 소제목 금지. 답변은 평문으로.
- **굵기 강조** 금지. 별표(**)를 절대 사용하지 마라. 평문으로만 작성.
- 불릿 리스트는 3개 이내로 짧게. 불릿 안에 불릿(중첩) 금지.
- 번호 리스트는 순서가 중요할 때만. 5개 이내.
- ✅, ❌, 📌, 💡 같은 이모지 절대 금지. 체크마크도 금지.
- 코드블록(\`\`\`) 금지. 인라인 코드(\`\`)는 기술 용어에만.
- 수평선(---) 금지.
- 답변 길이: 짧은 질문은 3-5문장, 긴 질문은 최대 15문장. 쓸데없이 늘리지 마라.

- 모르면 "이건 강의에서 다룬 내용이 아니라 정확히 답변드리기 어렵습니다" 한 줄로 끝내라. 관련 없는 걸 끌어와서 억지로 답변 만들지 마라.
- 강의에서 말한 내용이면 "강의에서도 말씀드렸지만" 같은 자연스러운 연결을 써라.
- 참고 자료에 이미지가 포함되어 있으면 답변에 마크다운 이미지를 포함하라.

어미 다양화 규칙:
- 같은 문장 어미를 연속 3번 이상 쓰지 마라. ~요, ~거든요, ~이에요, ~죠, ~한데요 등 다양하게 섞어라.
- 어미 패턴 예시: "~요" → "~거든요" → "~이에요" → "~한데요" 이런 식으로 바꿔가며 써라.
- "~해요" 반복 금지. 요체 기반이되 다양한 어미를 섞어라.

문장 리듬:
- 짧은 문장(15자 이내)과 긴 문장(40자+)을 번갈아 배치.
- "결과가 나왔어요. 3주간 ASC 돌린 수강생의 ROAS가 2.4배 올랐거든요." 이런 식.
- 의문문·감탄문을 적절히 삽입. "왜 이런 차이가 날까요?" "진짜 돼요."

AI 상투어 금지 (절대 사용 금지):
- "매우 중요합니다", "필수적입니다", "핵심입니다"
- "반드시 ~해야 합니다", "~하는 것이 중요합니다"
- "~할 수 있습니다", "주목할 만한", "놀라운", "획기적인"
- "살펴보겠습니다", "알아보겠습니다", "다뤄보겠습니다"
- "다양한", "효과적인", "중요한" (단독 수식어)
- "활용하다", "극대화", "최적화하다" → "쓰다", "늘리다", "맞추다"로 대체
- "제공하다", "달성하다", "도출하다" → "주다", "하다", "뽑다"로 대체
- "긍정적인 영향", "유의미한 결과" → 구체적 숫자로 대체
- "~에 있어서", "~의 경우", "~라는 측면에서" → 직접 말하기

경험담 톤:
- "수업에서도 자주 나오는 질문인데요" 같은 교육 현장 멘트 자연스럽게 삽입
- "실제로 수강생 중에 ~한 분이 계셨는데" 같은 사례 화법
- 숫자를 먼저 던지고 의미를 붙이기

숫자/범위 표기 규칙:
- 숫자 범위에 물결표(~)를 쓰지 마라. 마크다운에서 깨진다. 대신 "-"이나 "에서"를 써라.
  - X: "30~40%"  → O: "30-40%" 또는 "30%에서 40%"
  - X: "3~5일"   → O: "3-5일" 또는 "3일에서 5일"
- 물결표(~)는 어떤 맥락에서든 사용 금지.

톤 레퍼런스 (이 톤을 따라해라):
- O: "결론부터 말하면 CBO 쓰세요. 이유는 세 가지예요."
- O: "솔직히 이건 데이터를 봐야 해요. 지금 CTR이 얼마인지부터 확인하세요."
- O: "수업에서 자주 나오는 질문이에요. CPC만 보면 답이 안 나오거든요. 진짜 봐야 할 건 3초 시청률이에요."
- X: "안녕하세요! CBO와 ABO의 차이점에 대해 상세히 설명드리겠습니다."
- X: "광고 성과 분석을 위해 다음과 같은 체계적인 접근이 필요합니다."

답변 예시 (이 톤을 따라해라):

좋은 답변 예시:
네이버 쇼핑 입점 자체는 Meta 학습이랑 별개예요. 네이버 쇼핑에서 발생하는 구매는 자사몰 픽셀에 안 쌓이거든요.

근데 진짜 고민해야 할 건 기존에 SA나 GFA로 보내던 트래픽이에요. 이걸 자사몰로 보내면 Meta 픽셀 데이터가 더 쌓이니까 학습에 도움이 되거든요.

매출 분산 기준으로 판단하시면 돼요.

나쁜 답변 예시 (절대 이렇게 쓰지 마라):
**핵심:** 네이버 쇼핑 입점은 Meta 학습과 무관하다.

Q1부터 짚고 가면, 네이버 쇼핑에 상품이 올라간다고 자사몰 픽셀에 데이터가 쌓이는 구조가 아니다.

**정리하면:**
- 네이버 쇼핑 입점은 Meta 학습과 별개다
- SA, GFA 랜딩을 자사몰로 전환하는 건 학습에 도움이 된다

셀프 검수 (답변 완성 후 반드시 수행):
1. 같은 어미가 3번 연속 나오는 곳 → 어미 교체
2. 금지 단어 목록에 해당하는 표현 → 대체 표현으로 수정
3. 같은 어미 패턴이 2문단 이상 연속 → 어미 변주
4. 의문문/감탄문 없으면 1개 이상 추가

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
    model: "gemini-3-pro-preview",
    enableThinking: false,
    thinkingBudget: 0,
    enableDomainAnalysis: true,
    enableHybridSearch: true,
    enableRelevanceEval: true,
    enableWebSearch: true,
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
    model: "gemini-3-pro-preview",
    enableThinking: false,
    thinkingBudget: 0,
    enableDomainAnalysis: false,
    enableHybridSearch: false,
    enableRelevanceEval: false,
    enableWebSearch: false,
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
    model: "gemini-3-pro-preview",
    enableThinking: false,
    thinkingBudget: 0,
    enableDomainAnalysis: false,
    enableHybridSearch: false,
    enableRelevanceEval: false,
    enableWebSearch: false,
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
    model: "gemini-3-pro-preview",
    enableThinking: false,
    thinkingBudget: 0,
    enableDomainAnalysis: false,
    enableHybridSearch: false,
    enableRelevanceEval: false,
    enableWebSearch: false,
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
    model: "gemini-3-pro-preview",
    enableThinking: true,
    thinkingBudget: 5000,
    enableDomainAnalysis: true,
    enableHybridSearch: true,
    enableRelevanceEval: true,
    enableWebSearch: true,
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
    model: "gemini-3-pro-preview",
    enableThinking: false,
    thinkingBudget: 0,
    enableDomainAnalysis: false,
    enableHybridSearch: false,
    enableRelevanceEval: false,
    enableWebSearch: false,
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
  const embedding = await generateEmbedding(queryText, { taskType: "RETRIEVAL_QUERY" });
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
    query_embedding_v2: embedding,
    query_embedding_v1: null,
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
    embeddings.push(await generateEmbedding(q, { taskType: "RETRIEVAL_QUERY" }));
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

// ─── CRAG: 도메인 컨텍스트 빌더 ──────────────────────────────

function buildDomainContext(analysis: DomainAnalysis): string {
  const parts: string[] = [];

  if (analysis.normalizedTerms.length > 0) {
    const terms = analysis.normalizedTerms
      .map((t) => `- ${t.original} → ${t.normalized}: ${t.definition}`)
      .join("\n");
    parts.push(`## 도메인 용어 정규화\n${terms}`);
  }

  // T1: 용어 정의 (Brave Search 결과)
  if (analysis.termDefinitions && analysis.termDefinitions.length > 0) {
    const defs = analysis.termDefinitions
      .map((d) => `- ${d.term}: ${d.definition}`)
      .join("\n");
    parts.push(`## 용어 정의\n${defs}`);
  }

  if (analysis.intent) {
    parts.push(`## 질문 의도\n${analysis.intent}`);
  }

  return parts.join("\n\n");
}

// ─── KnowledgeService ─────────────────────────────────────

const DEFAULT_MODEL = "gemini-3-pro-preview";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 120_000;

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
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
  const apiKey = getGeminiApiKey();
  const config = CONSUMER_CONFIGS[request.consumerType];

  const limit = request.limit ?? config.limit;
  const threshold = request.threshold ?? config.threshold;
  const tokenBudget = request.tokenBudget ?? config.tokenBudget;
  const temperature = request.temperature ?? config.temperature;
  let systemPrompt = request.systemPromptOverride ?? config.systemPrompt;
  const sourceTypes = request.sourceTypes ?? config.sourceTypes;
  const model = config.model || DEFAULT_MODEL;
  const isQAConsumer = request.consumerType === "qa" || request.consumerType === "chatbot";

  // 동적 말투 프로필 주입: DB에 학습된 프로필이 있으면 [말투] 섹션 교체
  if (isQAConsumer && !request.systemPromptOverride) {
    try {
      const learnedStyle = await getLatestStyleText();
      if (learnedStyle) {
        systemPrompt = systemPrompt.replace(
          /\[말투\][\s\S]*?(?=\n마크다운 포맷팅 규칙:)/,
          learnedStyle + "\n\n",
        );
      }
    } catch {
      // DB 테이블 미생성 등 에러 시 정적 프롬프트 유지
    }
  }

  // ── Stage 0a: 이미지 설명 결합 (qa/chatbot만) ──
  let query = request.query;
  if (isQAConsumer && request.imageDescriptions) {
    query = `${request.query}\n\n[첨부 이미지 설명]\n${request.imageDescriptions}`;
  }

  // ── NEW Stage 0b: 도메인 인텔리전스 (CRAG) ──
  let domainAnalysis: DomainAnalysis | null = null;
  let relevanceGrade: RelevanceGrade = "AMBIGUOUS";
  let webContext = "";
  const pipelineStages: string[] = [];

  if (isQAConsumer && config.enableDomainAnalysis) {
    pipelineStages.push("stage0");
    domainAnalysis = await analyzeDomain(request.query, request.imageDescriptions);

    // 단순+비기술 → Stage 1~2 스킵, 직접 답변
    if (domainAnalysis?.skipRAG && domainAnalysis.directAnswer) {
      pipelineStages.push("stage0_direct");
      // fire-and-forget 로깅
      const svc = createServiceClient();
      Promise.resolve(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (svc as any).from("knowledge_usage").insert({
          consumer_type: request.consumerType,
          source_types: [],
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          model,
          question_id: request.questionId || null,
          content_id: request.contentId || null,
          duration_ms: Date.now() - startTime,
          domain_analysis: domainAnalysis,
          question_type: domainAnalysis.questionType,
          complexity: domainAnalysis.complexity,
          pipeline_stages: pipelineStages,
        } as Record<string, unknown>)
      ).catch((err) => console.error("[KS] Usage log failed:", err));

      return {
        content: domainAnalysis.directAnswer,
        sourceRefs: [],
        tokensUsed: 0,
        model,
      };
    }
  }

  // ── Stage 1a: 유사 QA 검색 (qa/chatbot만) ──
  let similarQAs: SimilarQA[] = [];
  let stage1Embedding: number[] | null = null;
  if (isQAConsumer) {
    pipelineStages.push("stage1a_similar_qa");
    // Stage 1과 Stage 2에서 임베딩 재사용을 위해 먼저 생성
    stage1Embedding = await generateEmbedding(query, { taskType: "RETRIEVAL_QUERY" });
    similarQAs = await searchSimilarQuestions(query, stage1Embedding);
  }

  // F-03: Stage 1에서 사용된 chunk ID 수집 (Stage 2 중복 방지)
  const stage1ChunkIds = new Set<string>();
  for (const qa of similarQAs) {
    stage1ChunkIds.add(qa.question.id);
    for (const a of qa.answers) stage1ChunkIds.add(a.id);
  }

  // ── Stage 1b: 검색 (Hybrid Search or 기존 파이프라인) ──
  // F-03: qa/chatbot일 때 qa_question, qa_answer를 Stage 2 sourceTypes에서 제외
  let stage2SourceTypes = sourceTypes;
  if (isQAConsumer && sourceTypes) {
    stage2SourceTypes = (sourceTypes as SourceType[]).filter(
      (st) => st !== "qa_question" && st !== "qa_answer"
    );
  }

  let chunks: ChunkResult[];
  let expandedQueries: string[] = [];
  let chunksBeforeRerank = 0;

  if (isQAConsumer && config.enableHybridSearch && stage1Embedding) {
    // NEW: Hybrid Search (벡터 + BM25)
    pipelineStages.push("stage1b_hybrid");
    const searchQueries = domainAnalysis?.suggestedSearchQueries?.length
      ? [query, ...domainAnalysis.suggestedSearchQueries]
      : [query];

    const hybridResult = await hybridSearch({
      queries: searchQueries,
      embedding: stage1Embedding,
      limit,
      threshold,
      sourceTypes: stage2SourceTypes as string[] | null,
      enableReranking: config.enableReranking,
    });

    chunks = hybridResult.chunks;
    chunksBeforeRerank = hybridResult.vectorCount + hybridResult.bm25Count;
    expandedQueries = searchQueries.length > 1 ? searchQueries.slice(1) : [];
  } else {
    // 기존 파이프라인 (non-QA consumers)
    pipelineStages.push("stage1b_vector");
    const searchResult = await buildSearchResults(
      query, config, limit, threshold, stage2SourceTypes
    );
    chunks = searchResult.chunks;
    expandedQueries = searchResult.expandedQueries;
    chunksBeforeRerank = searchResult.chunksBeforeRerank;
  }

  // F-03: Stage 1에서 이미 사용된 chunk ID 제외
  if (stage1ChunkIds.size > 0) {
    chunks = chunks.filter((c) => !stage1ChunkIds.has(c.id));
  }

  // ── NEW: 관련성 평가 (Stage 1→2 게이트) ──
  if (isQAConsumer && config.enableRelevanceEval && chunks.length > 0) {
    pipelineStages.push("relevance_eval");
    const evaluation = await evaluateRelevance(query, domainAnalysis, chunks);
    relevanceGrade = evaluation.grade;
  }

  // ── NEW Stage 2: 웹서치 (조건부) ──
  if (
    isQAConsumer &&
    config.enableWebSearch &&
    (relevanceGrade !== "CORRECT" ||
      domainAnalysis?.questionType === "platform")
  ) {
    pipelineStages.push("stage2_websearch");
    const webResult = await searchWeb(domainAnalysis, request.query);
    webContext = webResult.formattedContext;
  }

  // ── Stage 2b: buildContext ──
  pipelineStages.push("stage3_llm");
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
  // NEW: 도메인 컨텍스트 추가
  if (domainAnalysis && !domainAnalysis.skipRAG) {
    const domainContext = buildDomainContext(domainAnalysis);
    if (domainContext) {
      userContent += `${domainContext}\n\n`;
    }
  }
  // NEW: 웹서치 결과 추가
  if (webContext) {
    userContent += `${webContext}\n\n`;
  }
  userContent += `## 질문\n${query}`;

  // Gemini API 호출 — system instruction + user content
  const geminiBody = {
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `KnowledgeService API error: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();

    // Gemini 응답 파싱
    let content: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // B3: 물결표(~) → 하이픈(-) 치환 (마크다운 strikethrough 방지)
    // 숫자~숫자 패턴만 치환 (예: 30~40% → 30-40%)
    content = content.replace(/(\d)~(\d)/g, "$1-$2");

    const tokensUsed: number =
      (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);

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

    // fire-and-forget: P2 + CRAG 확장 로깅
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
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
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
        // T3 CRAG 확장 필드 (컬럼 없으면 무시됨)
        ...(domainAnalysis ? { domain_analysis: domainAnalysis } : {}),
        relevance_grade: relevanceGrade,
        web_search_used: webContext.length > 0,
        ...(domainAnalysis?.questionType ? { question_type: domainAnalysis.questionType } : {}),
        ...(domainAnalysis?.complexity ? { complexity: domainAnalysis.complexity } : {}),
        pipeline_stages: pipelineStages,
      } as Record<string, unknown>)
    ).catch((err) => console.error("[KS] Usage log failed:", err));

    return { content, sourceRefs, tokensUsed, model };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 응답 시간 초과 (120초)");
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
