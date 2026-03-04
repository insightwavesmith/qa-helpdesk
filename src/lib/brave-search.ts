// Stage 2: Brave Search API 클라이언트
// 조건부 웹서치 — RAG가 AMBIGUOUS/INCORRECT일 때, 또는 플랫폼 현황 질문일 때

import type { DomainAnalysis } from "@/lib/domain-intelligence";

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 10_000;

export interface BraveSearchOptions {
  query: string;
  count?: number;
  freshness?: string; // "pd" (past day), "pw" (past week), "pm" (past month)
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
 * Brave Search API 호출
 */
export async function searchBrave(
  options: BraveSearchOptions
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn("[BraveSearch] BRAVE_API_KEY 미설정");
    return [];
  }

  const params = new URLSearchParams({
    q: options.query,
    count: String(options.count || 5),
    country: options.country || "KR",
  });
  if (options.freshness) {
    params.set("freshness", options.freshness);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BRAVE_API_URL}?${params}`, {
      method: "GET",
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(
        "[BraveSearch] API error:",
        response.status,
        await response.text()
      );
      return [];
    }

    const data = await response.json();
    const results: BraveSearchResult[] = (data.web?.results || [])
      .slice(0, options.count || 5)
      .map(
        (r: {
          title?: string;
          url?: string;
          description?: string;
          age?: string;
        }) => ({
          title: r.title || "",
          url: r.url || "",
          description: r.description || "",
          age: r.age,
        })
      );

    return results;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[BraveSearch] 타임아웃 (10초)");
    } else {
      console.error("[BraveSearch] 실패:", error);
    }
    return [];
  }
}

/**
 * Stage 2: 도메인 분석 기반 웹서치
 * domainAnalysis의 normalizedTerms + intent를 활용해 검색 쿼리 구성
 */
export async function searchWeb(
  domainAnalysis: DomainAnalysis | null,
  originalQuestion: string
): Promise<WebSearchContext> {
  const emptyResult: WebSearchContext = {
    results: [],
    formattedContext: "",
  };

  // 검색 쿼리 구성: 도메인 분석이 있으면 활용, 없으면 원본 사용
  let searchQuery: string;
  if (domainAnalysis && domainAnalysis.normalizedTerms.length > 0) {
    // 정규화된 용어 + 의도 기반
    const terms = domainAnalysis.normalizedTerms
      .map((t) => t.normalized)
      .join(" ");
    searchQuery = `${terms} ${domainAnalysis.intent}`.slice(0, 200);
  } else if (domainAnalysis?.suggestedSearchQueries?.[0]) {
    searchQuery = domainAnalysis.suggestedSearchQueries[0];
  } else {
    searchQuery = originalQuestion.slice(0, 200);
  }

  const results = await searchBrave({
    query: searchQuery,
    count: 5,
    freshness: "pm", // 최근 1개월
    country: "KR",
  });

  if (results.length === 0) return emptyResult;

  // LLM에 전달할 형식으로 포맷팅
  const formattedContext = [
    "## 웹서치 결과 (참고용 - 강의 내용이 우선)",
    ...results.map(
      (r) => `[출처: ${r.title}](${r.url})\n${r.description}`
    ),
  ].join("\n---\n");

  return { results, formattedContext };
}
