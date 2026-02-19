# TASK.md — P1 Embed Pipeline + Hybrid Search
> 2026-02-19 | P0 knowledge_chunks 마이그레이션 완료 후, contents 79개를 chunk→embed→삽입 + hybrid search 구현

## 목표
1. contents 79개(blueprint 16, crawl 53, file 9, webinar 1)의 body_md를 chunk 분할 → Gemini 임베딩 → knowledge_chunks에 INSERT
2. 기존 970개 knowledge_chunks에 search_vector(tsvector) 채우기
3. search_knowledge RPC에 hybrid search (vector + tsvector) 추가
4. Admin UI에 "임베딩 실행" 버튼 추가 (개별 + 일괄)

## 레퍼런스
- 기존 embed 함수: `src/actions/contents.ts` L376~440 (embedContent, embedAllContents) — **이건 구 방식(contents 테이블에 단일 벡터). 참고만.**
- Gemini 임베딩: `src/lib/gemini.ts` — `generateEmbedding(text): number[]` (768d)
- knowledge_chunks 스키마: P0 마이그레이션 `supabase/migrations/00013_rag_layer0.sql`
- search_knowledge RPC: `supabase/migrations/00014_search_knowledge_rpc.sql`
- KnowledgeService: `src/lib/knowledge.ts` — searchChunks(), generate()

## 현재 코드

### src/lib/gemini.ts — generateEmbedding()
```ts
export async function generateEmbedding(text: string): Promise<number[]> {
  // Gemini gemini-embedding-001, 768d, outputDimensionality: 768
  // 단일 텍스트 → number[] 반환
}
```

### src/actions/contents.ts — 구 방식 (교체 대상)
```ts
// 기존: contents 테이블의 embedding 컬럼에 직접 저장 (단일 벡터)
// 새로운 방식: body_md를 chunk 분할 → knowledge_chunks에 각각 INSERT
export async function embedContent(contentId: string) { ... }
export async function embedAllContents() { ... }
```

### DB 현황 (2026-02-19 18:20 검증)
```
contents (79개, 전부 embedding_status: pending)
├── blueprint: 16개 (avg 51,032 chars)
├── crawl: 53개 (avg 6,867 chars)
├── file: 9개 (avg 7,107 chars)
└── webinar: 1개 (55,000 chars)

knowledge_chunks (970개, P0 마이그레이션 완료)
├── lecture: 481 (priority 1)
├── blueprint: 320 (priority 1)
├── marketing_theory: 122 (priority 3)
├── papers: 35 (priority 1)
└── meeting: 12 (priority 4)
```

### contents 컬럼 (관련만)
- id (uuid), title (text), body_md (text), source_type (text)
- embedding_status (text, default 'pending'), chunks_count (int), embedded_at (timestamptz), priority (int)
- source_ref (text), source_url (text), category (text), tags (text[])

### knowledge_chunks 컬럼 (관련만)
- id (uuid), lecture_name (text), week (text), chunk_index (int), content (text)
- embedding (vector 768), source_type (text), priority (int), content_id (uuid → contents.id)
- chunk_total (int), source_ref (text), search_vector (tsvector), embedding_model (text, default 'gemini-embedding-001')
- metadata (jsonb), topic_tags (text[])

### search_knowledge RPC (현재 — vector only)
```sql
-- 현재: cosine similarity + tier_boost만
-- final_score = (1 - cosine_distance) + tier_boost
-- tsvector 검색 없음
```

## 제약
- Gemini API rate limit: 1,500 RPM (free tier) → batch 5개씩, 200ms 딜레이
- chunk 크기: 600~800 chars (한국어 기준, Gemini 임베딩 최적 범위)
- blueprint 16개는 이미 knowledge_chunks에 320 chunks로 존재 → 중복 삽입 금지 (content_id 연결만)
- contents.embedding 컬럼은 구 방식 → 건드리지 말 것 (하위호환)
- knowledge.ts에서 rag.ts import 금지 (순환 의존성)
- SECURITY DEFINER RPC는 SET search_path = public 필수

## 태스크

### T1. Chunk 유틸리티 → code-reviewer
- 파일: `src/lib/chunk-utils.ts` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] `chunkText(text: string, maxChars?: number): string[]` 함수
  - [ ] 기본 chunk 크기 700 chars, overlap 100 chars
  - [ ] 한국어 문장 경계 존중 (마침표/물음표/느낌표 기준 split)
  - [ ] 빈 텍스트 → 빈 배열 반환
  - [ ] chunk_index는 0-based

### T2. Embed Pipeline Server Action → backend-dev
- 파일: `src/actions/embed-pipeline.ts` (신규)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] `embedContentToChunks(contentId: string)` — 단일 콘텐츠 임베딩
    1. contents에서 title, body_md, source_type, source_ref, priority 조회
    2. body_md를 chunkText()로 분할
    3. 각 chunk에 generateEmbedding() 호출 (batch 5, 200ms delay)
    4. knowledge_chunks에 INSERT (content_id, source_type, priority, chunk_index, chunk_total, lecture_name=title, week=source_type, embedding_model)
    5. contents UPDATE: embedding_status='completed', chunks_count, embedded_at=now()
  - [ ] `embedAllPending()` — pending 전체 일괄 처리
    1. contents에서 embedding_status='pending' 조회
    2. 각각 embedContentToChunks() 호출 (순차, 에러 시 skip + 로그)
    3. 결과: { total, success, failed, errors[] }
  - [ ] blueprint 16개 특수 처리: 이미 knowledge_chunks에 320개 존재 → INSERT 스킵, content_id 연결만
    - source_type='blueprint'이면서 title 매칭으로 기존 chunks 찾아서 content_id UPDATE
    - contents.embedding_status='completed', chunks_count=매칭된 수, embedded_at=now()
  - [ ] requireAdmin() 권한 체크
  - [ ] source_type→priority 매핑:
    - lecture, blueprint, papers → 1
    - qa, feedback → 2
    - crawl, marketing_theory, webinar → 3
    - meeting, youtube → 4
    - assignment → 5

