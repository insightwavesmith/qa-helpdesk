# KnowledgeService 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### knowledge_chunks 테이블 (실제 테이블)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| lecture_name | text | 강의명 |
| week | text | 주차 정보 |
| chunk_index | integer | 청크 순서 |
| chunk_total | integer | 전체 청크 수 |
| content | text | 청크 본문 |
| embedding | vector(768) | 텍스트 임베딩 |
| source_type | text | 소스 타입 (13종) |
| source_ref | text | 원본 참조 |
| priority | integer | 우선순위 |
| topic_tags | text[] | 토픽 태그 |
| image_url | text | 이미지 URL |
| image_description | text | 이미지 설명 |
| image_embedding | vector(768) | 이미지 임베딩 |
| content_id | uuid | contents FK |
| embedding_model | text | 임베딩 모델명 |
| search_vector | tsvector | 전문검색 벡터 |
| metadata | jsonb | 확장 메타데이터 |

> `lecture_chunks`는 DB 뷰(읽기 전용 별칭)로만 존재

### source_type 값 (13종)
`lecture`, `blueprint`, `papers`, `qa`, `qa_question`, `qa_answer`, `crawl`, `meeting`, `marketing_theory`, `webinar`, `youtube`, `assignment`, `feedback`

## 2. API 설계

### KnowledgeService (모듈, 클래스 아님 — src/lib/knowledge.ts)

```typescript
// 타입 정의
type ConsumerType = "qa" | "newsletter" | "education" | "webinar" | "chatbot" | "promo";
type SourceType = "lecture" | "blueprint" | "papers" | "qa" | "qa_question" | "qa_answer"
  | "crawl" | "meeting" | "marketing_theory" | "webinar" | "youtube" | "assignment" | "feedback";

interface KnowledgeRequest {
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

interface KnowledgeResponse {
  content: string;
  sourceRefs: SourceRef[];
  tokensUsed: number;
  model: string; // consumer에 따라 다름 (qa→sonnet, 나머지→opus)
}
```

### Consumer 6종 RAG 파라미터

| Consumer | limit | threshold | budget | sourceTypes | temperature | model | reranking | expansion | thinking |
|----------|-------|-----------|--------|-------------|-------------|-------|-----------|-----------|----------|
| qa | 5 | 0.4 | 3000 | lecture, blueprint, papers, qa, qa_answer | 0.3 | claude-sonnet-4-6 | ✅ | ✅ | ✅ (5000) |
| newsletter | 5 | 0.4 | 3000 | lecture, crawl | 0.5 | claude-opus-4-6 | ❌ | ❌ | ❌ |
| education | 7 | 0.5 | 5000 | lecture | 0.3 | claude-opus-4-6 | ❌ | ❌ | ❌ |
| webinar | 3 | 0.4 | 2000 | lecture, crawl | 0.6 | claude-opus-4-6 | ❌ | ❌ | ❌ |
| chatbot | 5 | 0.3 | 4000 | null (전체) | 0.4 | claude-sonnet-4-6 | ✅ | ✅ | ✅ (5000) |
| promo | 3 | 0.5 | 2000 | lecture, blueprint | 0.7 | claude-opus-4-6 | ❌ | ❌ | ❌ |

> 핵심: qa/chatbot만 Sonnet + Reranking + Expansion + Extended Thinking 사용. 나머지는 Opus (단순 생성).

### 멀티스테이지 파이프라인 (generate 함수)

| Stage | 설명 | qa/chatbot만 |
|-------|------|:---:|
| Stage 0 | 이미지 설명 결합 (imageDescriptions → query 합치기) | ✅ |
| Stage 1 | 유사 QA 검색 (searchSimilarQuestions: qa_question 0.70 threshold) | ✅ |
| Stage 2 | buildSearchResults (Query Expansion → 임베딩 → Vector Search → Dedup → Reranking) | ✅ (expansion/rerank) |
| Stage 2b | buildContext (토큰 예산 내 컨텍스트 조립) | 모두 |
| Stage 3 | callLLM (Anthropic Messages API, Extended Thinking 지원) | 모두 |

### 검색 함수

```typescript
// 텍스트 → 임베딩 → RPC 호출
searchChunks(queryText, limit, threshold, sourceTypes?): ChunkResult[]

// 외부 임베딩 전달 (중복 생성 방지)
searchChunksByEmbedding(embedding, queryText, limit, threshold, sourceTypes?): ChunkResult[]

// RPC: search_knowledge (pgvector + tsvector 하이브리드)
```

### 유사 QA 검색 (Stage 1)

```typescript
searchSimilarQuestions(queryText, embedding):
  1. qa_question chunks 검색 (limit 3, threshold 0.70)
  2. metadata.question_id 추출
  3. 해당 question_id의 qa_answer chunks 조회
  4. question-answer 쌍으로 그룹핑
```

### SourceRef 인터페이스

```typescript
interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  similarity: number;       // similarity_score 아님
  source_type?: string;
  priority?: number;
  final_score?: number;
}
```

