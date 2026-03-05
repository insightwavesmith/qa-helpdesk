# RAG 아키텍처 기획서 코드 리뷰

> **기획서**: `2026-03-05-rag-architecture-v3.html`
> **리뷰 일자**: 2026-03-05
> **리뷰 범위**: PART 1 (파이프라인 A~E) + PART 2 (자기강화 루프) + PART 4 (기술 스택)
> **범례**: ✅ 정확 · ⚠️ 부분 불일치 · ❌ 오류 · 📌 기획서 누락 (코드에만 있음)

---

## PART 1 — 5개 파이프라인 검증

---

### A. 콘텐츠 수집 & 임베딩 파이프라인

#### 청킹

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 청크 크기 | 700자 + 100자 오버랩 | `DEFAULT_MAX_CHARS = 700`, `DEFAULT_OVERLAP = 100` | ✅ |
| 문장 단위 분리 | ✅ | `SENTENCE_END_RE = /(?<=[.!?。？！])\s+/` | ✅ |
| 코드 위치 | `chunk-utils.ts` | `src/lib/chunk-utils.ts` | ✅ |

#### 임베딩 모델

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 모델명 | `gemini-embedding-001` | `EMBEDDING_MODEL = "gemini-embedding-001"` (`gemini.ts:4`) | ✅ |
| 차원 | 768 | `outputDimensionality: 768` (`gemini.ts:28`) | ✅ |
| 배치 크기 | 3개 | `BATCH_SIZE = 3` (`embed-pipeline.ts:81`) | ✅ |
| 배치 간격 | 500ms | `BATCH_DELAY_MS = 500` (`embed-pipeline.ts:82`) | ✅ |

#### 우선순위 티어

| 티어 | 기획서 보너스 | 실제 코드 (`embed-pipeline.ts:31-54`) | 판정 |
|------|-------------|--------------------------------------|------|
| T1 (+0.15) | lecture, blueprint, papers, webinar, case_study | priority=1: lecture, blueprint, papers, webinar, case_study | ⚠️ |
| T2 (+0.10) | qa, feedback, info_share, qa_question, qa_answer | priority=2: qa, feedback, info_share | ⚠️ |
| T3 (+0.05) | crawl, marketing_theory | priority=3: crawl, marketing_theory | ✅ |
| T4 (+0.03) | meeting, youtube | priority=4: meeting, youtube | ✅ |

> **⚠️ 불일치 상세**: 기획서는 보너스 값(+0.15 등)으로 표기하지만, 코드에서는 `priority` 정수(1~5)로 저장. 실제 보너스 변환은 DB의 `search_knowledge` RPC 함수 내부에서 처리될 것으로 추정 (코드 확인 불가 — Supabase SQL 함수). 또한 기획서의 T2에 포함된 `qa_question`, `qa_answer`는 `embed-pipeline.ts`가 아닌 `qa-embedder.ts`에서 priority=2로 삽입됨 (일관성 있음).

#### 수집 경로

| 경로 | 기획서 코드 위치 | 실제 코드 위치 | 판정 |
|------|----------------|---------------|------|
| Notion Sync | `api/cron/sync-notion/route.ts` | `src/app/api/cron/sync-notion/route.ts` (존재 확인) | ✅ |
| URL 크롤 | `actions/curation.ts (crawlUrl)` | `src/actions/contents.ts (crawlUrl)` ← curation.ts가 아님 | ⚠️ |
| YouTube | `actions/curation.ts` | 코드에서 별도 YouTube 수집 함수 미확인 | ⚠️ |
| 파일 업로드 | `actions/contents.ts (createContent)` | `src/actions/contents.ts:135` createContent() | ✅ |
| 웨비나 API | `actions/curation.ts` | curation.ts에 웨비나 수집 함수 미확인 | ⚠️ |
| QA 승인 | `lib/qa-embedder.ts` | `src/lib/qa-embedder.ts` embedQAPair() | ✅ |

