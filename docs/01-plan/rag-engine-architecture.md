# RAG Engine Architecture — BS CAMP Knowledge System

> 이 문서는 BS CAMP의 RAG(Retrieval-Augmented Generation) 엔진 아키텍처를 정의한다.
> 소스 추가/삭제, 모델 교체, 소비자 추가, 검색 전략 변경이 일어나도
> 이 구조 안에서 해결된다. 구조 자체를 바꿀 필요가 없다.

---

## 0. 설계 철학

### 세 가지 원칙

1. **인터페이스로 연결, 구현으로 교체**
   - 모든 핵심 컴포넌트는 인터페이스로 정의
   - 구현은 교체 가능 (임베딩 모델, LLM, 벡터 DB 전부)
   - 교체 시 다른 컴포넌트 코드 변경 0

2. **파이프라인으로 조합, 단계별 확장**
   - 검색 → 정렬 → 조합 → 생성 → 후처리
   - 각 단계는 독립. 단계 추가/제거/교체 자유
   - 새 기능 = 새 파이프라인 단계 추가

3. **설정으로 분기, 코드 변경 최소화**
   - 소비자(Consumer)별 동작 차이 = 설정값 차이
   - 새 소비자 = 설정 등록만으로 완료
   - 프롬프트, 검색 범위, 모델 파라미터 전부 설정

---

## 1. 현재 시스템 분석 (AS-IS)

### 1-1. 파일 맵

```
src/lib/
  knowledge.ts      ← 핵심 (generate, searchChunks, CONSUMER_CONFIGS)
  rag.ts            ← 레거시 래퍼 (searchRelevantChunks, generateRAGAnswer, createAIAnswerForQuestion)
  gemini.ts         ← 임베딩 (generateEmbedding)

src/actions/
  contents.ts       ← reviseContentWithAI, generateContentWithAI (KS 호출)
  questions.ts      ← 질문 등록 → after() → rag.ts → knowledge.ts

src/app/api/
  admin/content/summarize/  ← Gemini Flash 직접 호출 (KS 미사용)
  admin/email/ai-write/     ← KS 호출
  diagnose/                 ← 진단 엔진 (RAG 무관)
```

### 1-2. 현재 데이터 흐름

```
질문(Query)
  ↓
generateEmbedding(query)          ← Gemini embedding-001, 768차원
  ↓
match_lecture_chunks(RPC)         ← pgvector 코사인 유사도
  ↓ [limit, threshold, source_type 필터]
chunks[] (상위 N개)
  ↓
truncateToTokenBudget(combined)   ← 글자수 기준 자르기
  ↓
Anthropic API (Opus 4.6)          ← system + "참고 자료\n{context}\n질문\n{query}"
  ↓
{ content, sourceRefs, tokensUsed }
```

### 1-3. 잘 된 것

| 항목 | 설명 |
|------|------|
| Consumer 패턴 | 6개 소비자가 동일 generate() 함수 공유. 설정만 다름 |
| systemPromptOverride | 외부에서 프롬프트 교체 가능 (확장점) |
| fire-and-forget 로깅 | 로깅 실패가 응답을 차단하지 않음 |
| source_type 필터링 | 소비자별 소스 범위 제한 가능 |
| 순환 의존성 방지 | knowledge.ts에 인라인 검색 (rag.ts 미import) |

### 1-4. 개선 필요

| 항목 | 현재 | 문제 |
|------|------|------|
| rag.ts 중복 | searchRelevantChunks가 knowledge.ts와 동일 로직 | 2곳 유지보수 |
| summarize 라우트 | Gemini Flash 직접 호출 | KS 우회 → 로깅 누락, 일관성 깨짐 |
| 임베딩 하드코딩 | gemini.ts에 모델명 고정 | 모델 교체 시 코드 수정 필요 |
| 재랭킹 없음 | 유사도 순서 그대로 사용 | 소스 우선순위(강의>QA>크롤) 미반영 |
| 토큰 예산 | 글자수 기준 truncate | 토큰 수와 글자수 불일치 (한국어) |
| 폴백 없음 | 검색 결과 0건 시 빈 컨텍스트로 생성 | 품질 저하 |
| 캐싱 없음 | 동일 질문도 매번 임베딩+검색+생성 | 비용/지연 낭비 |

