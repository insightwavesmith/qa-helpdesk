# T3. Q&A 답변 고도화 — CRAG + Adaptive RAG — 설계서

## 1. 데이터 모델

### 1.1 기존 테이블 (변경 없음)
- `questions` — 질문 (기존 그대로)
- `answers` — 답변 (기존 그대로: is_ai, is_approved, source_refs)
- `knowledge_chunks` — 벡터 청크 (기존 그대로)

### 1.2 knowledge_usage 확장 (선택적 — 컬럼 추가)

```sql
-- 기존 테이블에 로깅 필드 추가 (없으면 insert 시 무시됨)
ALTER TABLE public.knowledge_usage
  ADD COLUMN IF NOT EXISTS domain_analysis JSONB,           -- Stage 0 결과
  ADD COLUMN IF NOT EXISTS relevance_grade TEXT,             -- CORRECT / AMBIGUOUS / INCORRECT
  ADD COLUMN IF NOT EXISTS web_search_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS web_search_results_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS question_type TEXT,               -- lecture / platform / troubleshooting / non_technical
  ADD COLUMN IF NOT EXISTS complexity TEXT,                   -- simple / medium / complex
  ADD COLUMN IF NOT EXISTS pipeline_stages TEXT[];            -- 실행된 단계 추적 ['stage0', 'stage1', 'stage2', 'stage3']
```

### 1.3 knowledge_chunks full-text search 인덱스 (BM25 용)

```sql
-- content 컬럼에 한국어 full-text search 인덱스 추가
-- Supabase는 pg_trgm + simple dictionary로 한국어 지원
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
  ON public.knowledge_chunks USING GIN (content_tsv);

-- BM25 검색용 RPC 함수
CREATE OR REPLACE FUNCTION search_knowledge_bm25(
  query_text TEXT,
  match_count INT DEFAULT 10,
  filter_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  lecture_name TEXT,
  week TEXT,
  chunk_index INT,
  content TEXT,
  source_type TEXT,
  priority INT,
  image_url TEXT,
  metadata JSONB,
  text_score FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.lecture_name,
    kc.week,
    kc.chunk_index,
    kc.content,
    kc.source_type,
    kc.priority,
    kc.image_url,
    kc.metadata,
    ts_rank(kc.content_tsv, plainto_tsquery('simple', query_text))::FLOAT AS text_score
  FROM knowledge_chunks kc
  WHERE
    kc.content_tsv @@ plainto_tsquery('simple', query_text)
    AND (filter_source_types IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY text_score DESC
  LIMIT match_count;
END;
$$;
```

## 2. API 설계

### 2.1 외부 API 변경 없음
- `questions.ts` → `createAIAnswerForQuestion()` 시그니처 변경 없음
- `answers` 테이블 insert 구조 변경 없음
- 모든 변경은 내부 파이프라인에 한정

### 2.2 Brave Search API 클라이언트

**엔드포인트**: `https://api.search.brave.com/res/v1/web/search`

```typescript
// src/lib/brave-search.ts

interface BraveSearchOptions {
  query: string;
  count?: number;       // 기본 5
  freshness?: string;   // "pd" (past day), "pw" (past week), "pm" (past month)
  country?: string;     // "KR"
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;         // "2 days ago"
}

export async function searchBrave(
  options: BraveSearchOptions
): Promise<BraveSearchResult[]>
```

**헤더**:
```
X-Subscription-Token: ${BRAVE_API_KEY}
Accept: application/json
```

**타임아웃**: 10초

## 3. 컴포넌트 구조 (내부 모듈)

### 3.1 모듈 아키텍처