### T3. search_vector 채우기 + 트리거 → backend-dev
- 파일: `supabase/migrations/00016_search_vector.sql` (신규)
- 의존: 없음 (T2와 병렬 가능)
- 완료 기준:
  - [ ] 기존 970개 + 새 chunks의 search_vector 일괄 UPDATE
    ```sql
    UPDATE knowledge_chunks
    SET search_vector = to_tsvector('simple', content)
    WHERE search_vector IS NULL;
    ```
  - [ ] INSERT/UPDATE 트리거: 새 row의 search_vector 자동 생성
  - [ ] GIN 인덱스: `CREATE INDEX idx_kc_search_vector ON knowledge_chunks USING gin(search_vector);`

### T4. Hybrid Search RPC → backend-dev
- 파일: `supabase/migrations/00017_hybrid_search.sql` (신규)
- 의존: T3 완료 후
- 완료 기준:
  - [ ] search_knowledge RPC 교체 (CREATE OR REPLACE)
  - [ ] hybrid scoring: `final_score = α * vector_score + (1-α) * text_score + tier_boost`
    - α = 0.6 (ADR-6)
    - vector_score = 1 - cosine_distance
    - text_score = ts_rank_cd(search_vector, plainto_tsquery('simple', query_text))
    - tier_boost = CASE priority (1→0.15, 2→0.10, 3→0.05, 4→0.03, 5→0.00)
  - [ ] 새 파라미터 추가: `query_text text DEFAULT NULL`
    - query_text가 NULL이면 기존 vector-only 동작 (하위호환)
    - query_text가 있으면 hybrid 동작
  - [ ] 반환 컬럼에 text_score 추가
  - [ ] match_lecture_chunks 래퍼는 변경 없음 (vector-only 유지)

### T5. 코드 연동 — searchChunks() hybrid 지원 → frontend-dev
- 파일: `src/lib/knowledge.ts` (수정)
- 의존: T4 완료 후
- 완료 기준:
  - [ ] searchChunks()에서 query_text 파라미터 전달
    ```ts
    // 현재
    const { data, error } = await supabase.rpc("search_knowledge", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      filter_source_types: sourceTypes || null,
    });
    // 변경 후 — query_text 추가
    const { data, error } = await supabase.rpc("search_knowledge", {
      query_embedding: embedding,
      query_text: queryText, // 원본 질문 텍스트
      match_threshold: threshold,
      match_count: limit,
      filter_source_types: sourceTypes || null,
    });
    ```
  - [ ] searchChunks() 시그니처에 queryText 추가 (기본값 원본 query)
  - [ ] ChunkResult에 text_score 필드 추가

### T6. Admin UI — 임베딩 버튼 → frontend-dev
- 파일: `src/app/(main)/admin/content/[id]/page.tsx` (수정), `src/app/(main)/admin/content/page.tsx` (수정)
- 의존: T2 완료 후
- 완료 기준:
  - [ ] 콘텐츠 상세 페이지: "임베딩 실행" 버튼 (embedding_status가 pending일 때만 표시)
    - 클릭 → embedContentToChunks() 호출 → toast 결과
    - 완료 후 embedding_status 배지 갱신
  - [ ] 콘텐츠 목록 페이지: "전체 임베딩" 버튼 (pending 개수 표시)
    - 클릭 → embedAllPending() 호출 → progress + 결과 toast
  - [ ] embedding_status 배지: pending(회색), processing(노랑), completed(초록), failed(빨강)

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| body_md가 비어있는 contents | skip + embedding_status='failed', 에러 로그 |
| blueprint 16개 (이미 chunks 존재) | INSERT 스킵, content_id 연결만 |
| Gemini API 에러 (rate limit) | 해당 content skip, 나머지 계속. 실패한 건 embedding_status='failed' |
| 매우 긴 콘텐츠 (55K chars, webinar) | 정상 chunk 분할 (~78 chunks). chunk_total에 총 수 기록 |
| query_text가 NULL인 검색 | vector-only 동작 (하위호환, match_lecture_chunks 등) |
| search_vector가 NULL인 chunk (임베딩만 있는 기존 데이터) | hybrid에서 text_score=0으로 처리, vector_score만 반영 |
| 동일 contents 재임베딩 시도 | 기존 chunks 삭제 후 재생성 (content_id 기준) |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-19-p1-embed-pipeline.html
- 리뷰 일시: (리뷰 후 채움)
- 변경 유형: 백엔드 구조 + DB + API
- 피드백 요약: (리뷰 후 채움)
- 반영 여부: (리뷰 후 채움)

## 검증
☐ npm run build 성공
☐ 기존 QA 검색 동작 유지 (하위호환)
☐ embedContentToChunks: crawl 1개 실행 → knowledge_chunks에 chunks 생성 확인
☐ embedAllPending: 전체 실행 → 79개 중 63개 신규 + 16개 연결 = 전부 completed
☐ search_knowledge('메타 광고 CAPI'): hybrid 결과에 text_score 포함 확인
☐ Admin 콘텐츠 목록: "전체 임베딩" 버튼 동작
☐ Admin 콘텐츠 상세: "임베딩 실행" 버튼 + 상태 배지