---

## 2. 목표 아키텍처 (TO-BE)

### 2-1. 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│                        RAG Engine                                 │
│                                                                   │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────┐    │
│  │ Embedding    │   │ ChunkStore   │   │ Generator          │    │
│  │ Provider     │   │              │   │                    │    │
│  │ ─────────── │   │ ──────────── │   │ ────────────────── │    │
│  │ · Gemini  ◄─┤   │ · Supabase ◄─┤   │ · Anthropic     ◄──┤   │
│  │ · (local)   │   │ · (pinecone) │   │ · (gemini flash) │    │
│  │ · (openai)  │   │ · (qdrant)   │   │ · (openai)       │    │
│  └──────┬──────┘   └──────┬───────┘   └────────┬───────────┘   │
│         │                  │                     │                │
│         ▼                  ▼                     ▼                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Pipeline                                  │ │
│  │                                                              │ │
│  │  Query → [Preprocessor] → [Retriever] → [Assembler]         │ │
│  │          → [Generator] → [PostProcessor] → Response          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│         ▲                                        │                │
│         │                                        ▼                │
│  ┌──────┴──────┐                          ┌────────────┐         │
│  │ Consumer    │                          │ Usage      │         │
│  │ Registry    │                          │ Logger     │         │
│  │ ─────────── │                          │ ────────── │         │
│  │ qa, news,   │                          │ knowledge  │         │
│  │ edu, chat.. │                          │ _usage     │         │
│  └─────────────┘                          └────────────┘         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Context Providers (Optional, Pluggable)                      │ │
│  │ · PerformanceContext   · UserHistoryContext                   │ │
│  │ · SeasonalContext      · (custom)                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2-2. 인터페이스 정의

```typescript
// ─── 핵심 타입 ──────────────────────────────────────────

type SourceType = "lecture" | "qa_archive" | "crawl" | "meeting" | "manual";
// 확장: union에 값 추가만으로 새 소스 지원

type ConsumerType = "qa" | "newsletter" | "education" | "webinar" | "chatbot" | "promo";
// 확장: union에 값 추가 + ConsumerRegistry에 설정 등록

interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  metadata: {
    lectureName: string;
    week: string;
    chunkIndex: number;
    sourceType: SourceType;
    priority: number;        // 1=강의, 2=QA, 3=크롤, 4=회의, 5=수동
    [key: string]: unknown;  // 확장 메타데이터
  };
}

interface KnowledgeRequest {
  query: string;
  consumerType: ConsumerType;
  // 전부 optional — 미지정 시 consumer 기본값 사용
  sourceTypes?: SourceType[];
  limit?: number;
  threshold?: number;
  tokenBudget?: number;
  temperature?: number;
  systemPromptOverride?: string;
  contextProviders?: string[];  // 추가 컨텍스트 소스 이름
  questionId?: string;
  contentId?: string;
}

interface KnowledgeResponse {
  content: string;
  sourceRefs: SourceRef[];
  tokensUsed: number;
  model: string;
  metadata?: {
    retrievalTimeMs: number;
    generationTimeMs: number;
    chunksRetrieved: number;
    chunksUsed: number;
  };
}

// ─── 컴포넌트 인터페이스 ────────────────────────────────

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  readonly dimensions: number;
  readonly modelName: string;
}

interface ChunkStore {
  search(embedding: number[], options: SearchOptions): Promise<ChunkResult[]>;
  upsert(chunks: ChunkInput[]): Promise<void>;
  delete(filter: ChunkFilter): Promise<number>;
  count(filter?: ChunkFilter): Promise<number>;
}

interface SearchOptions {
  limit: number;
  threshold: number;
  sourceTypes?: SourceType[] | null;
}

interface Retriever {
  retrieve(query: string, config: RetrieverConfig): Promise<ChunkResult[]>;
}

interface RetrieverConfig {
  limit: number;
  threshold: number;
  sourceTypes?: SourceType[] | null;
  tokenBudget: number;
  rerank?: boolean;
  priorityWeights?: Record<SourceType, number>;
}

interface ContextProvider {
  readonly name: string;
  getContext(): Promise<string | null>;
  // null = 이 소스에서 제공할 컨텍스트 없음 (graceful skip)
}

interface Generator {
  generate(params: GenerateParams): Promise<GenerateResult>;
  readonly modelName: string;
}

interface GenerateParams {
  systemPrompt: string;
  userContent: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

interface UsageLogger {
  log(entry: UsageEntry): void;  // fire-and-forget, never throws
}
```

