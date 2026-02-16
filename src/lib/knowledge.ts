// KnowledgeService — Opus 4.6 단일 모델 기반 지식 서비스
// Consumer별 RAG 파라미터로 QA/콘텐츠/정보공유 통합
// 주의: rag.ts가 이 파일을 import하므로, rag.ts import 금지 (순환 의존성)

import { generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";

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
  | "qa_archive"
  | "crawl"
  | "meeting"
  | "manual";

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
    sourceTypes: ["lecture", "qa_archive", "manual"],
    systemPrompt: QA_SYSTEM_PROMPT,
  },
  newsletter: {
    limit: 5,
    threshold: 0.4,
    tokenBudget: 3000,
    temperature: 0.5,
    sourceTypes: ["lecture", "crawl"],
    systemPrompt: "", // contents.ts TYPE_PROMPTS에서 주입
  },
  education: {
    limit: 7,
    threshold: 0.5,
    tokenBudget: 5000,
    temperature: 0.3,
    sourceTypes: ["lecture"],
    systemPrompt: "", // contents.ts TYPE_PROMPTS에서 주입
  },
  webinar: {
    limit: 3,
    threshold: 0.4,
    tokenBudget: 2000,
    temperature: 0.6,
    sourceTypes: ["lecture", "crawl"],
    systemPrompt: "", // contents.ts TYPE_PROMPTS에서 주입
  },
  chatbot: {
    limit: 5,
    threshold: 0.3,
    tokenBudget: 4000,
    temperature: 0.4,
    sourceTypes: null,
    systemPrompt: QA_SYSTEM_PROMPT,
  },
  promo: {
    limit: 3,
    threshold: 0.5,
    tokenBudget: 2000,
    temperature: 0.7,
    sourceTypes: ["lecture", "manual"],
    systemPrompt: "", // contents.ts TYPE_PROMPTS에서 주입
  },
};

// ─── 인라인 RAG 검색 (순환 의존성 방지) ──────────────────

interface ChunkResult {
  id: string;
  lecture_name: string;
  week: string;
  chunk_index: number;
  content: string;
  similarity: number;
  source_type?: string;
  metadata?: Record<string, unknown> | null;
}

async function searchChunks(
  queryText: string,
  limit: number,
  threshold: number,
  sourceTypes?: string[] | null
): Promise<ChunkResult[]> {
  const supabase = createServiceClient();
  const embedding = await generateEmbedding(queryText);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("match_lecture_chunks", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    filter_source_types: sourceTypes || null,
  });

  if (error) {
    console.error("[KnowledgeService] Vector search error:", error);
    return [];
  }

  return data || [];
}

// ─── KnowledgeService ─────────────────────────────────────

const MODEL = "claude-opus-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 280_000; // Vercel Pro maxDuration=300s, 여유 20s

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  }
  return key;
}

function truncateToTokenBudget(text: string, budget: number): string {
  // 한국어 기준 ~1자 ≈ 1자, budget은 글자수 기준
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

  // 1. RAG 검색 (인라인 — rag.ts 순환 의존성 방지)
  const chunks = await searchChunks(request.query, limit, threshold, sourceTypes);

  // 2. 컨텍스트 조합
  let contextText = "";
  if (chunks.length > 0) {
    const combined = chunks
      .map((c) => `[${c.lecture_name} - ${c.week}]\n${c.content}`)
      .join("\n\n---\n\n");
    contextText = truncateToTokenBudget(combined, tokenBudget);
  }

  // 3. 사용자 메시지 구성
  const userContent = contextText
    ? `## 참고 강의 자료\n${contextText}\n\n## 질문\n${request.query}`
    : request.query;

  // 4. Opus 4.6 API 호출
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

    // 5. 출처 참조 생성
    const sourceRefs: SourceRef[] = chunks.map((c) => ({
      lecture_name: c.lecture_name,
      week: c.week,
      chunk_index: c.chunk_index,
      similarity: Math.round(c.similarity * 100) / 100,
    }));

    // fire-and-forget: 로깅 실패해도 KS 응답은 정상 반환
    const svc = createServiceClient();
    Promise.resolve(
      svc.from("knowledge_usage").insert({
        consumer_type: request.consumerType,
        source_types: sourceTypes ? (sourceTypes as string[]) : [],
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        total_tokens: tokensUsed,
        model: MODEL,
        question_id: request.questionId || null,
        content_id: request.contentId || null,
        duration_ms: Date.now() - startTime,
      })
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
