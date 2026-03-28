# RAG 기반 AI 답변 생성 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### knowledge_chunks 테이블 (실제 테이블)
| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | UUID | PK |
| lecture_name | TEXT | 강의명 |
| week | TEXT | 주차 정보 |
| chunk_index | INT | 청크 순서 |
| chunk_total | INT | 전체 청크 수 |
| content | TEXT | 청크 내용 |
| embedding | VECTOR(768) | 텍스트 임베딩 |
| source_type | TEXT | 소스 타입 (13종) |
| source_ref | TEXT | 원본 참조 |
| priority | INT | 우선순위 |
| topic_tags | TEXT[] | 토픽 태그 |
| image_url | TEXT | 이미지 URL |
| image_description | TEXT | 이미지 설명 |
| image_embedding | VECTOR(768) | 이미지 임베딩 |
| content_id | UUID | contents FK |
| embedding_model | TEXT | 임베딩 모델명 |
| search_vector | TSVECTOR | 전문검색 벡터 |
| metadata | JSONB | 확장 메타데이터 |

> `lecture_chunks`는 DB 뷰(읽기 전용 별칭)로만 존재

### source_type 값 (13종)
`lecture`, `blueprint`, `papers`, `qa`, `qa_question`, `qa_answer`, `crawl`, `meeting`, `marketing_theory`, `webinar`, `youtube`, `assignment`, `feedback`

### answers 테이블 (AI 답변 관련)
| 필드명 | 타입 | 설명 |
|--------|------|------|
| author_id | UUID | 작성자 (AI=null) | NULLABLE |
| is_ai | BOOLEAN | AI 답변 여부 | NULLABLE |
| is_approved | BOOLEAN | 승인 여부 | DEFAULT FALSE |
| source_refs | JSONB | 참고 출처 정보 | NULLABLE |
| image_urls | JSON | 답변 이미지 | NULLABLE |

## 2. API 설계

### AI 답변 생성 파이프라인 (동기식 — 질문 생성 시 자동 호출)

| 단계 | 함수 | 위치 | 설명 |
|------|------|------|------|
| 1 | createAIAnswerForQuestion | rag.ts | 진입점: 질문 생성 후 자동 호출 |
| 2 | generateRAGAnswer | rag.ts | RAG 검색 + 답변 생성 위임 |
| 3 | generate() | knowledge.ts | KnowledgeService: 검색 → 리랭킹 → LLM 호출 |
| 4 | generateEmbedding | gemini.ts | 임베딩 생성 (gemini-embedding-001) |

> 크론 방식이 아닌 **동기식** 실행. 질문 생성 → createAIAnswerForQuestion() 자동 호출

### 임베딩 모델
- `gemini-embedding-001` (gemini.ts에서 사용)

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
├── knowledge.ts     — KnowledgeService (모듈): generate(), searchChunks(), getConsumerConfig()
├── rag.ts           — generateRAGAnswer(), createAIAnswerForQuestion()
├── gemini.ts        — generateEmbedding(), generateFlash()
├── reranker.ts      — Gemini Flash 리랭킹
├── query-expander.ts — 쿼리 확장
├── qa-embedder.ts   — QA 분리 임베딩

