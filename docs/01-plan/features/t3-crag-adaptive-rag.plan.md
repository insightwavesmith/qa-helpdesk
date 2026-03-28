# T3. Q&A 답변 고도화 — CRAG + Adaptive RAG — Plan

## 기능 ID
`t3-crag-adaptive-rag`

## 요구사항 요약
수강생 질문 등록 시 자동 생성되는 AI 답변 파이프라인을 고도화. 도메인 용어 이해 → 강의 RAG(Hybrid) → 조건부 웹서치 → 최종 답변 4단계로 개선.

## 현재 상태 (AS-IS)

### 현재 파이프라인 흐름
```
questions.ts (after()) → rag.ts (generateRAGAnswer)
  → knowledge.ts (generate)
    → Stage 0: 이미지 Vision 전처리
    → Stage 1: 유사 QA 검색 (qa_question chunks)
    → Stage 2: 벡터 검색 (query expansion + reranking)
    → Stage 3: Sonnet LLM 답변 생성
```

### 현재 문제점
1. **도메인 무지**: "네이버 쇼핑 입점" 같은 도메인 용어를 이해하지 않고 바로 검색 → 엉뚱한 결과
2. **벡터 검색만 의존**: BM25 키워드 매칭 없어 정확한 용어 매칭 실패
3. **웹서치 없음**: 강의에 없는 최신 플랫폼 정보 답변 불가
4. **관련성 평가 없음**: 검색 결과가 관련 있는지 판단 없이 무조건 답변 시도

## 기대 상태 (TO-BE)

### 신규 파이프라인 (4단계)
```
questions.ts (after())
  → Stage 0: 도메인 인텔리전스 (Sonnet)
    - 도메인 용어 추출 + 정규화
    - 질문 의도 파악
    - 유형 분류 (강의내용 / 플랫폼현황 / 트러블슈팅 / 비기술)
    - 복잡도 판단 (단순 / 중간 / 복잡)
    - 단순+비기술 → Stage 1~2 스킵, 직접 답변
  → Stage 1: 강의 RAG (개선)
    - Stage 0 맥락 기반 검색 쿼리 생성
    - Hybrid Search: 기존 벡터 검색 + BM25 키워드 검색
    - 검색 결과 관련성 평가 (Sonnet) → CORRECT / AMBIGUOUS / INCORRECT
  → Stage 2: 웹서치 (조건부)
    - 실행 조건: RAG가 AMBIGUOUS/INCORRECT, 또는 플랫폼현황 질문
    - Brave Search API
    - Stage 0 도메인 이해 기반 검색 쿼리
    - 결과 관련성 재평가
  → Stage 3: 최종 답변 (Sonnet)
    - 원래 질문 + 도메인 컨텍스트 + RAG + 웹서치 종합
    - 강의 내용 1차 소스, 웹서치 보충
    - 출처 명시 + Smith 코치 톤
```

## 핵심 원칙
- **이해가 먼저, 검색은 그 다음** — 용어 이해 없이 검색하면 엉뚱해짐
- **전 단계 Sonnet** — Haiku 사용 안 함
- **기존 코드 구조 유지** — LangChain/LangGraph 등 새 프레임워크 도입 금지
- **기존 QA 임베딩/승인 플로우 보존** — answers 저장, source_refs, is_approved 등 기존 필드 그대로

## 범위

### 신규 파일
- `src/lib/domain-intelligence.ts` — Stage 0: 도메인 분석 모듈
- `src/lib/relevance-evaluator.ts` — 검색 결과 관련성 평가 (CORRECT/AMBIGUOUS/INCORRECT)
- `src/lib/brave-search.ts` — Stage 2: Brave Search API 클라이언트
- `src/lib/hybrid-search.ts` — BM25 + 벡터 검색 결합

### 수정 파일
- `src/lib/knowledge.ts` — generate() 함수 내 QA consumer 파이프라인 확장
  - ConsumerConfig에 Stage 0/2 관련 플래그 추가
  - buildSearchResults → hybrid search 전환
- `src/lib/rag.ts` — generateRAGAnswer() 시그니처 확장 (도메인 컨텍스트 전달)
- `src/actions/questions.ts` — createAIAnswerForQuestion 호출부 (추가 파라미터 없음, 내부 로직만 변경)