### 2-3. 소비자 레지스트리

```typescript
interface ConsumerConfig {
  // 검색 설정
  retriever: {
    limit: number;
    threshold: number;
    sourceTypes: SourceType[] | null;  // null = 전체
    rerank: boolean;
    priorityWeights?: Record<SourceType, number>;
  };
  // 생성 설정
  generator: {
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    systemPrompt: string;
  };
  // 컨텍스트 설정
  contextProviders?: string[];  // 추가 컨텍스트 소스 이름 목록
}
```

**현재 소비자 매핑 (6개):**

| Consumer | 검색 | 소스 | 온도 | 컨텍스트 | 용도 |
|----------|------|------|------|----------|------|
| qa | limit:5, th:0.4 | lecture, qa_archive, manual | 0.3 | — | Q&A 답변 |
| newsletter | limit:5, th:0.4 | lecture, crawl | 0.5 | — | 뉴스레터 초안 |
| education | limit:7, th:0.5 | lecture | 0.3 | — | 교육 콘텐츠 |
| webinar | limit:3, th:0.4 | lecture, crawl | 0.6 | — | 웨비나 안내 |
| chatbot | limit:5, th:0.3 | 전체(null) | 0.4 | — | 실시간 챗봇 |
| promo | limit:3, th:0.5 | lecture, manual | 0.7 | — | 프로모션 |

**확장 예시:**
```
qa_with_performance:
  검색: qa와 동일
  컨텍스트: ["performance"]  ← PerformanceContext 추가
  프롬프트: QA 프롬프트 + "수강생 성과 데이터를 참고해서 근거 제시"
  → 기존 qa consumer 코드 변경 0. 새 설정만 등록.
```

---

## 3. 파이프라인 상세

### 3-1. 5단계 파이프라인

```
[1. Preprocessor] → [2. Retriever] → [3. Assembler] → [4. Generator] → [5. PostProcessor]
```

각 단계는 독립적. 단계 교체/추가/제거 시 다른 단계 영향 없음.

### Stage 1: Query Preprocessor

```
입력: raw query string
출력: processed query string

현재: 없음 (query 그대로 사용)
확장 가능:
  · 질문 정규화 (줄임말 → 풀어쓰기: "ㄹㅇ" → "진짜")
  · 쿼리 확장 (HyDE: 가상 답변 생성 후 임베딩)
  · 언어 감지 + 번역
  · 키워드 추출 (하이브리드 검색용)
```

**구현 원칙:** 현재는 identity function (입력=출력). 필요할 때 단계 추가.

### Stage 2: Retriever

```
입력: processed query, RetrieverConfig
출력: ChunkResult[] (정렬됨, 예산 내)

현재 구현 (VectorRetriever):
  query → embed → pgvector similarity search → source_type 필터 → similarity 순 반환

파이프라인 내부:
  2a. Embed        — EmbeddingProvider.embed(query)
  2b. Search       — ChunkStore.search(embedding, options)
  2c. Filter       — source_type, threshold 필터
  2d. Rerank       — (현재 없음) 소스 우선순위 재정렬
  2e. Budget Trim  — 토큰 예산에 맞게 자르기
```

