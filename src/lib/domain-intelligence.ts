// Stage 0: 도메인 인텔리전스 — 질문 분석 및 도메인 용어 정규화
// Gemini Flash로 질문의 도메인 용어를 이해하고 검색 쿼리를 최적화

import { searchGoogle } from "@/lib/brave-search";
import { generateEmbedding, generateFlashText } from "@/lib/gemini";
import { createServiceClient } from "@/lib/db";

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
 * Brave 용어 검색 결과를 knowledge_chunks glossary로 자동 저장
 * fire-and-forget — 답변 생성 속도에 영향 없음
 */
async function saveGlossaryToKnowledge(
  termDefinitions: Array<{ term: string; definition: string }>
): Promise<void> {
  if (termDefinitions.length === 0) return;

  const svc = createServiceClient();

  for (const { term, definition } of termDefinitions) {
    try {
      // 중복 체크: 같은 용어가 glossary에 이미 있으면 skip
      const { data: existing } = await svc
        .from("knowledge_chunks")
        .select("id")
        .eq("source_type", "glossary")
        .ilike("content", `${term}:%`)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // 임베딩 생성 + insert
      const content = `${term}: ${definition}`;
      const embedding = await generateEmbedding(content, { taskType: "RETRIEVAL_DOCUMENT" });

      await svc.from("knowledge_chunks").insert({
        source_type: "glossary",
        lecture_name: "자동학습 용어집",
        content,
        embedding_v2: embedding,
        embedding_model_v2: "gemini-embedding-2-preview",
        priority: 3,
        chunk_index: 0,
        week: "glossary",
      });

      console.log(`[DomainIntelligence] glossary 저장: ${term}`);
    } catch (err) {
      console.warn(`[DomainIntelligence] glossary 저장 실패 (${term}):`, err);
    }
  }
}

/**
 * Stage 0: 도메인 분석
 * 실패 시 null 반환 (graceful degradation — 기존 파이프라인으로 폴백)
 */
export async function analyzeDomain(
  question: string,
  imageDescriptions?: string
): Promise<DomainAnalysis | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[DomainIntelligence] GEMINI_API_KEY 미설정, 스킵");
    return null;
  }

  let userPrompt = `질문: ${question}`;
  if (imageDescriptions) {
    userPrompt += `\n\n첨부 이미지 설명: ${imageDescriptions}`;
  }

  const fullPrompt = `${DOMAIN_ANALYSIS_PROMPT}\n\n${userPrompt}`;

  try {
    const text = await generateFlashText(fullPrompt, {
      temperature: 0.2,
      maxTokens: 2000,
    });

    if (!text) {
      console.error("[DomainIntelligence] Gemini Flash 빈 응답");
      return null;
    }

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

    // T1: 핵심 용어 — glossary 캐시 우선, 없으면 Brave 검색
    let termDefinitions: Array<{ term: string; definition: string }> = [];
    if (normalizedTerms.length > 0) {
      try {
        const svc = createServiceClient();
        const keyTerms = normalizedTerms.slice(0, 2);
        const definitionPromises = keyTerms.map(async (t: NormalizedTerm) => {
          // glossary 캐시 확인
          const { data: cached } = await svc
            .from("knowledge_chunks")
            .select("content")
            .eq("source_type", "glossary")
            .ilike("content", `${t.normalized}:%`)
            .limit(1);
          if (cached && cached.length > 0) {
            const parts = cached[0].content.split(": ");
            return { term: t.normalized, definition: parts.slice(1).join(": ") };
          }
          // glossary 미스 → Google Search (Gemini grounding)
          const results = await searchGoogle(`${t.normalized} 뜻 자사몰 메타광고 맥락`, 2);
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

        termDefinitions = (results.filter(
          (r): r is { term: string; definition: string } => r !== null
        )) as Array<{ term: string; definition: string }>;
      } catch (err) {
        console.warn("[DomainIntelligence] 용어 정의 조회 실패:", err);
        // 실패 시 빈 배열 — 기존 동작 유지
      }
    }

    // T4: Brave 용어 정의를 knowledge_chunks glossary에 비동기 저장 (fire-and-forget)
    if (termDefinitions.length > 0) {
      saveGlossaryToKnowledge(termDefinitions).catch((err) =>
        console.warn("[DomainIntelligence] glossary 비동기 저장 실패:", err)
      );
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
    console.error("[DomainIntelligence] 실패:", error);
    return null;
  }
}