### DB
- `knowledge_usage` 테이블에 로깅 필드 추가 (선택적)
  - `domain_analysis`, `relevance_grade`, `web_search_used`

### 환경변수
- `BRAVE_API_KEY` — Brave Search API 키 (신규)

## 범위 밖 (하지 말 것)
- Haiku 모델 사용
- 기존 QA 임베딩 파이프라인 (`qa-embedder.ts`) 변경
- 기존 답변 승인 플로우 (`answers.ts` approve/reject) 변경
- LangChain/LangGraph 등 새 프레임워크 도입
- 도메인 글로서리 하드코딩 — Sonnet이 직접 이해
- 기존 knowledge.ts consumer configs (newsletter, education 등) 변경

## 기존 아키텍처와의 호환성

### 보존되는 것
- `KnowledgeRequest` / `KnowledgeResponse` 인터페이스
- `SourceRef` 구조
- `ConsumerConfig` 패턴 (qa consumer만 확장)
- `searchChunks` / `searchChunksByEmbedding` 함수
- `expandQuery` / `rerankChunks` 함수
- `knowledge_usage` 로깅 패턴
- `after()` 트리거 방식 (questions.ts)

### 변경되는 것
- `generate()` 내부 QA 파이프라인 흐름 (Stage 0 추가, 관련성 평가 추가, 웹서치 추가)
- `buildSearchResults()` 내부에 BM25 검색 결합 옵션 추가
- `ConsumerConfig`에 새 플래그 추가 (`enableDomainAnalysis`, `enableWebSearch`, `enableRelevanceEval`)

## 성공 기준
- [ ] 도메인 용어가 포함된 질문에 대해 정규화된 검색 쿼리 생성
- [ ] Hybrid Search(벡터 + BM25)로 검색 정밀도 향상
- [ ] RAG 결과 관련성 평가 (CORRECT/AMBIGUOUS/INCORRECT) 동작
- [ ] AMBIGUOUS/INCORRECT 시 Brave Search 웹서치 실행
- [ ] 단순+비기술 질문은 Stage 1~2 스킵하고 빠르게 답변
- [ ] 기존 QA 임베딩/승인 플로우 100% 유지
- [ ] `npm run build` 성공
- [ ] 응답 시간 60초 이내 (기존 대비 +20초 이내 증가)

## 리스크
- **높음**: 파이프라인 단계 증가로 응답 지연 가능 (Sonnet 호출 2~3회)
  - 완화: 단순 질문은 Stage 0에서 바로 답변, 조건부 스킵
- **중간**: Brave Search API 장애 시 폴백 전략 필요
  - 완화: 웹서치 실패 → 기존 RAG만으로 답변 (graceful degradation)
- **중간**: BM25 검색 구현 방식 결정 필요 (Supabase full-text search vs. 앱 레벨)
  - Supabase `ts_rank` + `to_tsvector` 활용 권장

## 예상 작업량
- Stage 0 (domain-intelligence): 3시간
- Stage 1 개선 (hybrid-search + relevance-evaluator): 4시간
- Stage 2 (brave-search): 2시간
- Stage 3 (knowledge.ts 통합): 3시간
- 테스트 + QA: 2시간
- **총: ~14시간**