**재랭킹 전략 (확장):**
```
// 우선순위 가중 재랭킹
finalScore = similarity * (1 - α) + priorityBonus * α

priorityBonus:
  lecture     → 1.0   (최고 신뢰: 강사 직접 생성)
  qa_archive  → 0.8   (검증됨: 관리자 승인된 답변)
  manual      → 0.7   (수동 입력: 보충 자료)
  meeting     → 0.5   (비구조: 회의록)
  crawl       → 0.3   (외부: 신뢰도 낮음)

α = 0.2 (기본값. 유사도 80%, 우선순위 20%)
```

### Stage 3: Context Assembler

```
입력: chunks[], systemPrompt, query, contextProviders[]
출력: { systemPrompt, userContent } (LLM에 보낼 최종 입력)

조합 순서:
  1. System Prompt (consumer 기본값 또는 override)
  2. Context Providers (등록된 순서대로)
     · PerformanceContext: "현재 수강생 성과: 평균 ROAS 3.2배..."
     · UserHistoryContext: "이 수강생의 최근 질문 이력..."
     · (null이면 자동 스킵)
  3. Retrieved Chunks: "[강의명 - 주차]\n내용..."
  4. User Query

최종 userContent 구성:
  "## 참고 자료\n{systemContext}\n{chunks}\n\n## 질문\n{query}"
```

**Context Provider 등록 패턴:**
```typescript
// 새 컨텍스트 소스 추가 = 인터페이스 구현 + 등록
class PerformanceContextProvider implements ContextProvider {
  name = "performance";
  async getContext(): Promise<string | null> {
    const stats = await performanceService.getPerformanceContext();
    return stats || null;  // 데이터 없으면 null → 자동 스킵
  }
}

// 등록
contextRegistry.register(new PerformanceContextProvider());
// 사용: consumer config에 contextProviders: ["performance"] 추가
```

### Stage 4: Generator

```
입력: systemPrompt, userContent, temperature, maxTokens, timeoutMs
출력: { content, inputTokens, outputTokens }

현재 구현 (AnthropicGenerator):
  Anthropic Messages API → Opus 4.6
  timeout: 280s (Vercel maxDuration=300 - 20s 여유)

에러 핸들링:
  401/403 → "접근 권한 없음" (API 키 문제)
  timeout → "응답 시간 초과"
  5xx    → 재시도 1회 후 에러
```

### Stage 5: Post Processor

```
입력: GenerateResult, chunks[], request
출력: KnowledgeResponse

처리:
  1. 출처 참조(SourceRef) 생성 — chunks에서 추출
  2. 토큰 합산 — inputTokens + outputTokens
  3. 사용량 로깅 — UsageLogger.log() (fire-and-forget)
  4. (확장) 응답 품질 체크 — 할루시네이션 감지, 길이 검증
  5. (확장) 캐시 저장 — 동일 질문 재사용

확장 가능:
  · 응답 후처리 (마크다운 정리, 불필요한 서두 제거)
  · 품질 점수 계산 (검색 관련성 + 응답 일관성)
  · A/B 테스트 메타데이터 태깅
```

---

## 4. 확장 시나리오

### 4-1. 새 소스 타입 추가 (예: "webinar_recording")

```
변경:
  1. SourceType union에 "webinar_recording" 추가
  2. lecture_chunks에 source_type="webinar_recording"인 행 삽입
  3. 필요한 consumer의 sourceTypes 배열에 추가

코드 변경: 타입 1줄 + 설정 1줄
검색 함수: 변경 없음 (source_type 필터가 이미 존재)
임베딩: 변경 없음 (텍스트이면 처리됨)
```

### 4-2. 새 소비자 추가 (예: "lead_nurture")

```
변경:
  1. ConsumerType union에 "lead_nurture" 추가
  2. CONSUMER_CONFIGS에 설정 등록
     { limit: 3, threshold: 0.5, temperature: 0.6,
       sourceTypes: ["lecture", "manual"],
       systemPrompt: "당신은 잠재 고객에게 자사몰사관학교를 소개하는...",
       contextProviders: ["performance"] }

코드 변경: 타입 1줄 + 설정 블록
generate() 함수: 변경 없음
```

### 4-3. 임베딩 모델 교체 (예: OpenAI text-embedding-3-large)

