# TASK.md — RAG P2: Reranking + Query Expansion + Image Embedding + Monitoring
> 2026-02-20 | Layer 0 P2 — 검색 품질 향상 + 이미지 임베딩 + 모니터링 대시보드

## 목표
1. QA/chatbot Consumer의 검색 정확도를 Reranking + Query Expansion으로 향상
2. 이미지(QA 답변 첨부, PPT 슬라이드)를 Vision→텍스트→임베딩 파이프라인으로 처리
3. `/admin/knowledge` 페이지에 AI 비용, 검색 품질, 임베딩 현황 모니터링 대시보드 구축
4. 모든 P2 기능은 Graceful Degradation — 실패해도 P1 수준 서비스 유지

## 레퍼런스
- 아키텍처 보고서: `/Users/smith/projects/mozzi-reports/public/reports/architecture/2026-02-20-rag-p2-architecture.html`
- 리뷰 보고서: `/Users/smith/projects/mozzi-reports/public/reports/review/2026-02-20-rag-p2-review.html`
- ADR-16~19: 아키텍처 보고서 내 6번 섹션

## 현재 코드

### gemini.ts — 임베딩만 존재, 텍스트 생성 없음
```ts
// src/lib/gemini.ts (전체 30줄)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "gemini-embedding-001";

export async function generateEmbedding(text: string): Promise<number[]> {
  // POST /v1beta/models/gemini-embedding-001:embedContent
  // outputDimensionality: 768
}
// ⚠️ Gemini Flash 텍스트 생성 함수 없음 — T0에서 추가 필수
```

### knowledge.ts — generate() 함수 (L211~L317)
```ts
// src/lib/knowledge.ts
// ConsumerType: "qa" | "newsletter" | "education" | "webinar" | "chatbot" | "promo"
// CONSUMER_CONFIGS: 6개 Consumer별 limit, threshold, tokenBudget, temperature, sourceTypes, systemPrompt

export async function searchChunks(queryText, limit, threshold, sourceTypes): Promise<ChunkResult[]> {
  const embedding = await generateEmbedding(queryText); // ⚠️ 매번 임베딩 생성
  const { data } = await supabase.rpc("search_knowledge", {
    query_embedding: embedding, match_threshold, match_count: limit, filter_source_types, query_text: queryText,
  });
  return data || [];
}

export async function generate(request: KnowledgeRequest): Promise<KnowledgeResponse> {
  // 1. searchChunks() — 단일 쿼리, 단일 검색 (P2에서 multi-query + rerank로 교체)
  // 2. chunks → contextText 조합 (image_url 미참조 — P2에서 추가)
  // 3. Opus 4.6 API 호출
  // 4. knowledge_usage INSERT (fire-and-forget)
}
```

### search_knowledge RPC (00017_hybrid_search.sql)
```sql
-- 5-param: query_embedding, match_threshold, match_count, filter_source_types, query_text
-- 반환: id, content, lecture_name, week, chunk_index, source_type, priority,
--       similarity, tier_boost, final_score, text_score, topic_tags, source_ref, image_url, metadata
-- hybrid: 0.6*vector + 0.4*text + tier_boost
-- query_text NULL이면 vector-only (하위호환)
-- ⚠️ RPC 시그니처 변경 없음 — 앱 레이어에서 Reranking 처리
```

### knowledge_usage 테이블 (현재)
```sql
-- 현재 컬럼: id, consumer_type, source_types, input_tokens, output_tokens,
--   total_tokens, model, question_id, content_id, duration_ms, created_at
-- ⚠️ rerank_scores, expanded_queries, image_count 등 P2 컬럼 없음
```

### embed-pipeline.ts — 텍스트 전용
```ts
// src/actions/embed-pipeline.ts
// embedContentToChunks(contentId) — body_md 텍스트 → chunk 분할 → Gemini 임베딩
// embedAllPending() — pending 상태 contents 일괄 처리
// ⚠️ 이미지 처리 로직 없음
```

### QA_SYSTEM_PROMPT (knowledge.ts L72~90)
```ts
// 이미지 관련 지시 없음
// P2에서 image_url chunk 포함 시 이미지 참조 지시 추가 필요
```

### admin 사이드바 메뉴 (DashboardSidebar가 실제 사용 파일)
```
현재 메뉴: dashboard, questions, posts, admin/members, admin/accounts, admin/content, admin/email, admin/answers, admin/protractor, admin/stats
⚠️ /admin/knowledge 없음 — T7에서 추가
```