## 3. 컴포넌트 구조

### 핵심 파일
```
src/lib/
├── knowledge.ts     — KnowledgeService 모듈: generate(), searchChunks(), getConsumerConfig()
├── rag.ts           — generateRAGAnswer(), createAIAnswerForQuestion()
├── gemini.ts        — generateEmbedding() (gemini-embedding-001), generateFlash()
├── reranker.ts      — Gemini Flash 리랭킹
├── query-expander.ts — 쿼리 확장
├── qa-embedder.ts   — QA 분리 임베딩
└── chunk-utils.ts   — chunkText(700자, 100 overlap)
```

### 의존성 흐름
```
rag.ts → knowledge.ts → gemini.ts (임베딩)
                       → reranker.ts (리랭킹)
                       → query-expander.ts (확장)
                       → Anthropic API (LLM 호출)
```

> 주의: knowledge.ts에서 rag.ts import 금지 (순환 의존성)

## 4. 에러 처리

| 에러 | 대응 |
|------|------|
| ANTHROPIC_API_KEY 미설정 | throw Error |
| Opus/Sonnet 403/401 | throw Error("Opus 4.6 접근 권한 없음") |
| 280초 타임아웃 | AbortController, "AI 응답 시간 초과" |
| RAG 검색 0건 | 컨텍스트 없이 답변 생성 시도 |
| Vector search 실패 | 로그 기록, 빈 배열 반환 |

### 사용량 로깅

`knowledge_usage` 테이블에 fire-and-forget으로 기록:
- consumer_type, source_types, input/output/total_tokens, model
- question_id, content_id, duration_ms
- rerank_scores, expanded_queries, image_count
- chunks_before_rerank, chunks_after_rerank, similar_qa_count