```
변경:
  1. OpenAIEmbeddingProvider 구현 (embed 함수)
  2. EmbeddingProvider 주입 대상 변경
  3. ★ 기존 벡터 전부 재임베딩 (차원/공간 다름)
     → lecture_chunks 벡터 업데이트 스크립트
  4. pgvector 인덱스 dimensions 확인/조정

코드 변경: Provider 1개 파일 + DI 설정 1줄
generate() 함수: 변경 없음
검색 로직: 변경 없음
주의: 벡터 공간 변경 → 검색 품질 모니터링 필수
```

### 4-4. LLM 모델 교체/분기 (예: 소비자별 다른 모델)

```
변경:
  1. 새 Generator 구현 (예: GeminiFlashGenerator)
  2. ConsumerConfig에 generator 이름 지정
     newsletter: { generator: "gemini-flash", temperature: 0.7 }
     qa: { generator: "anthropic-opus", temperature: 0.3 }

코드 변경: Generator 1개 파일 + 설정
기존 모든 소비자: 영향 없음
```

### 4-5. 검색 전략 변경 (예: 하이브리드 검색)

```
변경:
  1. HybridRetriever 구현 (vector + keyword 점수 합산)
  2. match_lecture_chunks RPC에 텍스트 검색 추가
     또는 별도 keyword_search RPC 추가
  3. Retriever 주입 대상 변경

코드 변경: Retriever 1개 파일 + RPC 1개
generate() 함수: 변경 없음
기존 VectorRetriever: 삭제하지 않고 유지 (폴백 용도)
```

### 4-6. 성과 데이터 → QA 답변 연결

```
변경:
  1. PerformanceContextProvider 구현
  2. contextRegistry에 등록
  3. qa consumer에 contextProviders: ["performance"] 추가
     또는 별도 "qa_enhanced" consumer 생성

코드 변경: Provider 1개 + 설정 수정
KnowledgeService generate(): 변경 없음
PerformanceService: 독립 (RAG 엔진과 무관)
```

### 4-7. QA 답변 → 지식 베이스 피드백 루프

```
변경:
  1. 관리자 승인된 답변 → lecture_chunks에 source_type="qa_archive"로 삽입
  2. 임베딩 생성 → 벡터 저장
  3. 자동화: 승인 시 트리거 또는 cron

코드 변경: actions/answers.ts에 승인 후 훅 추가
lecture_chunks: 기존 스키마 그대로 (source_type만 다름)
검색: 변경 없음 (qa consumer의 sourceTypes에 이미 "qa_archive" 포함)
```

### 4-8. 소비자 제거

```
"webinar" 소비자가 더 이상 필요 없다면:
  1. CONSUMER_CONFIGS에서 webinar 항목 삭제
  2. ConsumerType union에서 "webinar" 제거
  3. 호출하는 코드에서 consumerType: "webinar" 제거

영향: 다른 소비자 전부 무영향
검색/생성/로깅: 변경 없음
```

---

## 5. 데이터 모델

### 5-1. lecture_chunks (벡터 스토어)

```sql
CREATE TABLE lecture_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_name  TEXT NOT NULL,       -- 강의/자료 이름
  week          TEXT NOT NULL,       -- 주차 (예: "week 0", "week 3")
  chunk_index   INTEGER NOT NULL,    -- 청크 순번
  content       TEXT NOT NULL,       -- 청크 텍스트
  embedding     vector(768),         -- Gemini embedding-001 (768차원)
  source_type   TEXT NOT NULL,       -- "lecture" | "qa_archive" | "crawl" | "meeting" | "manual"
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 벡터 검색 인덱스
CREATE INDEX ON lecture_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 소스 타입 필터용
CREATE INDEX ON lecture_chunks (source_type);
```

**metadata JSONB 활용:**
```json
{
  "author": "smith",
  "priority": 1,
  "topic_tags": ["CBO", "예산"],
  "cohort": "5기",
  "original_question_id": "uuid",     // qa_archive인 경우
  "crawl_url": "https://...",         // crawl인 경우
  "last_verified": "2026-02-16"       // 정보 최신성
}
```