## 제약
- search_knowledge RPC 시그니처 변경 금지 (하위호환)
- knowledge_chunks 테이블 스키마 변경 최소화 (image_url 이미 존재)
- Reranking/Expansion은 qa, chatbot Consumer만 적용. 나머지 Consumer는 기존 방식 유지
- Gemini Flash 호출은 Free tier 안에서 (1500 req/일)
- QA 전체 응답시간 8초 이내 유지 (현재 ~5초, P2 추가 ~1.7초)
- Reranking timeout 2초 — 초과 시 스킵
- 이미지 업로드: PNG/JPG/WebP만, 최대 10MB
- Supabase Storage 버킷: qa-images, lecture-slides (Public read, admin write)

## 태스크

### T0. Gemini Flash 텍스트 생성 함수 → frontend-dev
- 파일: `src/lib/gemini.ts` (수정)
- 의존: 없음 (P2 전체의 전제조건)
- 완료 기준:
  - [ ] `generateFlashText(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>` 함수 추가
  - [ ] 모델: `gemini-2.0-flash` 사용
  - [ ] 에러 핸들링: 429 시 1회 재시도 (2초 대기), 실패 시 빈 문자열 반환
  - [ ] Vision용 `generateVisionText(imageUrl: string, prompt: string): Promise<string>` 함수 추가
  - [ ] Vision은 이미지 URL을 fetch → base64 → Gemini API 전달
  - [ ] 기존 `generateEmbedding()` 변경 없음

### T1. Reranking 함수 → backend-dev
- 파일: `src/lib/reranker.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `rerankChunks(query: string, chunks: ChunkResult[], options?: { timeout?: number }): Promise<ChunkResult[]>` 함수
  - [ ] Gemini Flash에 배치 프롬프트 전송 — 20 chunks를 한 번에 평가
  - [ ] 프롬프트: "각 문서가 질문에 얼마나 관련 있는지 0~1 점수를 JSON 배열로 반환"
  - [ ] 응답 파싱: JSON 우선, 실패 시 정규식 `/[\d.]+/g`로 숫자 추출
  - [ ] 파싱 실패한 chunk는 기본 점수 0.5 부여
  - [ ] timeout 기본 2000ms — 초과 시 원본 chunks 그대로 반환 (fallback)
  - [ ] rerank_score를 ChunkResult에 추가 (optional field)

### T2. Query Expansion 함수 → backend-dev
- 파일: `src/lib/query-expander.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `expandQuery(query: string): Promise<string[]>` 함수 — [원본, 확장1, 확장2] 반환
  - [ ] 짧은 질문(10자 미만) → 확장 스킵, [원본]만 반환
  - [ ] 프롬프트: 줄임말 풀기, 한/영 변환, 관련 개념 확장
  - [ ] 실패 시 [원본]만 반환 (fallback)
  - [ ] 확장 쿼리의 원본 대비 임베딩 유사도 체크 — 0.3 미만이면 해당 확장 버림

### T3a. knowledge.ts 파이프라인 리팩터링 (검색 파트) → backend-dev
- 파일: `src/lib/knowledge.ts` (수정)
- 의존: T0, T1, T2 완료 후
- 완료 기준:
  - [ ] ConsumerConfig에 `enableReranking: boolean`, `enableExpansion: boolean` 플래그 추가
  - [ ] qa, chatbot만 true. 나머지 4개 false
  - [ ] `searchChunksByEmbedding(embedding: number[], limit, threshold, sourceTypes)` 변형 추가 — 외부에서 임베딩 전달
  - [ ] generate() 내부를 3단계 파이프라인으로 리팩터링:
    1. `buildSearchResults()` — expansion → multi-search → dedup → rerank
    2. `buildContext()` — chunks → 텍스트 컨텍스트
    3. `callLLM()` — Opus 호출
  - [ ] 멀티쿼리: 임베딩 3개 순차 생성 → RPC 3회 Promise.all 병렬
  - [ ] 중복 제거: chunk id 기준 Set
  - [ ] 기존 Consumer (newsletter 등) 동작 변경 없음 확인