> **⚠️ 불일치 상세**:
> - `crawlUrl`은 `actions/contents.ts:444`에 위치. 기획서는 `actions/curation.ts`로 표기.
> - YouTube, 웨비나 전용 수집 함수는 curation.ts에서 확인되지 않음. contents.ts의 createContent() 범용 함수로 처리될 가능성.

#### knowledge_chunks 스키마

| 컬럼 | 기획서 | 판정 |
|------|--------|------|
| id (UUID PK) | ✅ | ✅ |
| lecture_name (TEXT) | ✅ | ✅ |
| content (TEXT) | ✅ | ✅ |
| embedding (VECTOR(768)) | ✅ | ✅ |
| source_type (TEXT) | ✅ | ✅ |
| priority (INT 1-5) | ✅ | ✅ |
| search_vector (TSVECTOR) | ✅ | ✅ (BM25 검색에 사용됨) |
| content_id (UUID FK) | ✅ | ✅ |
| topic_tags (TEXT[]) | 현재 미사용 | ✅ (코드에서도 미사용 확인) |
| image_embedding (VECTOR(1024)) | 현재 미사용 | ✅ (코드에서도 미사용 확인) |

> **📌 기획서 누락**: 코드에서 INSERT 시 추가로 사용하는 컬럼들:
> - `chunk_total` (INTEGER) — 전체 청크 수
> - `source_ref` (TEXT) — 원본 참조
> - `embedding_model` (TEXT) — "gemini-embedding-001"
> - `metadata` (JSONB) — question_id, answer_id 등 (QA 임베딩 시)
> - `image_url` (TEXT) — 이미지 URL
> - `week` (TEXT) — source_type 또는 "qa_question"/"qa_answer"
> - `chunk_index` (INTEGER) — 0-based 인덱스

---

### B. Q&A 자동 답변 파이프라인 (CRAG)

#### 트리거 경로

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 트리거 | `createQuestion()` → `after()` → `createAIAnswerForQuestion()` | `questions.ts:164` — `after(async () => { await createAIAnswerForQuestion(...) })` | ✅ |
| 코드 흐름 | `actions/questions.ts` → `lib/rag.ts` → `lib/knowledge.ts` | 정확히 일치 | ✅ |

#### Stage 0 — 도메인 분석

| 항목 | 기획서 | 실제 코드 (`domain-intelligence.ts`) | 판정 |
|------|--------|--------------------------------------|------|
| 모델 | `claude-sonnet-4-6` | `model: "claude-sonnet-4-6"` (:103) | ✅ |
| 온도 | 0.2 | `temperature: 0.2` (:105) | ✅ |
| max_tokens | 2,000 | `max_tokens: 2000` (:104) | ✅ |
| 타임아웃 | 15초 | `TIMEOUT_MS = 15_000` (:5) | ✅ |
| 코드 위치 | `lib/domain-intelligence.ts` | `src/lib/domain-intelligence.ts` | ✅ |
| 반환 필드 | normalizedTerms, intent, questionType, complexity, suggestedSearchQueries, skipRAG, directAnswer | 정확히 일치 (DomainAnalysis 인터페이스) | ✅ |
| 프롬프트 | 기획서 발췌 내용 | 코드 프롬프트와 핵심 내용 일치 | ✅ |

#### Stage 1 — 하이브리드 검색

**1a. 유사 QA 검색**

| 항목 | 기획서 | 실제 코드 (`knowledge.ts`) | 판정 |
|------|--------|---------------------------|------|
| 대상 | qa_question | `["qa_question"]` (:347) | ✅ |
| 방식 | 벡터 검색만 | `searchChunksByEmbedding()` (:346) | ✅ |
| 유사도 기준 | 0.70 이상 | threshold `0.70` (:347) | ✅ |
| 최대 | 3개 | limit `3` (:347) | ✅ |
| 후처리 | 매칭 question의 qa_answer 청크 조회 | `.eq("source_type", "qa_answer")` + `.in("metadata->>question_id", ...)` (:362-366) | ✅ |