src/components/
├── answers/
│   └── SourceReferences.tsx   # 강의 출처 참조 표시
```

### AI 답변 표시
- 질문 상세 페이지에서 is_ai=true 답변에 SourceReferences 컴포넌트 표시
- source_refs JSONB에서 강의명/주차 추출하여 링크 표시

## 4. 에러 처리

- 임베딩 실패 → 로그 기록, 답변 생성 스킵
- RAG 검색 0건 → 컨텍스트 없이 답변 생성 시도
- LLM API 실패 → 로그 기록, 답변 생성 스킵
- 280초 타임아웃 (AbortController)

## 5. KnowledgeService 상세 (knowledge.ts)

### 구조: 모듈 (클래스 아님)
- `generate(request)`: 전체 RAG 파이프라인 실행
- `searchChunks(query, options)`: pgvector 검색
- `getConsumerConfig(consumerType)`: 소비자별 설정 반환

### QA Consumer 설정
```typescript
{
  limit: 5,
  threshold: 0.4,
  tokenBudget: 3000,
  sourceTypes: ["lecture", "blueprint", "papers", "qa", "qa_answer"],
  temperature: 0.3,
  model: "claude-sonnet-4-6",  // QA는 Sonnet 사용
  enableReranking: true,
  enableExpansion: true,
  enableThinking: true,
  thinkingBudget: 5000,
}
```

### 멀티스테이지 파이프라인
1. Stage 0: 이미지 설명 처리
2. Stage 1: 유사 QA 검색 (searchSimilarQuestions)
3. Stage 2: knowledge_chunks 벡터 검색 (buildSearchResults)
4. 리랭킹 + 컨텍스트 조립
5. LLM 호출 (Extended Thinking 지원)

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `createAIAnswerForQuestion(questionId)` | 유효한 question_id | answers 테이블에 is_ai=true 행 생성 | AI 답변 자동 생성 파이프라인 |
| `generateRAGAnswer(title, content, imageDescs)` | 질문 제목+내용 | `{ answer: string, sourceRefs: SourceRef[] }` | RAG 검색 → 답변 생성 위임 |
| `generate({ query, consumerType: "qa" })` | QA 소비자 요청 | `{ content: "답변", sourceRefs: [...], model: "claude-sonnet-4-6" }` | QA consumer Sonnet 사용 확인 |
| `searchChunks(queryText, 5, 0.4, ["lecture"])` | 텍스트 쿼리 | `ChunkResult[]` (최대 5건, 유사도 ≥ 0.4) | pgvector 검색 동작 |
| `searchSimilarQuestions(query, embedding)` | 질문 텍스트 + 임베딩 | qa_question+qa_answer 쌍 | 유사 QA Stage 1 동작 |
| `generateEmbedding(text)` | "메타 광고 설정" | `number[]` (768차원 벡터) | gemini-embedding-001 임베딩 |
| `getConsumerConfig("qa")` | consumerType="qa" | `{ limit: 5, threshold: 0.4, model: "claude-sonnet-4-6", enableReranking: true }` | QA 설정값 정확성 |
| `getConsumerConfig("newsletter")` | consumerType="newsletter" | `{ model: "claude-opus-4-6", enableReranking: false }` | newsletter 설정값 (Opus, 리랭킹 없음) |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | 임베딩 생성 실패 | Gemini API 오류 | 로그 기록, 답변 생성 스킵 | P0 |
| E2 | RAG 검색 0건 | 매우 특수한 질문 | 컨텍스트 없이 LLM 답변 생성 시도 | P0 |
| E3 | LLM API 실패 | Anthropic API 다운 | 로그 기록, 답변 생성 스킵 (null 반환) | P0 |
| E4 | 280초 타임아웃 | LLM 응답 극도로 지연 | AbortController로 중단 + 타임아웃 에러 | P0 |
| E5 | embedding null (생성 실패) | generateEmbedding 반환 null | 벡터 검색 불가 → 빈 결과 | P1 |
| E6 | 이미지 첨부 질문 | imageDescriptions 포함 | Stage 0에서 이미지 설명 query에 합치기 | P1 |
| E7 | source_refs 누락 | LLM이 출처 미포함 답변 | source_refs: [] 빈 배열 | P2 |
| E8 | ANTHROPIC_API_KEY 미설정 | 환경변수 없음 | throw Error (즉시 실패) | P0 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: knowledge_chunk_qa — QA용 지식 청크
{
  "id": "kc-uuid-001",
  "lecture_name": "3주차 메타 광고 캠페인 구조",
  "week": "3주차",
  "chunk_index": 5,
  "chunk_total": 20,
  "content": "CBO(캠페인 예산 최적화)는 캠페인 레벨에서 예산을 자동으로 분배하는 기능입니다. 각 광고세트의 성과에 따라 예산이 실시간으로 재분배됩니다.",
  "embedding": [0.1, 0.2, 0.3],
  "source_type": "lecture",
  "priority": 1,
  "topic_tags": ["CBO", "예산", "캠페인"],
  "metadata": {}
}
```

```json
// fixture: source_ref_sample — 출처 참조
{
  "lecture_name": "3주차 메타 광고 캠페인 구조",
  "week": "3주차",
  "chunk_index": 5,
  "similarity": 0.85,
  "source_type": "lecture",
  "priority": 1,
  "final_score": 0.92
}
```

```json
// fixture: ai_answer_record — AI 답변 DB 레코드
{
  "id": "answer-uuid-001",
  "question_id": "question-uuid-001",
  "author_id": null,
  "content": "CBO는 캠페인 예산 최적화 기능으로, 캠페인 레벨에서 예산을 자동 분배합니다.\n\n**핵심 포인트:**\n1. 광고세트별 성과에 따라 실시간 재분배\n2. 최소 예산 설정으로 특정 광고세트 보호 가능\n3. 최소 3~5개 광고세트에서 효과적",
  "is_ai": true,
  "is_approved": false,
  "source_refs": [
    { "lecture_name": "3주차 메타 광고 캠페인 구조", "week": "3주차", "chunk_index": 5, "similarity": 0.85 }
  ]
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `rag.ts` (RAG 파이프라인) | `__tests__/rag-ai-answer/rag-pipeline.test.ts` | vitest |
| `knowledge.ts` (generate 함수) | `__tests__/rag-ai-answer/knowledge-generate.test.ts` | vitest |
| `gemini.ts` (임베딩 생성) | `__tests__/rag-ai-answer/gemini-embedding.test.ts` | vitest |
| `reranker.ts` (리랭킹) | `__tests__/rag-ai-answer/reranker.test.ts` | vitest |
| `qa-embedder.ts` (QA 임베딩) | `__tests__/rag-ai-answer/qa-embedder.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| AI 답변 자동 생성 | Server Action | `createAIAnswerForQuestion(qId)` | question_id (질문 생성 직후) | answers에 is_ai=true 행 생성, source_refs 포함 | 200 |
| QA consumer 전체 파이프라인 | 내부 | `generate({ query, consumerType: "qa" })` | "CBO 설정 방법" | content에 답변, sourceRefs에 강의 출처, model="claude-sonnet-4-6" | - |
| newsletter consumer | 내부 | `generate({ query, consumerType: "newsletter" })` | "이번 주 요약" | model="claude-opus-4-6", enableReranking=false | - |
| 유사 QA 검색 | 내부 | `searchSimilarQuestions(query, embedding)` | 기존 QA와 유사한 질문 | qa_question+qa_answer 쌍 반환 (threshold 0.70) | - |
| 임베딩 실패 시 | Server Action | `createAIAnswerForQuestion(qId)` | Gemini API 다운 | 답변 생성 스킵, 에러 로그 | - |
