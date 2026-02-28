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