## 5. 구현 상태
- [x] knowledge_chunks 테이블 (13 source_type)
- [x] KnowledgeService 모듈 (generate, searchChunks, getConsumerConfig)
- [x] Consumer 6종 파라미터
- [x] 멀티스테이지 파이프라인 (Stage 0~3)
- [x] 유사 QA 검색 (Stage 1)
- [x] Query Expansion + Reranking (qa/chatbot)
- [x] Extended Thinking 지원 (qa/chatbot)
- [x] 사용량 로깅 (knowledge_usage)

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `generate({ query: "CBO 설정", consumerType: "qa" })` | QA 소비자 요청 | `{ content: string, sourceRefs: SourceRef[], model: "claude-sonnet-4-6" }` | QA consumer 전체 파이프라인 |
| `generate({ query: "이번 주 뉴스", consumerType: "newsletter" })` | newsletter 소비자 | `{ model: "claude-opus-4-6" }` | newsletter consumer Opus 사용 |
| `getConsumerConfig("qa")` | qa 타입 | `{ limit: 5, threshold: 0.4, enableReranking: true, enableExpansion: true, enableThinking: true }` | QA 설정 정확성 |
| `getConsumerConfig("chatbot")` | chatbot 타입 | `{ sourceTypes: null, enableReranking: true }` | chatbot 전체 source 검색 + 리랭킹 |
| `getConsumerConfig("newsletter")` | newsletter 타입 | `{ enableReranking: false, enableExpansion: false }` | newsletter 리랭킹/확장 비활성화 |
| `searchChunks("메타 광고", 5, 0.4, ["lecture"])` | 텍스트 쿼리 | `ChunkResult[]` (유사도 ≥ 0.4) | pgvector + tsvector 하이브리드 |
| `searchChunksByEmbedding(emb, query, 5, 0.4)` | 외부 임베딩 전달 | `ChunkResult[]` | 중복 임베딩 생성 방지 |
| `searchSimilarQuestions(query, embedding)` | 질문 텍스트 | qa_question 매칭 → qa_answer 조회 | threshold 0.70 확인 |
| `buildSearchResults(query, config)` | 쿼리 + QA config | `{ chunks, contextText }` | Query Expansion → 임베딩 → 검색 → Dedup → Reranking |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | ANTHROPIC_API_KEY 미설정 | 환경변수 없음 | throw Error("Anthropic API key 필요") | P0 |
| E2 | Opus/Sonnet 접근 권한 없음 | 403/401 응답 | throw Error("모델 접근 권한 없음") | P0 |
| E3 | 280초 타임아웃 | LLM 응답 극도로 지연 | AbortController 중단 + "AI 응답 시간 초과" | P0 |
| E4 | RAG 검색 결과 0건 | 매우 특수한 질문 | 컨텍스트 없이 LLM 호출 시도 | P1 |
| E5 | Vector search RPC 실패 | Supabase 연결 오류 | 로그 기록, 빈 배열 반환 | P1 |
| E6 | 토큰 예산 초과 | 검색 결과가 tokenBudget 초과 | 예산 내에서 잘라내기 (buildContext) | P1 |
| E7 | embedding null 반환 | generateEmbedding 실패 | 검색 스킵, 빈 결과 | P1 |
| E8 | consumer 6종 각각 독립 동작 | 각 consumerType 전달 | 해당 config에 맞는 파라미터로 실행 | P0 |
| E9 | Extended Thinking 비활성화 consumer | newsletter/education | enableThinking=false, thinkingBudget 무시 | P2 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: knowledge_request_qa — QA 요청
{
  "query": "ASC 캠페인 설정은 어떻게 하나요?",
  "consumerType": "qa",
  "sourceTypes": ["lecture", "blueprint", "papers", "qa", "qa_answer"],
  "limit": 5,
  "threshold": 0.4,
  "tokenBudget": 3000,
  "temperature": 0.3,
  "questionId": "q-uuid-001"
}
```

```json
// fixture: knowledge_response_qa — QA 응답
{
  "content": "ASC(Advantage Shopping Campaign)는 메타의 자동 최적화 쇼핑 캠페인입니다.\n\n**설정 방법:**\n1. 캠페인 생성 시 'Advantage+ 쇼핑 캠페인' 선택\n2. 예산 설정\n3. 국가/지역 설정\n4. 광고 소재 업로드\n\nASC는 타겟, 배치, 크리에이티브를 자동으로 최적화합니다.",
  "sourceRefs": [
    { "lecture_name": "3주차 메타 광고 캠페인 구조", "week": "3주차", "chunk_index": 5, "similarity": 0.88, "source_type": "lecture", "priority": 1, "final_score": 0.93 }
  ],
  "tokensUsed": 1250,
  "model": "claude-sonnet-4-6"
}
```

```json
// fixture: consumer_configs_snapshot — 6종 Consumer 설정 스냅샷
{
  "qa": { "limit": 5, "threshold": 0.4, "tokenBudget": 3000, "temperature": 0.3, "model": "claude-sonnet-4-6", "enableReranking": true, "enableExpansion": true, "enableThinking": true, "thinkingBudget": 5000 },
  "newsletter": { "limit": 5, "threshold": 0.4, "tokenBudget": 3000, "temperature": 0.5, "model": "claude-opus-4-6", "enableReranking": false, "enableExpansion": false, "enableThinking": false },
  "education": { "limit": 7, "threshold": 0.5, "tokenBudget": 5000, "temperature": 0.3, "model": "claude-opus-4-6", "enableReranking": false, "enableExpansion": false, "enableThinking": false },
  "chatbot": { "limit": 5, "threshold": 0.3, "tokenBudget": 4000, "temperature": 0.4, "model": "claude-sonnet-4-6", "enableReranking": true, "enableExpansion": true, "enableThinking": true, "thinkingBudget": 5000 }
}
```

```json
// fixture: knowledge_usage_log — 사용량 로그
{
  "consumer_type": "qa",
  "source_types": ["lecture", "blueprint", "qa"],
  "input_tokens": 850,
  "output_tokens": 400,
  "total_tokens": 1250,
  "model": "claude-sonnet-4-6",
  "question_id": "q-uuid-001",
  "duration_ms": 8500,
  "chunks_before_rerank": 12,
  "chunks_after_rerank": 5,
  "similar_qa_count": 2,
  "expanded_queries": ["ASC 설정 방법", "어드밴티지 쇼핑 캠페인 설정", "메타 자동 최적화 캠페인"]
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `knowledge.ts` (generate 함수) | `__tests__/knowledge-service/knowledge-generate.test.ts` | vitest |
| `knowledge.ts` (searchChunks) | `__tests__/knowledge-service/search-chunks.test.ts` | vitest |
| `knowledge.ts` (getConsumerConfig) | `__tests__/knowledge-service/consumer-config.test.ts` | vitest |
| `reranker.ts` (Gemini Flash 리랭킹) | `__tests__/knowledge-service/reranker.test.ts` | vitest |
| `query-expander.ts` (쿼리 확장) | `__tests__/knowledge-service/query-expander.test.ts` | vitest |
| `chunk-utils.ts` (chunkText) | `__tests__/knowledge-service/chunk-utils.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| QA 전체 파이프라인 | 내부 | `generate({ consumerType: "qa" })` | query="CBO 설정" | Sonnet 답변 + sourceRefs + reranking 적용 | - |
| newsletter 파이프라인 | 내부 | `generate({ consumerType: "newsletter" })` | query="이번 주 요약" | Opus 답변, 리랭킹/확장 없음 | - |
| chatbot 파이프라인 | 내부 | `generate({ consumerType: "chatbot" })` | query="자유 질문" | sourceTypes=null (전체), Sonnet + Thinking | - |
| education 파이프라인 | 내부 | `generate({ consumerType: "education" })` | query="교육 콘텐츠" | limit=7, threshold=0.5, Opus | - |
| 유사 QA 검색 → 답변 재활용 | 내부 | Stage 1 | 기존 QA와 유사 질문 | 유사 QA 컨텍스트가 답변에 반영 | - |
| 사용량 로깅 | 내부 | `generate()` 완료 후 | 모든 consumer | knowledge_usage에 fire-and-forget 기록 | - |
