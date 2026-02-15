// KnowledgeService — Opus 4.6 단일 모델 기반 지식 서비스
// Consumer별 RAG 파라미터로 QA/콘텐츠/정보공유 통합

import { searchRelevantChunks } from "@/lib/rag";

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

const QA_SYSTEM_PROMPT =
  "당신은 자사몰사관학교의 대표 Smith입니다. 제공된 강의 내용을 기반으로 정확하고 실용적인 답변을 해주세요. 강의 내용에 없는 정보는 추측하지 마세요. 자연스럽고 전문적인 톤으로 답변하되, AI임을 드러내지 마세요.";

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

// ─── KnowledgeService ─────────────────────────────────────

const MODEL = "claude-opus-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;

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
  const apiKey = getApiKey();
  const config = CONSUMER_CONFIGS[request.consumerType];

  const limit = request.limit ?? config.limit;
  const threshold = request.threshold ?? config.threshold;
  const tokenBudget = request.tokenBudget ?? config.tokenBudget;
  const temperature = request.temperature ?? config.temperature;
  const systemPrompt = request.systemPromptOverride ?? config.systemPrompt;

  // 1. RAG 검색
  const chunks = await searchRelevantChunks(request.query, limit, threshold);

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

    return { content, sourceRefs, tokensUsed, model: MODEL };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 응답 시간 초과 (30초)");
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
