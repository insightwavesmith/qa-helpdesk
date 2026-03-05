// Stage 0: 도메인 인텔리전스 — 질문 분석 및 도메인 용어 정규화
// Sonnet으로 질문의 도메인 용어를 이해하고 검색 쿼리를 최적화

import { searchBrave } from "@/lib/brave-search";

const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 15_000;

export interface NormalizedTerm {
  original: string;
  normalized: string;
  definition: string;
}

export type QuestionType =
  | "lecture"
  | "platform"
  | "troubleshooting"
  | "non_technical";

export type Complexity = "simple" | "medium" | "complex";

export interface DomainAnalysis {
  normalizedTerms: NormalizedTerm[];
  intent: string;
  questionType: QuestionType;
  complexity: Complexity;
  suggestedSearchQueries: string[];
  skipRAG: boolean;
  directAnswer?: string;
  termDefinitions: Array<{ term: string; definition: string }>; // T1: Brave 용어 정의
}

const DOMAIN_ANALYSIS_PROMPT = `당신은 메타(Facebook) 광고 도메인 전문가입니다.
수강생 질문을 분석하여 다음을 JSON으로 반환하세요. JSON 외에 다른 텍스트를 포함하지 마세요.

1. normalizedTerms: 도메인 용어 추출 + 정규화
   - 줄임말, 오타, 속어를 정식 표현으로 변환
   - 예: "ASC" → "Advantage Shopping Campaign (어드밴티지 쇼핑 캠페인)"
   - 예: "네쇼" → "네이버 쇼핑"
   - 예: "CBO" → "Campaign Budget Optimization (캠페인 예산 최적화)"
   - 도메인 용어가 없으면 빈 배열

2. intent: 수강생이 진짜 묻고 싶은 것 (표면적 질문 뒤의 실제 의도, 1-2문장)

3. questionType:
   - "lecture": 강의에서 다루는 메타 광고 운영/전략
   - "platform": 메타/네이버 등 플랫폼 최신 현황/정책 변경
   - "troubleshooting": 특정 오류/문제 해결
   - "non_technical": 인사/잡담/강의 일정 등

4. complexity:
   - "simple": 한 문장으로 답변 가능
   - "medium": 2-3개 포인트 설명 필요
   - "complex": 여러 개념 종합 + 사례 필요

5. suggestedSearchQueries: 정규화된 용어 기반, 강의 자료 검색에 최적화된 쿼리 2-3개
   - 원본 질문을 그대로 쓰지 말고, 핵심 개념 중심으로 재구성

6. skipRAG: questionType이 "non_technical"이고 complexity가 "simple"이면 true, 아니면 false

7. directAnswer: skipRAG=true일 때만 포함. Smith 코치 톤으로 간단 답변. skipRAG=false면 이 필드 생략.

JSON 형식:
{
  "normalizedTerms": [{"original": "...", "normalized": "...", "definition": "..."}],
  "intent": "...",
  "questionType": "lecture|platform|troubleshooting|non_technical",
  "complexity": "simple|medium|complex",
  "suggestedSearchQueries": ["...", "..."],
  "skipRAG": false,
  "directAnswer": "..."
}`;

/**
 * Stage 0: 도메인 분석
 * 실패 시 null 반환 (graceful degradation — 기존 파이프라인으로 폴백)
 */
export async function analyzeDomain(
  question: string,
  imageDescriptions?: string
): Promise<DomainAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[DomainIntelligence] ANTHROPIC_API_KEY 미설정, 스킵");
    return null;
  }

  let userPrompt = `질문: ${question}`;
  if (imageDescriptions) {
    userPrompt += `\n\n첨부 이미지 설명: ${imageDescriptions}`;
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
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        temperature: 0.2,
        system: DOMAIN_ANALYSIS_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(
        "[DomainIntelligence] API error:",
        response.status,
        await response.text()
      );
      return null;
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    );
    const text = textBlock?.text || "";

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[DomainIntelligence] JSON not found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 유효성 검증 + 기본값
    const validTypes: QuestionType[] = [
      "lecture",
      "platform",
      "troubleshooting",
      "non_technical",
    ];
    const validComplexity: Complexity[] = ["simple", "medium", "complex"];

    const normalizedTerms: NormalizedTerm[] = Array.isArray(parsed.normalizedTerms)
      ? parsed.normalizedTerms
      : [];

    // T1: 핵심 용어 Brave Search 정의 조회
    let termDefinitions: Array<{ term: string; definition: string }> = [];
    if (normalizedTerms.length > 0 && process.env.BRAVE_API_KEY) {
      try {
        const keyTerms = normalizedTerms.slice(0, 2);
        const definitionPromises = keyTerms.map(async (t: NormalizedTerm) => {
          const results = await searchBrave({
            query: `${t.normalized} 뜻`,
            count: 2,
            country: "KR",
          });
          if (results.length > 0) {
            return {
              term: t.normalized,
              definition: results[0].description.slice(0, 300),
            };
          }
          return null;
        });

        const results = await Promise.race([
          Promise.all(definitionPromises),
          new Promise<({ term: string; definition: string } | null)[]>((resolve) =>
            setTimeout(() => resolve(keyTerms.map(() => null)), 5000)
          ),
        ]);

        termDefinitions = results.filter(
          (r): r is { term: string; definition: string } => r !== null
        );
      } catch (err) {
        console.warn("[DomainIntelligence] 용어 정의 조회 실패:", err);
        // 실패 시 빈 배열 — 기존 동작 유지
      }
    }

    return {
      normalizedTerms,
      intent: String(parsed.intent || question),
      questionType: validTypes.includes(parsed.questionType)
        ? parsed.questionType
        : "lecture",
      complexity: validComplexity.includes(parsed.complexity)
        ? parsed.complexity
        : "medium",
      suggestedSearchQueries: Array.isArray(parsed.suggestedSearchQueries)
        ? parsed.suggestedSearchQueries.map(String)
        : [question],
      skipRAG: Boolean(parsed.skipRAG),
      directAnswer: parsed.directAnswer
        ? String(parsed.directAnswer)
        : undefined,
      termDefinitions,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[DomainIntelligence] 타임아웃 (15초)");
    } else {
      console.error("[DomainIntelligence] 실패:", error);
    }
    return null;
  }
}