```
src/lib/
├── knowledge.ts          ← 메인 오케스트레이터 (generate 함수 수정)
├── domain-intelligence.ts ← [신규] Stage 0: 도메인 분석
├── hybrid-search.ts       ← [신규] Stage 1: 벡터 + BM25 결합
├── relevance-evaluator.ts ← [신규] Stage 1→2 게이트: 관련성 평가
├── brave-search.ts        ← [신규] Stage 2: 웹서치
├── rag.ts                 ← 기존 (시그니처 변경 없음)
├── gemini.ts              ← 기존 (변경 없음)
├── reranker.ts            ← 기존 (변경 없음)
├── query-expander.ts      ← 기존 (변경 없음)
└── qa-embedder.ts         ← 기존 (변경 없음)
```

### 3.2 Stage 0: 도메인 인텔리전스 (`domain-intelligence.ts`)

```typescript
// src/lib/domain-intelligence.ts

export interface DomainAnalysis {
  // 용어 정규화
  normalizedTerms: Array<{
    original: string;     // "네쇼입점"
    normalized: string;   // "네이버 쇼핑 입점"
    definition: string;   // "자사몰 상품을 네이버 쇼핑에 노출시키는 것"
  }>;

  // 질문 의도
  intent: string;         // "수강생이 진짜 묻고 싶은 것" (1~2문장)

  // 질문 유형
  questionType: "lecture" | "platform" | "troubleshooting" | "non_technical";

  // 복잡도
  complexity: "simple" | "medium" | "complex";

  // 검색 쿼리 제안 (Stage 1용)
  suggestedSearchQueries: string[];

  // 단순+비기술 판단 → Stage 1~2 스킵 가능
  skipRAG: boolean;

  // 스킵 시 직접 답변
  directAnswer?: string;
}

export async function analyzeDomain(
  question: string,
  imageDescriptions?: string
): Promise<DomainAnalysis>
```

**Sonnet 프롬프트 설계**:
```
당신은 메타(Facebook) 광고 도메인 전문가입니다.
수강생 질문을 분석하여 다음을 JSON으로 반환하세요:

1. normalizedTerms: 도메인 용어 추출 + 정규화
   - 줄임말, 오타, 속어를 정식 표현으로 변환
   - 예: "ASC" → "Advantage Shopping Campaign (어드밴티지 쇼핑 캠페인)"
   - 예: "네쇼" → "네이버 쇼핑"

2. intent: 수강생이 진짜 묻고 싶은 것 (표면적 질문 뒤의 실제 의도)

3. questionType:
   - "lecture": 강의에서 다루는 메타 광고 운영/전략
   - "platform": 메타/네이버 등 플랫폼 최신 현황/정책 변경
   - "troubleshooting": 특정 오류/문제 해결
   - "non_technical": 인사/잡담/강의 일정 등

4. complexity:
   - "simple": 한 문장으로 답변 가능
   - "medium": 2~3개 포인트 설명 필요
   - "complex": 여러 개념 종합 + 사례 필요

5. suggestedSearchQueries: 정규화된 용어 기반, 강의 자료 검색에 최적화된 쿼리 2~3개

6. skipRAG: questionType이 "non_technical"이고 complexity가 "simple"이면 true

7. directAnswer: skipRAG=true일 때만. Smith 코치 톤으로 간단 답변.

질문: {question}
{imageDescriptions ? `\n첨부 이미지 설명: ${imageDescriptions}` : ""}
```

**모델**: `claude-sonnet-4-6` (Anthropic API 직접 호출)
**타임아웃**: 15초
**토큰 제한**: max_tokens 2000

### 3.3 Stage 1: Hybrid Search (`hybrid-search.ts`)

```typescript
// src/lib/hybrid-search.ts

import { ChunkResult } from "@/lib/knowledge";

export interface HybridSearchOptions {
  queries: string[];           // Stage 0의 suggestedSearchQueries + 원본
  embedding: number[];         // 원본 쿼리 임베딩
  limit: number;
  threshold: number;
  sourceTypes: string[] | null;
  enableReranking: boolean;
}

export interface HybridSearchResult {
  chunks: ChunkResult[];
  vectorCount: number;         // 벡터 검색 결과 수
  bm25Count: number;           // BM25 검색 결과 수
  finalCount: number;          // 중복 제거 후 최종 수
}

export async function hybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult>
```