### 5-2. knowledge_usage (사용 로그)

```sql
CREATE TABLE knowledge_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_type TEXT NOT NULL,
  source_types  TEXT[] DEFAULT '{}',
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0,
  model         TEXT NOT NULL,
  question_id   UUID,                 -- QA인 경우
  content_id    UUID,                 -- 콘텐츠인 경우
  duration_ms   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  -- 확장 필드
  chunks_retrieved INTEGER,           -- 검색된 청크 수
  chunks_used      INTEGER,           -- 실제 사용된 청크 수
  retrieval_ms     INTEGER,           -- 검색 소요 시간
  cache_hit        BOOLEAN DEFAULT FALSE
);
```

### 5-3. match_lecture_chunks (RPC)

```sql
-- 현재 버전 (v2: source_type 필터 포함)
CREATE OR REPLACE FUNCTION match_lecture_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  lecture_name text,
  week text,
  chunk_index int,
  content text,
  source_type text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id, lc.lecture_name, lc.week, lc.chunk_index,
    lc.content, lc.source_type, lc.metadata,
    1 - (lc.embedding <=> query_embedding) AS similarity
  FROM lecture_chunks lc
  WHERE 1 - (lc.embedding <=> query_embedding) > match_threshold
    AND (filter_source_types IS NULL OR lc.source_type = ANY(filter_source_types))
  ORDER BY lc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**확장 가능 (하이브리드 검색 시):**
```sql
-- v3: 텍스트 + 벡터 하이브리드 (필요 시)
-- tsvector 컬럼 + GIN 인덱스 추가
-- 최종 점수 = α * vector_similarity + (1-α) * text_rank
```

---

## 6. 현재 코드 → 아키텍처 매핑

### 6-1. 즉시 적용 가능 (코드 변경 없음)

| 아키텍처 컴포넌트 | 현재 코드 | 상태 |
|------------------|----------|------|
| EmbeddingProvider | `gemini.ts` → generateEmbedding | ✅ 이미 분리됨 |
| ChunkStore.search | knowledge.ts → searchChunks (인라인) | ✅ 작동 중 |
| Generator | knowledge.ts → fetch(Anthropic API) | ✅ 작동 중 |
| ConsumerRegistry | CONSUMER_CONFIGS 객체 | ✅ 확장 가능 |
| UsageLogger | knowledge_usage insert (fire-and-forget) | ✅ 작동 중 |
| Pipeline | generate() 함수 내부 순서 | ✅ 암묵적 파이프라인 |

### 6-2. 정리 필요 (리팩터링)

| 항목 | 현재 | 목표 | 우선순위 |
|------|------|------|---------|
| rag.ts 제거 | knowledge.ts와 중복 | rag.ts의 역할을 knowledge.ts로 통합, rag.ts는 re-export만 | P1 |
| summarize 라우트 | Gemini Flash 직접 호출 | KS consumer "summary" 추가로 통합 | P2 |
| 인터페이스 추출 | 암묵적 | 명시적 TypeScript interface 파일 분리 | P2 |
| ContextProvider | 없음 | 인터페이스 + PerformanceContext 구현 | P3 |
| Reranker | 없음 | 소스 우선순위 기반 재랭킹 | P3 |

### 6-3. 마이그레이션 경로

```
Phase A: 정리 (기존 동작 유지)
  A-1. rag.ts → knowledge.ts 위임으로 변경 (중복 제거)
  A-2. types/knowledge.ts 파일에 인터페이스 추출
  A-3. summarize 라우트 → KS consumer "summary" 추가

Phase B: 확장 인프라
  B-1. ContextProvider 인터페이스 + 레지스트리
  B-2. PerformanceContextProvider 구현
  B-3. 재랭킹 로직 추가 (similarity + priority 가중)

Phase C: 피드백 루프
  C-1. 승인된 답변 → qa_archive 자동 임베딩
  C-2. 검색 품질 모니터링 대시보드
  C-3. 사용량/비용 분석 뷰
