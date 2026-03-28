// Stage 2: Google Search Grounding (via Gemini API)
// Brave Search → Gemini Google Search Grounding으로 교체
// 레이트리밋 없음, GEMINI_API_KEY 재사용

import type { DomainAnalysis } from "@/lib/domain-intelligence";

const GEMINI_SEARCH_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const TIMEOUT_MS = 10_000;

export interface BraveSearchOptions {
  query: string;
  count?: number;
  freshness?: string;
  country?: string;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export interface WebSearchContext {
  results: BraveSearchResult[];
  formattedContext: string;
}

/**
 * Gemini Google Search Grounding으로 웹 검색
 * BraveSearchResult[] 반환 — 호출부 인터페이스 유지
 */
export async function searchGoogle(
  query: string,
  count: number = 5
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[GoogleSearch] GEMINI_API_KEY 미설정");
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_SEARCH_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `다음 주제에 대해 한국어로 간략히 설명하세요: ${query}`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(
        "[GoogleSearch] API error:",
        response.status,
        await response.text()
      );
      return [];
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) return [];

    const text: string = candidate.content?.parts?.[0]?.text || "";
    const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> =
      candidate.groundingMetadata?.groundingChunks || [];

    // groundingChunks → BraveSearchResult[] 변환
    const results: BraveSearchResult[] = groundingChunks
      .slice(0, count)
      .map((chunk) => ({
        title: chunk.web?.title || query,
        url: chunk.web?.uri || "",
        description: text.slice(0, 400),
      }));

    // groundingChunks 없을 때 — grounded 응답 자체를 하나의 결과로
    if (results.length === 0 && text) {
      results.push({
        title: query,
        url: "",
        description: text.slice(0, 400),
      });
    }

    return results;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[GoogleSearch] 타임아웃 (10초)");
    } else {
      console.error("[GoogleSearch] 실패:", error);
    }
    return [];
  }
}

/**
 * 하위 호환 래퍼 — BraveSearchOptions 인터페이스 유지
 */
export async function searchBrave(
  options: BraveSearchOptions
): Promise<BraveSearchResult[]> {
  return searchGoogle(options.query, options.count);
}

/**
 * Stage 2: 도메인 분석 기반 웹서치
 */
export async function searchWeb(
  domainAnalysis: DomainAnalysis | null,
  originalQuestion: string
): Promise<WebSearchContext> {
  const emptyResult: WebSearchContext = {
    results: [],
    formattedContext: "",
  };

  let searchQuery: string;
  if (domainAnalysis && domainAnalysis.normalizedTerms.length > 0) {
    const terms = domainAnalysis.normalizedTerms
      .map((t) => t.normalized)
      .join(" ");
    searchQuery = `${terms} ${domainAnalysis.intent}`.slice(0, 200);
  } else if (domainAnalysis?.suggestedSearchQueries?.[0]) {
    searchQuery = domainAnalysis.suggestedSearchQueries[0];
  } else {
    searchQuery = originalQuestion.slice(0, 200);
  }

  const results = await searchGoogle(searchQuery, 5);

  if (results.length === 0) return emptyResult;

  const separator = "\n---\n";
  const formattedContext = [
    "## 웹서치 결과 (참고용 - 강의 내용이 우선)",
    ...results.map((r) => `[출처: ${r.title}](${r.url})\n${r.description}`),
  ].join(separator);

  return { results, formattedContext };
}