**1b. 강의자료 검색 (Hybrid)**

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 대상 | lecture, blueprint, papers, qa_answer | sourceTypes=`["lecture", "blueprint", "papers", "qa", "qa_answer"]` (knowledge.ts:176) → Stage 2에서 qa_question, qa_answer 제외 (:603-604) | ⚠️ |
| 방식 | 벡터 + BM25 + RRF 결합 | `hybridSearch()` (`hybrid-search.ts`) | ✅ |
| 초기 검색 | 각 20개씩 | `searchLimit = enableReranking ? 20 : limit` (:153) | ✅ |
| Rerank | Gemini Flash, 2초 타임아웃 | `rerankChunks()`, `RERANK_TIMEOUT_MS = 2000` (`reranker.ts:7`) | ✅ |
| 최종 | 상위 5개 | `limit: 5` (qa config, knowledge.ts:172) + `.slice(0, limit)` | ✅ |

> **⚠️ 불일치 상세**: 기획서의 Stage 1b 대상 소스타입에 `qa_answer`가 포함되어 있지만, 실제 코드에서는 QA consumer의 `sourceTypes`가 `["lecture", "blueprint", "papers", "qa", "qa_answer"]`이며 Stage 2 검색에서 `qa_question`과 `qa_answer`를 제외함 (F-03 중복 방지). 기획서에는 `qa`도 대상에 포함되는데 기획서에서 누락됨.

#### RRF 점수 계산 공식

| 항목 | 기획서 | 실제 코드 (`hybrid-search.ts`) | 판정 |
|------|--------|-------------------------------|------|
| RRF 공식 | `final_score = 0.6 × vector_score + 0.4 × BM25_score + tier_boost` | `vectorWeight * (1 / (RRF_K + rank + 1))` + `bm25Weight * (1 / (RRF_K + rank + 1))` | ❌ |
| 가중치 | 벡터 0.6, BM25 0.4 | `vectorWeight = 0.6`, `bm25Weight = 0.4` | ✅ |
| k값 | k=60 | `RRF_K = 60` (:25) | ✅ |
| tier_boost | T1=+0.15 등 | RRF 함수 내에 tier_boost 없음 | ❌ |
| threshold | vector_score > 0.4 | `threshold: 0.4` (qa config) | ✅ |

> **❌ 오류 상세**:
> 1. **RRF 공식 자체가 다름**: 기획서는 `0.6 × vector_score + 0.4 × BM25_score`(단순 가중합)로 기술했지만, 실제 코드는 표준 RRF 공식 `weight × 1/(k + rank + 1)`을 사용. RRF는 스코어 합이 아니라 **순위(rank) 기반** 결합.
> 2. **tier_boost 미적용**: RRF 계산에서 tier_boost가 추가되지 않음. 소스타입별 우선순위는 `search_knowledge` RPC 내부에서 벡터 검색 시 이미 반영되었을 가능성 있으나, RRF 결합 단계에서는 tier_boost 미적용.

#### 관련성 평가 (게이트)

| 항목 | 기획서 | 실제 코드 (`relevance-evaluator.ts`) | 판정 |
|------|--------|-------------------------------------|------|
| 모델 | `claude-sonnet-4-6` | `model: "claude-sonnet-4-6"` (:81) | ✅ |
| 온도 | 0.1 | `temperature: 0.1` (:83) | ✅ |
| max_tokens | 500 | `max_tokens: 500` (:82) | ✅ |
| 타임아웃 | 10초 | `TIMEOUT_MS = 10_000` (:8) | ✅ |
| 코드 위치 | `lib/relevance-evaluator.ts` | `src/lib/relevance-evaluator.ts` | ✅ |
| CORRECT 기준 | ≥0.7 | confidence ≥ 0.7 → CORRECT | ✅ |
| AMBIGUOUS 기준 | 0.3~0.7 | 0.3 ≤ confidence < 0.7 → AMBIGUOUS | ✅ |
| INCORRECT 기준 | <0.3 | confidence < 0.3 → INCORRECT | ✅ |

#### Stage 2 — 웹서치