### T3b. knowledge.ts 이미지 + 로깅 확장 → backend-dev
- 파일: `src/lib/knowledge.ts` (수정)
- 의존: T3a, T4 완료 후
- 완료 기준:
  - [ ] image_url이 있는 chunk → 컨텍스트에 `[이미지: {image_url}]` 추가
  - [ ] QA_SYSTEM_PROMPT에 이미지 지시 추가: "참고 자료에 이미지가 포함되어 있으면 답변에 마크다운 이미지를 포함하라"
  - [ ] knowledge_usage INSERT에 P2 필드 추가 (rerank_scores, expanded_queries, image_count 등)
  - [ ] Reranking 후 전체 점수가 threshold 미만이면 "관련 자료를 찾지 못했습니다" 안내

### T4. Image Vision 파이프라인 → frontend-dev
- 파일: `src/lib/image-embedder.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `embedImage(imageUrl: string, context: { sourceType: string; lectureName: string }): Promise<{ chunkId: string; description: string }>` 함수
  - [ ] Gemini Vision으로 이미지 → 텍스트 설명 (200~400자)
  - [ ] Vision 프롬프트에 도메인 컨텍스트 포함 ("메타 광고 교육 자료")
  - [ ] 텍스트 설명 → generateEmbedding() → knowledge_chunks INSERT
  - [ ] INSERT 시 image_url 컬럼에 원본 이미지 URL 저장
  - [ ] metadata에 `{ type: "image", vision_model: "gemini-2.0-flash" }` 기록
  - [ ] 실패 시 이미지만 저장, 임베딩 보류 (나중에 재시도 가능)

### T5a. QA 답변 이미지 첨부 UI → frontend-dev
- 파일: `src/app/(main)/questions/[id]/answer-form.tsx` (수정)
- 의존: T8 완료 후 (Storage 버킷 필요)
- 완료 기준:
  - [ ] 답변 작성 폼에 이미지 첨부 버튼 추가
  - [ ] 이미지 미리보기 + 삭제 기능
  - [ ] 이미지 파일 검증: PNG/JPG/WebP만, 10MB 제한
  - [ ] Supabase Storage `qa-images/` 버킷에 업로드
  - [ ] 답변 저장 시 이미지 URL을 answers 테이블에 기록 (또는 별도 컬럼)

### T5b. QA 이미지 자동 임베딩 훅 → backend-dev
- 파일: `src/actions/answers.ts` (수정)
- 의존: T4, T5a 완료 후
- 완료 기준:
  - [ ] 이미지가 포함된 답변 저장 시 → embedImage() 비동기 호출 (after() 또는 fire-and-forget)
  - [ ] 임베딩 실패해도 답변 저장은 정상 완료
  - [ ] source_type = "qa", lecture_name = 질문 제목

### T6. PPT 슬라이드 업로드/처리 UI → frontend-dev
- 파일: `src/app/(main)/admin/knowledge/` (신규 디렉토리)
- 의존: T4, T7a 완료 후
- 완료 기준:
  - [ ] `/admin/knowledge` 페이지에 "슬라이드 업로드" 섹션
  - [ ] 이미지 다중 업로드 (드래그앤드롭 또는 파일 선택)
  - [ ] 업로드 시 강의명 + source_type 선택
  - [ ] Supabase Storage `lecture-slides/` 버킷에 저장
  - [ ] 각 이미지마다 embedImage() 순차 호출 + 진행률 표시
  - [ ] 업로드 결과: 성공/실패 카운트 + 에러 메시지

### T7a. /admin/knowledge 페이지 뼈대 + 사이드바 → frontend-dev
- 파일: `src/app/(main)/admin/knowledge/page.tsx` (신규), `src/components/layout/app-sidebar.tsx` (수정 — 실제 사이드바 파일 확인 필요, DashboardSidebar일 수 있음)
- 의존: T8 완료 후
- 완료 기준:
  - [ ] `/admin/knowledge` 페이지 생성 (탭 3개 뼈대)
  - [ ] 사이드바 메뉴에 "지식 베이스" 항목 추가 (아이콘: Brain 또는 Database)
  - [ ] 탭: "모니터링" | "임베딩 현황" | "슬라이드 관리"
  - [ ] 각 탭은 빈 컨테이너 (T7b, T6에서 채움)

### T7b. Monitoring 차트 + 임베딩 현황 → frontend-dev
- 파일: `src/app/(main)/admin/knowledge/` (수정)
- 의존: T7a 완료 후
- 완료 기준:
  - [ ] 모니터링 탭:
    - 일별 AI 비용 차트 (토큰 × 단가, Recharts)
    - Consumer별 사용량 파이차트
    - 평균 응답시간 추이
    - 최근 10건 usage 로그 테이블
  - [ ] 임베딩 현황 탭:
    - source_type별 chunk 수 (막대 차트)
    - 전체 chunks 카운트, 최근 임베딩 날짜
    - "전체 재임베딩" 버튼 (기존 embed API 호출)
  - [ ] 차트 라이브러리: Recharts (없으면 설치)

### T8. DB 마이그레이션 → backend-dev
- 파일: `supabase/migrations/00018_p2_monitoring.sql` (신규)
- 의존: 없음 (다른 태스크보다 먼저 실행 가능)
- 완료 기준:
  - [ ] knowledge_usage에 컬럼 5개 추가:
    ```sql
    ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS rerank_scores float[] DEFAULT NULL;
    ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS expanded_queries text[] DEFAULT NULL;
    ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS image_count int DEFAULT 0;
    ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS chunks_before_rerank int DEFAULT 0;
    ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS chunks_after_rerank int DEFAULT 0;
    ```
  - [ ] Supabase Storage 버킷 2개 생성 (수동 또는 스크립트):
    - `qa-images` (Public)
    - `lecture-slides` (Public)
  - [ ] knowledge_usage RLS 확인 (service_role로 INSERT, admin으로 SELECT)
  - [ ] `npx supabase gen types` 실행하여 database.ts 타입 재생성

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| Gemini Flash 429 (rate limit) | 1회 재시도 후 실패 → fallback (스킵) |
| Reranking 응답이 숫자가 아닌 텍스트 | 정규식으로 첫 번째 숫자 추출, 실패 시 0.5 |
| Expansion이 무관한 쿼리 생성 | 임베딩 유사도 0.3 미만이면 버림 |
| 이미지 URL이 깨진 chunk | 답변에 이미지 링크 미포함, 텍스트만 사용 |
| 10자 미만 질문 ("예산?") | Expansion 스킵, 원본만 검색 |
| newsletter Consumer에서 generate() 호출 | enableReranking=false → 기존 방식 그대로 |
| Vision이 빈 설명 반환 | 임베딩 스킵, image_url만 저장 |
| PPT 100장 일괄 업로드 | 순차 처리 + 진행률 표시, 중간 실패해도 계속 |
| knowledge_usage INSERT 실패 | fire-and-forget, generate() 응답은 정상 반환 |
| Reranking 후 전체 점수 0.3 미만 | "관련 자료를 찾지 못했습니다" 안내 반환 |
| 검색 결과 5개 미만 (dedup 후) | 있는 만큼만 Reranking, 부족해도 정상 진행 |
| 동시 QA 10건 burst | Gemini Flash rate limit 주의, 429 시 개별 fallback |
| Storage 용량 한계 접근 | 업로드 에러 시 사용자에게 "용량 부족" 안내 |
| Vision 30초 timeout | Vision 호출 timeout 설정, 초과 시 이미지 임베딩 스킵 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-rag-p2-task-review.html
- 리뷰 일시: 2026-02-20 02:43
- 변경 유형: 혼합 (백엔드 구조 + API + DB + UI)
- 피드백 요약: 필수 2건 (T6→T7 의존성 역전, T5 UI 부재) + 권장 5건 (T3 분할, 타입 재생성, 사이드바 파일 명시, expandQuery 임베딩 반환, 엣지 케이스 추가)
- 반영 여부: 전부 반영 — T3→T3a/T3b, T5→T5a/T5b, T7→T7a/T7b 분할, T8에 타입 재생성 추가, 엣지 케이스 5건 추가

## 검증
☐ npm run build 성공
☐ 기존 기능 안 깨짐 — newsletter generate(), embed-pipeline 기존 동작 유지
☐ QA 검색 테스트: "CAPI 설치 방법" → Reranking 후 top-5에 CAPI 관련 chunk 포함
☐ QA 검색 테스트: "ASC 예산" → Expansion으로 "Advantage Shopping Campaign" 문서도 검색됨
☐ Reranking fallback: Gemini Flash 차단 시 기존 hybrid 점수로 답변 생성
☐ 이미지 임베딩: 테스트 이미지 업로드 → Vision 텍스트 생성 → chunk INSERT → image_url 포함
☐ 이미지 답변: image_url 있는 chunk 매칭 시 답변에 이미지 링크 포함
☐ /admin/knowledge 페이지: 3개 탭 정상 렌더링
☐ 모니터링: knowledge_usage 데이터가 차트에 표시
☐ PPT 업로드: 이미지 3장 테스트 업로드 → 순차 처리 → 결과 표시
☐ 응답시간: QA 질문 → 8초 이내 응답