```

---

## 7. ADR (Architecture Decision Records)

### ADR-R1: 단일 generate() 함수 유지

**Status:** Accepted
**Decision:** 모든 소비자가 동일한 generate() 진입점을 사용한다.
**Why:** 로깅, 에러 처리, 타임아웃이 한 곳에서 관리됨. 소비자별 분기는 설정값으로만 처리.
**Trade-off:** 특수한 소비자가 완전히 다른 파이프라인이 필요하면 generate()가 복잡해질 수 있음. → 그때 별도 함수 분리 (예: generateStream).

### ADR-R2: 인라인 검색 유지 (순환 의존성 방지)

**Status:** Accepted
**Decision:** knowledge.ts 내부에 searchChunks를 인라인으로 유지한다. rag.ts를 import하지 않는다.
**Why:** rag.ts → knowledge.ts 의존 방향이 이미 고정. 역방향 import하면 순환.
**Alternative:** 별도 search-service.ts로 추출 → 양쪽 모두 import 가능. 그러나 현재 규모에서 과도한 분리. 복잡성 대비 가치 낮음.

### ADR-R3: 임베딩은 Gemini 유지, 생성은 Anthropic 유지

**Status:** Accepted
**Decision:** 임베딩 = Gemini embedding-001, 생성 = Anthropic Opus 4.6. 각각 최선의 선택.
**Why:**
- 임베딩: Gemini는 한국어 멀티링구얼 지원 우수 + 비용 저렴 ($0.00025/1K tokens)
- 생성: Opus 4.6은 한국어 교육 콘텐츠 품질 최고. 코칭 톤 자연스러움.
**Risk:** Gemini 임베딩 모델 deprecation (이미 한 번 경험: text-embedding-004 → embedding-001). 인터페이스 분리로 대비.

### ADR-R4: 소스 우선순위는 설정으로 관리

**Status:** Proposed
**Decision:** 재랭킹 시 소스별 우선순위 가중치를 ConsumerConfig에 명시한다.
**Why:** 소비자마다 신뢰하는 소스가 다를 수 있음. QA는 강의 우선, 뉴스레터는 트렌드(crawl) 우선.
**Implementation:** RetrieverConfig.priorityWeights에 소스별 가중치 (0~1).

### ADR-R5: ContextProvider는 Optional이고 Graceful

**Status:** Proposed
**Decision:** ContextProvider가 null을 반환하면 자동 스킵. 에러 발생 시 catch 후 스킵.
**Why:** 성과 데이터가 없어도 QA는 정상 작동해야 함. 부가 컨텍스트는 보너스이지 필수가 아님.
**Principle:** RAG 핵심(검색+생성)은 항상 작동. 추가 컨텍스트는 best-effort.

### ADR-R6: 캐싱은 임베딩 레벨에서만

**Status:** Proposed
**Decision:** 동일 쿼리의 임베딩만 캐싱한다. 최종 응답은 캐싱하지 않는다.
**Why:**
- 임베딩 캐싱: 동일 쿼리 반복 시 Gemini API 호출 절약 (비용 + 지연)
- 응답 캐싱 안 하는 이유: 지식 베이스가 업데이트되면 같은 질문에도 다른 답변이 나와야 함
- 구현: in-memory LRU (TTL 1시간) 또는 Redis (배포 환경)
**Trade-off:** 응답 캐싱 없으므로 동일 질문도 LLM 비용 발생. 허용 가능 (QA 빈도 낮음).

---

## 8. 비용 모델

### 8-1. 현재 비용 구조

| 컴포넌트 | 단가 | 단위 |
|----------|------|------|
| Gemini 임베딩 | ~$0.00025 | /1K tokens |
| Anthropic Opus 4.6 입력 | $15 | /1M tokens |
| Anthropic Opus 4.6 출력 | $75 | /1M tokens |
| Supabase pgvector | 무료 (Pro 플랜 포함) | — |

### 8-2. QA 1건당 예상 비용

```
임베딩: ~100 tokens (질문) → $0.000025
검색: pgvector → $0 (DB 내부)
생성 입력: ~4,000 tokens (system + context + query) → $0.06
생성 출력: ~500 tokens (답변) → $0.0375
로깅: INSERT 1행 → $0