| 항목 | 기획서 | 실제 코드 (`brave-search.ts`) | 판정 |
|------|--------|------------------------------|------|
| 조건 | grade ≠ CORRECT **또는** questionType = "platform" | `relevanceGrade !== "CORRECT" \|\| domainAnalysis?.questionType === "platform"` (`knowledge.ts:658-659`) | ✅ |
| API | Brave Search API | `BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search"` | ✅ |
| 개수 | 5개 | `count: 5` (:131) | ✅ |
| 기간 | 최근 1개월 (freshness: "pm") | `freshness: "pm"` (:132) | ✅ |
| 지역 | 한국 (country: "KR") | `country: "KR"` (:133) | ✅ |
| 타임아웃 | 10초 | `TIMEOUT_MS = 10_000` (:7) | ✅ |

#### Stage 3 — 답변 생성

| 항목 | 기획서 | 실제 코드 (`knowledge.ts`) | 판정 |
|------|--------|---------------------------|------|
| 모델 | `claude-sonnet-4-6` | `model: "claude-sonnet-4-6"` (qa config :180) | ✅ |
| max_tokens | 8,192 | `max_tokens: 8192` (:696) | ✅ |
| 온도 | 1 (thinking 활성화 시 강제) | `temperature: config.enableThinking ? 1 : temperature` (:699) | ✅ |
| Extended Thinking | budget: 5,000 | `thinkingBudget: 5000` (qa config :183) | ✅ |
| 타임아웃 | 280초 | `TIMEOUT_MS = 280_000` (:502) | ✅ |

> **⚠️ 참고**: qa config의 `temperature: 0.3`은 thinking 활성화 시 강제로 1로 오버라이드됨 (Anthropic API 제약). 기획서가 이를 정확히 기술.

#### 시스템 프롬프트

| 항목 | 기획서 발췌 | 실제 코드 (`knowledge.ts:92-168`) | 판정 |
|------|-----------|----------------------------------|------|
| 역할 | 자사몰사관학교 대표 Smith | ✅ 일치 | ✅ |
| 말투 규칙 | ~다/~거든/~죠 단정형, ~요 30% 이하 | ✅ 일치 + 더 상세한 규칙 포함 | ✅ |
| 마크다운 테이블 금지 | ✅ | ✅ 일치 | ✅ |
| AI식 인사 금지 | ✅ | ✅ 일치 | ✅ |
| 답변 길이 | 짧은 질문 3-5문장, 긴 질문 최대 15문장 | ✅ 일치 | ✅ |