**결합 전략 (Reciprocal Rank Fusion)**:
```
1. 벡터 검색: 기존 search_knowledge RPC (각 쿼리별)
2. BM25 검색: search_knowledge_bm25 RPC (각 쿼리별)
3. 중복 제거 (chunk.id 기준)
4. RRF 스코어 계산:
   rrf_score = Σ (1 / (k + rank_i))  (k = 60)
   - rank_i: 각 검색 결과에서의 순위
5. rrf_score 내림차순 정렬
6. (옵션) Reranking: 기존 rerankChunks() 호출
7. top-N 반환
```

**벡터/BM25 가중치**:
- 벡터 검색: weight 0.6 (의미 유사도)
- BM25 검색: weight 0.4 (키워드 정확도)

### 3.4 관련성 평가 (`relevance-evaluator.ts`)

```typescript
// src/lib/relevance-evaluator.ts

export type RelevanceGrade = "CORRECT" | "AMBIGUOUS" | "INCORRECT";

export interface RelevanceEvaluation {
  grade: RelevanceGrade;
  confidence: number;         // 0.0 ~ 1.0
  reasoning: string;          // 판단 근거 (1~2문장)
}

export async function evaluateRelevance(
  question: string,
  domainAnalysis: DomainAnalysis,
  chunks: ChunkResult[]
): Promise<RelevanceEvaluation>
```

**Sonnet 프롬프트 설계**:
```
수강생 질문과 검색된 강의 자료 청크를 비교하여 관련성을 평가하세요.

질문: {question}
질문 의도: {domainAnalysis.intent}

검색된 자료:
{chunks.map(c => `[${c.lecture_name}] ${c.content.slice(0, 300)}`).join('\n---\n')}

평가 기준:
- CORRECT: 검색 결과가 질문에 직접 답변할 수 있는 내용 포함 (confidence ≥ 0.7)
- AMBIGUOUS: 관련은 있지만 직접 답변하기엔 부족하거나 부분적 (0.3 ≤ confidence < 0.7)
- INCORRECT: 검색 결과가 질문과 거의 무관 (confidence < 0.3)

JSON으로 응답:
{ "grade": "...", "confidence": 0.0~1.0, "reasoning": "..." }
```

**모델**: `claude-sonnet-4-6`
**타임아웃**: 10초
**토큰 제한**: max_tokens 500

### 3.5 Stage 2: 웹서치 (`brave-search.ts`)

```typescript
// src/lib/brave-search.ts

export interface WebSearchContext {
  results: BraveSearchResult[];
  formattedContext: string;    // LLM에 전달할 형식
}

export async function searchWeb(
  domainAnalysis: DomainAnalysis,
  originalQuestion: string
): Promise<WebSearchContext>
```

**실행 조건** (OR):
1. `relevanceGrade === "AMBIGUOUS"` 또는 `"INCORRECT"`
2. `domainAnalysis.questionType === "platform"` (플랫폼 현황 질문)

**검색 쿼리 구성**:
- Stage 0의 `normalizedTerms` + `intent` 기반
- 한국어 검색 (`country: "KR"`)
- 최근 1개월 (`freshness: "pm"`)
- 최대 5개 결과

**컨텍스트 포맷**:
```
## 웹서치 결과 (참고용 — 강의 내용이 우선)
[출처: {title}]({url})
{description}
---
[출처: {title}]({url})
{description}
```

### 3.6 knowledge.ts 수정 (오케스트레이터)

기존 `generate()` 함수 내부에서 `isQAConsumer` 분기를 확장:

```typescript
// knowledge.ts generate() 내부 — QA consumer 전용 확장 파이프라인

if (isQAConsumer && config.enableDomainAnalysis) {
  // ── NEW Stage 0: 도메인 인텔리전스 ──
  const domainAnalysis = await analyzeDomain(query, request.imageDescriptions);

  // 단순+비기술 → 직접 답변 (Stage 1~2 스킵)
  if (domainAnalysis.skipRAG && domainAnalysis.directAnswer) {
    return {
      content: domainAnalysis.directAnswer,
      sourceRefs: [],
      tokensUsed: /* ... */,
      model,
    };
  }

  // ── Stage 1: 유사 QA (기존) + Hybrid Search (개선) ──
  // 기존 유사 QA 검색 로직 유지
  // buildSearchResults → hybridSearch 교체 (enableHybridSearch 플래그)
  const hybridResult = await hybridSearch({
    queries: [query, ...domainAnalysis.suggestedSearchQueries],
    embedding: stage1Embedding,
    limit, threshold, sourceTypes: stage2SourceTypes,
    enableReranking: config.enableReranking,
  });

  // ── NEW: 관련성 평가 (Stage 1→2 게이트) ──
  const relevance = await evaluateRelevance(
    query, domainAnalysis, hybridResult.chunks
  );

  // ── NEW Stage 2: 웹서치 (조건부) ──
  let webContext = "";
  if (config.enableWebSearch &&
      (relevance.grade !== "CORRECT" ||
       domainAnalysis.questionType === "platform")) {
    const webResult = await searchWeb(domainAnalysis, query);
    webContext = webResult.formattedContext;
  }

  // ── Stage 3: 최종 답변 (기존 LLM 호출 확장) ──
  // userContent에 domainAnalysis.intent + webContext 추가
}
```

### 3.7 ConsumerConfig 확장

```typescript
// knowledge.ts ConsumerConfig 추가 필드
interface ConsumerConfig {
  // ... 기존 필드
  enableDomainAnalysis: boolean;  // Stage 0
  enableHybridSearch: boolean;    // BM25 결합
  enableRelevanceEval: boolean;   // 관련성 평가
  enableWebSearch: boolean;       // Stage 2 웹서치
}

// qa consumer만 신규 기능 활성화
const CONSUMER_CONFIGS = {
  qa: {
    // ... 기존 값
    enableDomainAnalysis: true,
    enableHybridSearch: true,
    enableRelevanceEval: true,
    enableWebSearch: true,
  },
  chatbot: {
    // ... 기존 값
    enableDomainAnalysis: true,
    enableHybridSearch: true,
    enableRelevanceEval: true,
    enableWebSearch: true,
  },
  // newsletter, education 등: 모두 false (기존 동작 유지)
}
```

### 3.8 전체 파이프라인 시퀀스 다이어그램

```
questions.ts (after)
  │
  ▼
rag.ts → generateRAGAnswer(title, content, imageDescriptions)
  │
  ▼
knowledge.ts → generate({ query, consumerType: "qa", ... })
  │
  ├─ Stage 0: analyzeDomain(query)
  │   └─ skipRAG? ──yes──▶ directAnswer 반환 (END)
  │   └─ no ──▼
  │
  ├─ Stage 1a: searchSimilarQuestions(query, embedding) [기존]
  │
  ├─ Stage 1b: hybridSearch({
  │     queries: [original, ...suggestedSearchQueries],
  │     embedding, ...
  │   })
  │   ├─ 벡터 검색 (searchChunksByEmbedding) [기존 + 확장 쿼리]
  │   ├─ BM25 검색 (search_knowledge_bm25 RPC) [신규]
  │   ├─ RRF 스코어 결합
  │   └─ rerankChunks [기존]
  │
  ├─ Gate: evaluateRelevance(query, domainAnalysis, chunks)
  │   ├─ CORRECT ──▶ Stage 3으로 (웹서치 스킵)
  │   ├─ AMBIGUOUS ──▶ Stage 2 실행
  │   └─ INCORRECT ──▶ Stage 2 실행
  │
  ├─ Stage 2 (조건부): searchWeb(domainAnalysis, query)
  │   └─ Brave Search API → 결과 포맷팅
  │
  └─ Stage 3: callLLM({
       systemPrompt: QA_SYSTEM_PROMPT,
       userContent: [
         similarQAContext,    [기존]
         contextText,         [기존 + hybrid]
         webContext,           [신규]
         domainContext,        [신규: intent + terms]
         question             [기존]
       ]
     })
     └─ content + sourceRefs 반환
```