합계: ~$0.10/건
```

### 8-3. 비용 절감 레버

| 전략 | 절감 | 난이도 |
|------|------|--------|
| 임베딩 캐싱 | 임베딩 비용 80% | 낮음 |
| tokenBudget 최적화 | 입력 비용 30-50% | 중간 |
| Sonnet 4 분기 (낮은 복잡도 질문) | 생성 비용 90% | 중간 |
| 응답 캐싱 (동일 질문) | 전체 비용 100% (캐시 히트 시) | 높음 (freshness 이슈) |

---

## 9. 모니터링 지표

### 9-1. 검색 품질

| 지표 | 측정 방법 | 목표 |
|------|----------|------|
| 평균 유사도 | knowledge_usage 로그에 추가 | > 0.5 |
| 빈 결과 비율 | chunks_retrieved = 0 비율 | < 10% |
| 관리자 수정률 | AI 답변 승인 시 수정 여부 | < 30% |

### 9-2. 생성 품질

| 지표 | 측정 방법 | 목표 |
|------|----------|------|
| 승인률 | is_approved / total AI answers | > 70% |
| 평균 응답 시간 | duration_ms | < 20s |
| 토큰 효율 | output_tokens / input_tokens | > 0.1 |

### 9-3. 시스템 건강

| 지표 | 측정 방법 | 경보 기준 |
|------|----------|----------|
| 타임아웃 비율 | 에러 로그 | > 5% |
| API 비용 | daily tokens * 단가 | > $10/일 |
| 청크 커버리지 | 질문 주제 vs 청크 주제 맵핑 | 빈 영역 존재 시 알림 |

---

## 10. 레이어 검증

| 질문 | 답변 |
|------|------|
| 임베딩 모델 교체 시 generate() 수정 필요? | ❌ 불필요. EmbeddingProvider만 교체 |
| 새 소비자 추가 시 검색 로직 수정? | ❌ 불필요. 설정만 추가 |
| LLM 교체 시 검색 영향? | ❌ 없음. Generator만 교체 |
| 소스 타입 추가 시 RPC 수정? | ❌ 불필요. source_type 필터가 동적 |
| 성과 데이터 연결 시 knowledge.ts 수정? | ❌ 불필요. ContextProvider + systemPromptOverride |
| 특정 소비자 삭제 시 다른 소비자 영향? | ❌ 없음. 독립된 설정 |
| pgvector → Pinecone 전환 시? | ChunkStore 구현만 교체. 나머지 전부 무영향 |
| QA 답변을 지식 베이스에 피드백? | lecture_chunks에 INSERT만. 검색은 자동 포함 |

---

## 부록 A: 파일 구조 (목표)

```
src/lib/
  knowledge/
    types.ts           ← 인터페이스 (EmbeddingProvider, ChunkStore, Generator, etc.)
    config.ts          ← CONSUMER_CONFIGS (레지스트리)
    generate.ts        ← generate() 메인 함수 (현재 knowledge.ts)
    search.ts          ← searchChunks (인라인 → 분리)
    providers/
      gemini-embedding.ts    ← EmbeddingProvider 구현
      anthropic-generator.ts ← Generator 구현
      supabase-store.ts      ← ChunkStore 구현
    context/
      performance.ts   ← PerformanceContextProvider
      registry.ts      ← ContextProvider 레지스트리
    utils/
      token-budget.ts  ← 토큰 예산 관리
      reranker.ts      ← 소스 우선순위 재랭킹
  rag.ts               ← deprecated re-export (호환성)
```

**마이그레이션 원칙:**
- 현재 knowledge.ts = 그대로 유지 (작동하는 코드)
- 새 파일은 knowledge.ts를 감싸거나 확장
- 기존 import 경로(`@/lib/knowledge`) 유지 (re-export)
- 점진적 분리: 필요한 시점에 하나씩