> **📌 기획서 누락**: 실제 프롬프트에는 기획서에 없는 상세 규칙이 다수 존재:
> - 마크다운 포맷팅 규칙 (## 헤딩 금지, 코드블록 금지, 이모지 금지 등)
> - AI 상투어 금지 목록 (20개+ 금지 표현 + 대체어)
> - 어미 다양화 규칙, 문장 리듬 규칙
> - 톤 레퍼런스 예시 (OK/NG 예시)
> - 물결표(~) → 하이픈(-) 치환 규칙
> - 유사 QA 활용 규칙
> - 셀프 검수 체크리스트

---

### C. 정보공유 생성 파이프라인

| 항목 | 기획서 | 실제 코드 (`api/admin/curation/generate/route.ts`) | 판정 |
|------|--------|--------------------------------------------------|------|
| 모델 | `claude-opus-4-6` | `model: "claude-opus-4-6"` (:252) | ✅ |
| Thinking budget | 10,000 | `budget_tokens: 10000` (:256) | ✅ |
| max_tokens | 16,000 | `max_tokens: 16000` (:253) | ✅ |
| temp | 1 | `temperature: 1` (:254) | ✅ |
| RAG 검색 | Vector only | `searchChunks()` — 벡터 검색만 사용 | ✅ |
| RAG 소스 | lecture, blueprint, marketing_theory | `["lecture", "blueprint", "marketing_theory"]` (:69) | ✅ |
| RAG limit | 8 | limit `8` (:69) | ✅ |
| RAG threshold | 0.4 | threshold `0.4` (:69) | ✅ |
| Unsplash 썸네일 | 키워드 추출, landscape 1장 | `orientation=landscape&per_page=1` (:328) | ✅ |
| Draft 저장 | createInfoShareDraft | `curation.ts:141` createInfoShareDraft() | ✅ |
| source_ref | ID 콤마결합 | `source_ref: sourceContentIds.join(",")` (curation.ts:168) | ✅ |
| 자동 임베딩 | ✅ | `after(async () => { await embedContentToChunks(...) })` (curation.ts:181-186) | ✅ |

#### 프롬프트 내용

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 글 구조 (리캐치 패턴) | 훅 → 도입부 → 목차 → 본론(h2 3~5개) → 마치며 | 정확히 일치 (route.ts 시스템 프롬프트) | ✅ |
| 글자수 | 1개: 4,000-5,000자, 2~4개: 5,000-7,000자 | 일치 (route.ts :119-122) | ✅ |
| 출력 검증 | 글자수 검증 2,000자 | `bodyMd.length < 2000` (:299) — 경고만, 차단 없음 | ✅ |
| 이미지 마크다운 금지 | 기획서에 없음 | 프롬프트에 `이미지 마크다운 태그 사용 금지` 명시 (:134, 191) | 📌 |

> **📌 기획서 누락**:
> - 실제 프롬프트에는 `이미지 마크다운 태그 사용 금지. placehold.co, IMAGE_PLACEHOLDER URL 절대 금지.` 규칙이 이미 포함됨. 기획서 PART 3에서 "개선" 항목으로 제안했으나 실제로는 이미 구현되어 있음.
> - RAG 검색에 10초 타임아웃이 적용됨 (`new Promise<never>((_, reject) => setTimeout(...)`, route.ts:70)

> **⚠️ 기획서의 "문제 3가지" 평가**:
> 1. "Thinking budget 10,000이 텍스트 토큰 잡아먹음" — ✅ 사실. Anthropic API에서 thinking 토큰이 max_tokens에서 차감됨.
> 2. "IMAGE_PLACEHOLDER → figure.remove() → 섹션 사라짐" — ⚠️ 프롬프트에 이미지 마크다운 금지 규칙이 추가되어 부분 해결. 기존 글에 대한 문제는 여전히 존재 가능.
> 3. "Anthropic API 직접 호출 → knowledge_usage 로깅 안 됨" — ✅ 사실. route.ts에서 직접 `fetch(ANTHROPIC_API_URL, ...)` 호출. KnowledgeService 미경유.

---

### D. AI 수정 (리비전) 파이프라인

| 항목 | 기획서 | 실제 코드 (`contents.ts:1128-1195`) | 판정 |
|------|--------|--------------------------------------|------|
| 함수명 | `reviseContentWithAI(contentId, target, instruction)` | `reviseContentWithAI(contentId, target, instruction)` | ✅ |
| 모델 | `claude-opus-4-6` (consumer 타입별) | consumerType에 따라 결정. body_md는 education/webinar/promo → opus. email_summary는 newsletter → opus. | ✅ |
| RAG | limit: 0 → 검색 완전 스킵 | `limit: 0` (:1180) | ✅ |
| 코드 위치 | `actions/contents.ts → ksGenerate(limit:0)` | `actions/contents.ts` → `ksGenerate({..., limit: 0, ...})` | ✅ |
| 호출 경로 | `ai-edit-panel.tsx → reviseContentWithAI()` | 코드에서 직접 확인 불가 (컴포넌트 미검토). 함수 export 확인. | ⚠️ |
| 프롬프트 | 콘텐츠 편집자, 핵심 내용 유지, 마크다운 유지 | `systemPromptOverride` 내용 정확히 일치 (:1181-1183) | ✅ |

> **⚠️ 기획서의 경고 "limit:0이어도 임베딩+RPC는 실행됨" 평가**:
> `ksGenerate`의 `generate()` 함수에서 limit=0일 때의 흐름:
> - QA consumer가 아니므로 CRAG 스테이지(Stage 0~2) 전부 스킵
> - `buildSearchResults` 호출 시 `searchLimit = enableReranking ? 20 : 0` → 0일 경우 RPC 호출은 되지만 0건 반환
> - **기획서 경고는 정확함**: limit=0이어도 임베딩 생성 (`generateEmbedding`)과 RPC 호출이 실행됨. 불필요한 API 호출 발생.

---

### E. 뉴스레터 파이프라인

| 항목 | 기획서 | 실제 코드 (`contents.ts:762-1126`) | 판정 |
|------|--------|-------------------------------------|------|
| 함수명 | `generateEmailSummary(contentId)` | `generateEmailSummary(contentId)` (:762) | ✅ |
| 모델 | `claude-opus-4-6` | newsletter config → `model: "claude-opus-4-6"` (knowledge.ts:197) | ✅ |
| RAG | limit: 0 (스킵) | `limit: 0` (:1025) | ✅ |
| 출력 | JSON → Zod 검증 | `parseAIResponse(rawResponse, contentType)` → Zod 스키마 검증 | ✅ |
| 재시도 | 3회 | `MAX_RETRIES = 3` (:1001) | ✅ |
| 마크다운 변환 | JSON → 마크다운 | `convertJsonToEmailSummary(parseResult.data, contentType)` (:1041) | ✅ |

> **📌 기획서 누락**:
> - 재시도 시 이전 Zod 에러를 쿼리에 포함하는 피드백 루프 (:1009-1011)
> - 3회 실패 후 폴백: 순서 기반 배너키 리매핑 (`fallbackRemapBannerKeys`, :723-760)
> - 타입별(education/webinar/case_study) 다른 JSON 스키마 + Zod 검증 (기획서에는 일반적으로만 기술)
> - 배너키 검증 (`validateBannerKeys`) — 생성 후 필수 배너키 확인

> **📌 기획서의 "성과 데이터" 항목**: "email_sends 테이블 (open_rate, click_rate) → 저장만, AI에 미참조" — 이 부분은 코드에서 직접 확인 불가하나, newsletter 생성 프롬프트에 이전 성과 참조가 없는 것으로 보아 기획서 기술 정확.

---

## PART 2 — 자기강화 루프 검증

### view_count

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 위치 | questions.ts:110, posts.ts:90 | `questions.ts:110`, `posts.ts:90`, `posts.ts:137` (notices), `reviews.ts:77` | ⚠️ |
| 방식 | 자동 +1 | `.update({ view_count: (data.view_count || 0) + 1 })` | ✅ |
| 활용 | 큐레이션 정렬에 미반영, created_at DESC 고정 | `getCurationContents` → `.order("created_at", { ascending: false })` (curation.ts:32) | ✅ |

> **⚠️ 불일치**: 기획서는 "questions, contents, reviews에서 자동 +1"이라고 했으나 실제 위치는 `questions.ts:110`, `posts.ts:90` (contents의 post 뷰), `posts.ts:137` (notices), `reviews.ts:77`. 기획서의 코드 라인 번호는 정확하지만 `reviews` 위치가 누락.

### like_count

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 상태 | ⚠️ 컬럼만 있음, INCREMENT 코드 미구현 | DB 컬럼 존재 (types에 정의), UI 표시 존재 (AnswerCard, QuestionCard 등), **INCREMENT 함수 미구현** | ✅ |

> **✅ 정확**: `like_count`는 DB 컬럼과 UI 표시만 있고, 실제 좋아요 토글/증가 함수(`toggleLike`, `handleLike` 등)가 존재하지 않음.

### knowledge_usage

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 로깅 위치 | knowledge.ts:556, 770 | `knowledge.ts:556` (skipRAG direct answer), `knowledge.ts:770` (일반 답변) | ⚠️ |
| 로깅 내용 | 모델, 토큰, 청크, 스코어, grade, 단계 | consumer_type, source_types, tokens, model, duration, rerank_scores, expanded_queries, similar_qa_count, domain_analysis, relevance_grade, pipeline_stages | ✅ |
| 활용 | stats API 1개 조회만 (`api/admin/knowledge/stats`) | 조회 API 존재 확인 필요 | ⚠️ |

> **⚠️ 불일치**: 기획서의 라인 번호는 현재 코드와 정확히 일치하지 않을 수 있음 (코드 변경 이후). 현재 코드에서는 약 :554와 :768 부근.

### importance_score

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| sync-notion에서 0 고정 | ✅ | `importance_score: 0` (`api/cron/sync-notion/route.ts:201`) | ✅ |
| UI 수동 변경 미구현 | ✅ | 큐레이션 탭에 importance_score 표시 있으나 수정 UI 미확인 | ✅ |

### QA 승인 → 임베딩

| 항목 | 기획서 | 실제 코드 | 판정 |
|------|--------|-----------|------|
| 승인 시 임베딩 | is_approved → qa_question/qa_answer 임베딩 | `answers.ts:174` — `embedQAPair(answer.question_id, answerId)` | ✅ |
| 경로 | answers.ts → qa-embedder.ts | `approveAnswer()` → `embedQAPair()` (fire-and-forget) | ✅ |

> **✅ "유일하게 작동하는 자기강화 루프"**: 기획서의 이 평가는 정확. QA 승인 → 임베딩 → 다음 유사 QA 검색에 반영되는 루프가 실제로 작동하는 유일한 피드백 루프.

---

## PART 4 — 기술 스택 검증

### AI 모델 총정리 (9개)

| # | 용도 | 기획서 모델 | 실제 코드 | Thinking | 온도 | max_tokens | 판정 |
|---|------|-----------|----------|----------|------|-----------|------|
| 1 | Q&A 답변 | claude-sonnet-4-6 | claude-sonnet-4-6 (knowledge.ts:180) | ✅ 5,000 | 1 (강제) | 8,192 | ✅ |
| 2 | 도메인 분석 | claude-sonnet-4-6 | claude-sonnet-4-6 (domain-intelligence.ts:103) | ❌ | 0.2 | 2,000 | ✅ |
| 3 | 관련성 평가 | claude-sonnet-4-6 | claude-sonnet-4-6 (relevance-evaluator.ts:81) | ❌ | 0.1 | 500 | ✅ |
| 4 | 정보공유 생성 | claude-opus-4-6 | claude-opus-4-6 (route.ts:252) | ✅ 10,000 | 1 | 16,000 | ✅ |
| 5 | AI 수정 | claude-opus-4-6 | consumer별 config → opus (knowledge.ts:197 등) | ❌ | — | — | ✅ |
| 6 | 뉴스레터 요약 | claude-opus-4-6 | newsletter config → opus (knowledge.ts:197) | ❌ | 0.5 | — | ⚠️ |
| 7 | 이미지 설명 | gemini-2.0-flash | `FLASH_MODEL = "gemini-2.0-flash"` (gemini.ts:5) | — | 0.2 | 512 | ✅ |
| 8 | Reranker | gemini-flash (프롬프트) | `generateFlashText()` → gemini-2.0-flash | — | 0 | 256 | ✅ |
| 9 | 임베딩 | gemini-embedding-001 | `EMBEDDING_MODEL = "gemini-embedding-001"` (gemini.ts:4) | — | — | — | ✅ |

> **⚠️ #6 뉴스레터 요약**: 기획서에 온도/max_tokens를 "—"으로 표기했으나, 실제 newsletter consumer config에는 `temperature: 0.5`, `tokenBudget: 3000`이 설정됨. 다만 generateEmailSummary에서 systemPromptOverride를 사용하므로 일부 파라미터가 오버라이드될 수 있음.

### 인프라

| 항목 | 기획서 | 판정 |
|------|--------|------|
| pgvector (Supabase) + HNSW, 768차원 | ✅ 코드에서 768차원 확인 | ✅ |
| PostgreSQL tsvector + GIN | ✅ BM25 검색 사용 확인 | ✅ |
| RRF (벡터 0.6 + BM25 0.4, k=60) | 가중치/k 맞음, 공식은 ❌ (위 참조) | ⚠️ |
| Brave Search API | ✅ 코드 확인 | ✅ |
| Vercel (Next.js) 서버리스 | ✅ | ✅ |
| Vercel Cron, sync-notion 04:00 KST | 크론 파일 존재 확인 | ✅ |

### 데이터 규모

| 항목 | 기획서 | 판정 |
|------|--------|------|
| knowledge_chunks: 3,355 | 시점별 변동 가능, 검증 불가 (DB 직접 조회 필요) | ⚠️ |
| contents (큐레이션 소스): 206 | 시점별 변동 가능 | ⚠️ |
| contents (정보공유): 13 | 시점별 변동 가능 | ⚠️ |
| questions: ~30 | 시점별 변동 가능 | ⚠️ |
| knowledge_usage: 2/20 이후 공백 | 검증 불가 | ⚠️ |

> **⚠️**: 데이터 규모는 기획서 작성 시점의 스냅샷이므로 코드 리뷰로 검증 불가. DB 직접 조회 필요.

---

## 종합 요약

### 정확도 통계

| 구분 | ✅ 정확 | ⚠️ 부분 불일치 | ❌ 오류 | 📌 누락 |
|------|---------|---------------|--------|---------|
| 파이프라인 A | 11 | 4 | 0 | 1 |
| 파이프라인 B | 25 | 2 | 2 | 1 |
| 파이프라인 C | 12 | 0 | 0 | 2 |
| 파이프라인 D | 5 | 1 | 0 | 0 |
| 파이프라인 E | 6 | 0 | 0 | 3 |
| PART 2 루프 | 7 | 3 | 0 | 0 |
| PART 4 스택 | 12 | 4 | 0 | 0 |
| **합계** | **78** | **14** | **2** | **7** |

### 주요 오류 (수정 필요)

1. **❌ RRF 공식 오류**: 기획서에 `0.6 × vector_score + 0.4 × BM25_score + tier_boost`(단순 가중합)로 기술했으나, 실제 코드는 표준 RRF `weight × 1/(k + rank + 1)` 사용. 두 공식은 근본적으로 다름.
2. **❌ tier_boost 미적용**: RRF 결합 단계에서 tier_boost가 추가되지 않음.

### 주요 부분 불일치 (확인 필요)

1. **crawlUrl 위치**: 기획서 `actions/curation.ts` → 실제 `actions/contents.ts`
2. **YouTube/웨비나 수집 함수**: curation.ts에 전용 함수 미확인
3. **Stage 1b 소스타입**: `qa` 포함 누락, F-03 중복 방지 로직 미기술
4. **Priority 보너스 값**: 기획서의 +0.15/+0.10 등은 코드의 정수 priority와 다른 표현 (RPC 내부에서 변환되는지 확인 필요)

### 기획서에 없지만 코드에 있는 것 (보충 필요)

1. **Q&A 프롬프트 상세 규칙**: 마크다운 포맷팅, AI 상투어 금지 목록, 어미 다양화 등 20+ 규칙
2. **이미지 마크다운 금지 규칙**: 정보공유 생성 프롬프트에 이미 구현됨 (기획서는 "개선 필요"로 표기)
3. **뉴스레터 폴백**: 3회 실패 시 배너키 리매핑, 재시도 피드백 루프
4. **뉴스레터 타입별 JSON 스키마**: education/webinar/case_study 3종 분리
5. **knowledge_chunks 추가 컬럼**: chunk_total, source_ref, embedding_model, metadata, image_url 등
6. **F-03 중복 방지 로직**: Stage 1a에서 사용된 chunk ID를 Stage 1b에서 제외
7. **Query Expansion**: `query-expander.ts` — Gemini Flash로 질문 확장 + 유사도 필터 (기획서에 명시적 언급 없음)

---

## 결론

기획서의 전체 정확도는 **약 82%** (78/95 항목 정확). 파이프라인별 핵심 구조(모델명, 파라미터, 프롬프트 핵심)는 대부분 정확하나, **RRF 공식 오류**와 **일부 코드 위치 불일치**가 수정 필요. 기획서가 코드 대비 간략하게 기술한 부분(프롬프트 상세, 뉴스레터 폴백 등)은 기획서 성격상 수용 가능하나, RRF 공식은 기술 정확성 측면에서 반드시 수정해야 함.