## 4. 에러 처리

| 에러 상황 | 처리 전략 | Fallback |
|-----------|-----------|----------|
| Stage 0 (도메인 분석) 실패/타임아웃 | 로그 + 스킵 | 기존 파이프라인 그대로 실행 (domain analysis 없이) |
| BM25 검색 실패 | 로그 + 스킵 | 벡터 검색 결과만 사용 |
| 관련성 평가 실패/타임아웃 | 로그 + 기본값 | `grade: "AMBIGUOUS"` (안전하게 웹서치 실행) |
| Brave Search 실패/타임아웃 | 로그 + 스킵 | RAG 결과만으로 답변 |
| BRAVE_API_KEY 미설정 | 로그 경고 | 웹서치 비활성화, 기존 파이프라인만 |
| Stage 3 LLM 실패 | 기존 에러 핸들링 | `null` 반환 → "AI 답변 생성 실패" |

**핵심 원칙**: 모든 신규 Stage는 실패해도 기존 파이프라인으로 graceful degradation. 기존 답변 품질 이하로 떨어지지 않음.

### 타임아웃 설계

```
Stage 0 (도메인 분석):    15초
Stage 1a (유사 QA):       기존 (제한 없음, 보통 2~3초)
Stage 1b (Hybrid Search): 기존 + BM25 5초
관련성 평가:              10초
Stage 2 (웹서치):         10초
Stage 3 (LLM):           기존 280초

총 최대: ~320초 (worst case)
일반적: ~30~40초 (Stage 0 15초 + 검색 5초 + LLM 20초)
```

## 5. 구현 순서

### Phase 1: DB + 인프라
- [ ] 1. `knowledge_chunks`에 `content_tsv` 컬럼 + GIN 인덱스 추가
- [ ] 2. `search_knowledge_bm25` RPC 함수 생성
- [ ] 3. `knowledge_usage` 테이블에 로깅 컬럼 추가
- [ ] 4. `BRAVE_API_KEY` 환경변수 설정

### Phase 2: 신규 모듈 구현
- [ ] 5. `src/lib/brave-search.ts` — Brave Search API 클라이언트
- [ ] 6. `src/lib/domain-intelligence.ts` — Stage 0 도메인 분석
- [ ] 7. `src/lib/hybrid-search.ts` — 벡터 + BM25 결합 (RRF)
- [ ] 8. `src/lib/relevance-evaluator.ts` — 관련성 평가

### Phase 3: 파이프라인 통합
- [ ] 9. `src/lib/knowledge.ts` — ConsumerConfig 확장 + generate() 파이프라인 수정
- [ ] 10. Stage 3 userContent 확장 (domainContext + webContext 추가)
- [ ] 11. knowledge_usage 로깅 확장

### Phase 4: 테스트 + QA
- [ ] 12. `npm run build` 성공 확인
- [ ] 13. 도메인 용어 질문 테스트 (검색 정확도 개선 확인)
- [ ] 14. 플랫폼 현황 질문 테스트 (웹서치 실행 확인)
- [ ] 15. 단순 비기술 질문 테스트 (Stage 0 직접 답변 확인)
- [ ] 16. graceful degradation 테스트 (각 Stage 실패 시)
- [ ] 17. 응답 시간 측정 (60초 이내 확인)
- [ ] 18. 기존 QA 임베딩/승인 플로우 무영향 확인
