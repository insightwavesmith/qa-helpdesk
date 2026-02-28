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