## 의존성
- T1, T2와 독립적
- `BRAVE_API_KEY` 환경변수 필요
- `ANTHROPIC_API_KEY` 기존 존재
- 기존 `knowledge_chunks` 테이블 (1,912개 청크)
- Supabase full-text search 지원 확인 필요

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `analyzeDomain(question)` | `"네이버 쇼핑 입점 방법"` | `{ terms: ["네이버 쇼핑", "입점"], intent: "플랫폼현황", complexity: "중간", type: "platform" }` | Stage 0 도메인 인텔리전스 |
| `analyzeDomain(question)` | `"안녕하세요"` | `{ type: "non_technical", complexity: "단순", skip_stages: [1, 2] }` | 단순+비기술 → 스킵 |
| `hybridSearch(query, options)` | 도메인 정규화된 쿼리 | `{ vector_results: [...], bm25_results: [...], merged: [...] }` | 벡터 + BM25 결합 |
| `evaluateRelevance(question, chunks)` | 질문 + 검색 청크 | `"CORRECT" \| "AMBIGUOUS" \| "INCORRECT"` | Sonnet 관련성 평가 |
| `searchBrave(query)` | 도메인 기반 검색 쿼리 | `{ results: [{ title, url, snippet }] }` | Brave Search API |
| `generateRAGAnswer(question, context)` | 질문 + 도메인 + RAG + 웹서치 종합 | `{ answer, source_refs, web_sources }` | Stage 3 최종 답변 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| 도메인 용어 없는 일반 질문 | `"강의 몇 주차까지 있나요?"` | 도메인 분석 스킵, 기존 RAG 직행 |
| RAG 결과 INCORRECT | 검색 결과 무관련 | Stage 2 웹서치 실행 |
| RAG 결과 AMBIGUOUS | 부분 관련 | Stage 2 웹서치 보충 |
| Brave Search API 장애 | 500 에러 | graceful degradation → RAG만으로 답변 |
| BRAVE_API_KEY 미설정 | env 없음 | 웹서치 스킵 + RAG만 사용 |
| knowledge_chunks 0건 매칭 | 벡터 + BM25 모두 0건 | 웹서치 강제 실행 또는 "관련 강의를 찾지 못했습니다" |
| 응답 시간 60초 초과 | Sonnet 3회 호출 지연 | 타임아웃 → 부분 결과로 답변 생성 |
| 이미지 포함 질문 | `image_urls` 있는 질문 | Stage 0 Vision 전처리 유지 (기존 로직) |
| 기존 QA 임베딩 플로우 | 답변 생성 후 | embedQAPair 호출 + is_approved=false 저장 유지 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/crag-adaptive-rag/domain-analysis.json
{
  "question": "네이버 쇼핑 입점 후 광고 세팅은 어떻게 하나요?",
  "domain_analysis": {
    "terms": [
      { "original": "네이버 쇼핑", "normalized": "네이버 스마트스토어" },
      { "original": "광고 세팅", "normalized": "메타 광고 캠페인 설정" }
    ],
    "intent": "플랫폼현황 + 트러블슈팅",
    "type": "platform",
    "complexity": "복잡",
    "skip_stages": []
  }
}

// fixtures/crag-adaptive-rag/hybrid-search-result.json
{
  "vector_results": [
    { "chunk_id": "kc_001", "content": "메타 광고 관리자에서 캠페인을 생성합니다...", "similarity": 0.85, "source_type": "lecture" }
  ],
  "bm25_results": [
    { "chunk_id": "kc_042", "content": "네이버 스마트스토어 입점 절차는...", "ts_rank": 0.72, "source_type": "lecture" }
  ],
  "merged": [
    { "chunk_id": "kc_001", "combined_score": 0.82 },
    { "chunk_id": "kc_042", "combined_score": 0.68 }
  ]
}

// fixtures/crag-adaptive-rag/relevance-evaluation.json
{
  "question": "네이버 쇼핑 입점 후 광고 세팅은?",
  "chunks_evaluated": 2,
  "grade": "AMBIGUOUS",
  "reason": "강의 내용에 메타 광고 설정은 있으나 네이버 스마트스토어 입점 절차는 부족"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/crag-adaptive-rag/domain-intelligence.test.ts` | Stage 0 도메인 분석 + 용어 정규화 | vitest |
| `__tests__/crag-adaptive-rag/hybrid-search.test.ts` | 벡터 + BM25 결합 검색 | vitest |
| `__tests__/crag-adaptive-rag/relevance-evaluator.test.ts` | CORRECT/AMBIGUOUS/INCORRECT 판정 | vitest |
| `__tests__/crag-adaptive-rag/brave-search.test.ts` | Brave Search API + 장애 fallback | vitest |
| `__tests__/crag-adaptive-rag/pipeline-integration.test.ts` | 4단계 파이프라인 통합 (Stage 0→3) | vitest |
| `__tests__/crag-adaptive-rag/fixtures/` | JSON fixture 파일 | - |
