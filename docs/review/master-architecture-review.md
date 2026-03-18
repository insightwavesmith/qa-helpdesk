# 마스터 아키텍처 코드리뷰

## 요약: CONDITIONAL

기획서 URL (`mozzi-reports.vercel.app`) 접근 불가(401)로, TASK에 명시된 리뷰 범위와 현재 코드베이스를 대조하여 리뷰했다.
전체적으로 Phase 1은 실현 가능하나 모델명 오류와 마이그레이션 전략 보완 필요, Phase 2는 고위험(Playwright + 벡터 5개), Phase 3은 네이버 API 현실적 제약이 큼.

---

## Phase 1 리뷰 — 임베딩 엔진 교체

### 실현 가능성

**현재 상태 (코드 근거)**

| 항목 | 현재 값 | 위치 |
|------|---------|------|
| 모델 | `gemini-embedding-001` | `src/lib/gemini.ts:4` |
| 차원 | 768 (`outputDimensionality: 768`) | `src/lib/gemini.ts:28` |
| RPC 파라미터 | `vector(768)` | `supabase/migrations/00017_hybrid_search.sql:10` |
| HNSW 인덱스 | `idx_kc_embedding_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)` | `00015_hnsw_index.sql:5-7` |
| 청크 수 | 약 1,912개 | CLAUDE.md 기재 |
| embedding_model 필드 | 하드코딩 `"gemini-embedding-001"` | `image-embedder.ts:68`, `qa-embedder.ts:87,113`, `embed-pipeline.ts:189` |

**`generateEmbedding()` 호출 체인 (영향 범위)**

```
gemini.ts:generateEmbedding(text: string)
├── knowledge.ts:searchChunks() — 검색 쿼리 임베딩
├── knowledge.ts:buildSearchResults() → expandQuery에서 각 쿼리 임베딩
├── knowledge.ts:generate() — stage1Embedding 생성 (L640)
├── hybrid-search.ts:hybridSearch() — 추가 쿼리 임베딩 (L170)
├── query-expander.ts:filterByRelevance() — 유사도 체크용 임베딩
├── embed-pipeline.ts:embedContentToChunks() — 콘텐츠 청킹 후 임베딩
├── qa-embedder.ts:embedQAPair() — QA 분리 임베딩
├── qa-embedder.ts:embedQAThread() — 스레드 임베딩
└── image-embedder.ts:embedImage() — Vision 텍스트 → 임베딩
```

**시그니처 변경: 현실적이다.** `generateEmbedding(text: string)` 하나만 수정하면 모든 호출자가 자동으로 새 모델을 사용한다. 단, `outputDimensionality` 값과 모델명 2곳만 변경하면 된다.

**벡터 차원 768 → 3,072 변경:**

1. **knowledge_chunks 테이블 마이그레이션**: pgvector에서 `vector(768)` → `vector(3072)` ALTER는 가능하지만, **기존 데이터와 호환 불가**. 768차원 벡터는 3072차원 쿼리로 검색할 수 없다. 마이그레이션 방법:
   - 방법 A: 새 컬럼 `embedding_v2 vector(3072)` 추가 → 전체 재임베딩 → RPC 교체 → 구 컬럼 삭제
   - 방법 B: 새 테이블 `knowledge_chunks_v2` 생성 → 데이터 마이그레이션 → 테이블 스왑
   - **방법 A 권장**: 컬럼 추가가 테이블 스왑보다 FK 관계 유지가 쉬움

2. **search_knowledge RPC 변경**: `query_embedding vector(768)` → `vector(3072)`. 시그니처 변경이므로 DROP + CREATE 필수. `00017_hybrid_search.sql` 참조.

3. **HNSW 인덱스 재구성**: 차원 변경 시 **반드시 삭제 후 재생성**. 3072차원 HNSW는 768 대비:
   - 빌드 시간: ~4배 증가 (차원 비례)
   - 메모리 사용: ~4배 증가
   - 1,912개 청크 규모에서는 문제없음 (10K+ 시 주의)

4. **Supabase 스토리지 증가**: 벡터당 768×4B=3KB → 3072×4B=12KB. 1,912개 기준 ~6MB → ~23MB. **무시할 수준**.

**image-embedder.ts 직접 임베딩 전환:**
현재: `이미지 → generateVisionText() → 텍스트 → generateEmbedding()` (2단계)
기획서 의도: `이미지 → Gemini Embedding 2 직접 임베딩` (1단계)

Gemini Embedding 2는 이미지 직접 임베딩을 지원한다(최대 6개/요청). `generateEmbedding()` 시그니처를 `(input: string | {imageUrl: string})` 등으로 확장해야 한다. 현재 `image-embedder.ts:29-79`의 3단계 파이프라인(fetch→base64→Vision→embed)이 1단계(fetch→base64→embed)로 단순화되지만, **텍스트 설명(`content` 필드)은 여전히 필요**하므로 Vision 텍스트 생성은 별도로 유지해야 한다.

### 위험 요소

1. **모델명 오류 (CRITICAL)**: 기획서의 `gemini-embedding-exp-03-07`은 **존재하지 않는 모델**이다. 올바른 이름은 `gemini-embedding-2-preview` (2026년 3월 10일 Public Preview). 실험 모델명은 변경되거나 삭제될 수 있으므로 정식 모델명을 사용해야 한다.

2. **다운타임 없는 마이그레이션 전략 부재**: 768→3072 전환 중 검색 서비스가 중단된다. 해결:
   - 이중 컬럼 전략: `embedding`(768) + `embedding_v2`(3072) 병행 → 점진적 전환
   - RPC에서 `embedding_v2 IS NOT NULL`이면 3072로 검색, 아니면 768 폴백
   - 전체 재임베딩 완료 후 구 컬럼 삭제

3. **재임베딩 비용과 시간**: 1,912개 청크 × Gemini Embedding 2 API 호출. 현재 배치 설정(BATCH_SIZE=3, 500ms 딜레이, `embed-pipeline.ts:81-82`) 기준 ~5분. Rate limit(분당 1,500 요청)에 여유 있음. 하지만 **task_type 파라미터 미사용이 성능 손실**. 인덱싱 시 `RETRIEVAL_DOCUMENT`, 검색 시 `RETRIEVAL_QUERY` 사용 필수.

4. **`(supabase as any)` 15군데**: `database.ts`의 타입에 `embedding` 필드가 `string | null`로 정의되어 있어 벡터 타입 불일치. 차원 변경과 함께 타입 재생성(`supabase gen types`) 필수.

### 빠진 것

1. **task_type 파라미터 활용 계획**: Gemini Embedding 2의 핵심 기능인 8가지 task_type을 어디에 어떻게 적용할지 명시 필요. 현재 코드에서 인덱싱/검색 구분 없이 동일 임베딩 사용 중.

2. **match_lecture_chunks 래퍼 업데이트**: `00014_search_knowledge_rpc.sql:82`의 레거시 래퍼도 `vector(768)` 사용. 이것도 변경 범위에 포함 필요.

3. **롤백 계획**: 새 모델 품질이 기대 이하일 경우 768으로 되돌리는 방법.

4. **hybrid-search.ts의 search_knowledge_bm25 RPC**: 벡터를 사용하지 않으므로 변경 불필요하지만, `20260304_crag_hybrid_search.sql`에서 SECURITY DEFINER 누락된 점 수정 필요.

---

## Phase 2 리뷰 — 소재·LP 분석

### 실현 가능성

**현재 소재 데이터 수집 상태:**
- `meta-collector.ts:8-18`: `creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec)` 필드 수집
- `daily_ad_insights` 테이블: creative_type만 저장, **이미지 URL/LP URL 미저장** (`database.ts:789-829`)
- `meta-ad-library.ts`: SearchAPI.io를 통해 이미지/비디오/LP URL 수집 가능 (`transformSearchApiAd` 함수). 하지만 이건 **경쟁사 분석용**이고, 자사 광고 소재 분석과는 별도
- Meta Graph API에서 자사 광고 소재 이미지 URL을 가져오려면 `image_hash` → `/{ad_account}/adimages?hashes=['hash']` 추가 API 호출 필요

**`ad_creative_embeddings` 테이블:**
- 현재 DB에 이 테이블 **없음** (`database.ts`에서 `ad_creative` 검색 결과 0건)
- 신규 생성 필요

**벡터 5개 × VECTOR(3072) 스토리지/성능:**

| 벡터 컬럼 | 크기/행 | 1,000광고 | 10,000광고 |
|-----------|---------|-----------|------------|
| embedding | 12KB | 12MB | 120MB |
| text_embedding | 12KB | 12MB | 120MB |
| lp_embedding | 12KB | 12MB | 120MB |
| lp_text_embedding | 12KB | 12MB | 120MB |
| lp_cta_embedding | 12KB | 12MB | 120MB |
| **합계** | **60KB** | **60MB** | **600MB** |

Supabase Pro 플랜(8GB 디스크 기본)에서 10,000광고면 총 데이터의 ~7.5%. **스토리지는 가능하지만 HNSW 인덱스 5개가 문제**. 각 인덱스의 메모리 사용량이 데이터 크기의 ~2배이므로, 인덱스만 ~1.2GB. Supabase Pro 메모리(1GB)를 초과할 수 있다.

**Playwright LP 크롤링:**
- Vercel 서버리스: **불가능**. Vercel Functions 최대 실행 시간 60초(Pro), Playwright 브라우저 부팅 + 페이지 로드 + 렌더링 대기 = 15-30초/페이지. 단일 LP는 가능하나 배치 처리 불가.
- Railway 분리: **가능하지만 추가 인프라**. Docker 컨테이너에서 Playwright 실행 → API endpoint로 크롤 결과 반환. Railway 비용 + 유지보수 오버헤드.
- **대안**: Vercel에서 Railway의 크롤러 API를 호출하는 구조. 이미 `meta-collector.ts`에서 외부 API 호출 패턴이 있으므로 구조적으로는 자연스러움.

### 위험 요소

1. **HNSW 인덱스 5개의 메모리 부하 (HIGH)**: 3072차원 × 5개 인덱스. Supabase Pro의 1GB 메모리에서 인덱스 빌드 자체가 실패할 수 있다. **IVFFlat 인덱스로 대체하거나, 벡터 차원을 `output_dimensionality: 768` 또는 `1536`으로 축소 권장**.

2. **Meta API에서 소재 이미지 URL 가져오기 누락**: 현재 `meta-collector.ts`는 `image_hash`만 수집하고 실제 이미지 URL은 가져오지 않는다. 추가 API 호출(`/{account_id}/adimages?hashes=[]`)이 필요하며, 이 API의 Rate Limit은 별도.

3. **LP 크롤링 안정성**: LP 페이지가 봇 차단, CAPTCHA, CloudFlare 보호를 사용하면 크롤링 실패. 재시도 로직, 프록시 풀 등 인프라 복잡도 과소평가.

4. **비용**: Gemini Embedding 2로 5가지 벡터를 생성하면 광고 1개당 최소 5회 API 호출. 10,000 광고 × 5 = 50,000 호출. 일일 갱신이면 월 1.5M 호출.

### 빠진 것

1. **소재 이미지 URL 수집 파이프라인**: `image_hash` → 실제 URL 변환 로직이 기획서에 없다면 가장 먼저 구현해야 할 부분.

2. **벡터 인덱스 전략**: 5개 컬럼 전부에 HNSW를 걸 필요가 있는지. 검색 패턴에 따라 가장 자주 쓰는 1-2개만 HNSW, 나머지는 순차 스캔 또는 IVFFlat.

3. **LP 크롤링 캐시**: 같은 LP를 여러 광고가 공유할 수 있다. URL 기준 중복 제거 + 캐시 전략 필요.

4. **SearchAPI.io vs Meta Graph API 혼용**: 현재 경쟁사 분석은 SearchAPI.io(`meta-ad-library.ts`), 자사 분석은 Meta Graph API(`meta-collector.ts`). 소재 분석이 어느 경로를 쓸지 명확히 해야 한다.

---

## Phase 3 리뷰 — 오가닉 채널 배포

### 실현 가능성

**현재 상태:**

- `organic_posts` 테이블: 존재. `organic-channel.sql`에서 정의. 채널 타입: `naver_blog`, `naver_cafe`, `youtube`, `instagram`, `tiktok`. CRUD + 통계 구현 완료 (`src/actions/organic.ts`).
- `distributions` 테이블: 존재 (`database.ts:984-1027`). `content_id`, `channel`, `status`, `rendered_body` 등. 콘텐츠 배포 추적용.
- `channel_distributions` 테이블: **DB에 없음** (`database.ts`에서 검색 결과 0건). 기획서에서 새로 제안하는 테이블.
- `organic_analytics`, `keyword_stats`, `keyword_rankings`, `seo_benchmarks`, `organic_conversions`: 모두 migration에 정의됨 (`organic-channel.sql`).

**`channel_distributions` vs 기존 `distributions` 관계:**
- `distributions` 테이블은 `contents` 테이블(콘텐츠 허브)과 FK 관계 (`distributions_content_id_fkey`)
- `organic_posts` 테이블은 `contents`와 **별개**. FK 관계 없음.
- 기획서의 `channel_distributions`가 `organic_posts`와 연결되는 거라면, 기존 `distributions`와 역할 중복이 아닌 별도 도메인.

**네이버 API 현실적 제약:**

1. **네이버 블로그 API (`writePost.json`):**
   - OAuth 2.0 인증 필요 (네이버 개발자센터 앱 등록)
   - **블로그 글쓰기 API는 2018년부터 비공개/폐지 상태**. 공식 API로 블로그 포스팅이 불가능.
   - 대안: Selenium/Playwright로 네이버 블로그 로그인 → 글쓰기. 하지만 봇 탐지에 매우 취약.

2. **네이버 카페 API:**
   - 카페 글쓰기 API 존재(`https://openapi.naver.com/v1/cafe/{clubid}/menu/{menuid}/articles`)
   - OAuth 2.0 + 카페 관리자 권한 필요
   - 이미지 첨부: 별도 이미지 업로드 API 호출 후 태그 삽입
   - **글 형식 제한**: HTML 태그 제한적. 복잡한 포맷팅 불가.
   - Rate Limit: 하루 제한 있음 (정확한 수치는 앱별 상이)

3. **현실적 구현 가능 채널:**
   - 네이버 카페: API 존재, 제약 있지만 가능
   - 네이버 블로그: 공식 API 없음, 자동 포스팅 사실상 불가
   - YouTube: Data API v3로 영상 업로드 가능 (별도 영상 제작 파이프라인 필요)
   - Instagram: Graph API로 이미지/릴스 게시 가능 (비즈니스 계정 필수)
   - TikTok: Content Posting API 존재 (비즈니스 계정 필수)

### 위험 요소

1. **네이버 블로그 API 폐지 (CRITICAL)**: 공식 `writePost.json` API가 더 이상 사용 불가. 기획서가 이 API를 전제로 했다면 Phase 3의 핵심 기능이 불가능. 네이버 블로그 자동 포스팅은 현재 시점에서 **비공식 방법 없이는 구현 불가**.

2. **OAuth 토큰 관리**: 각 채널별 OAuth 토큰 발급, 갱신, 저장 인프라 필요. 현재 코드에 이런 인프라 없음.

3. **콘텐츠 포맷 변환**: `organic_posts.content`(텍스트)를 각 채널 포맷(HTML, 마크다운, 이미지 등)으로 변환하는 렌더러 필요. 채널별 제약(글자수, 이미지 수, 태그 제한)이 모두 다름.

### 빠진 것

1. **네이버 블로그 API 대안**: 비공식 방법(Playwright 자동화) vs 수동 발행 워크플로우 vs 포기. 결정 필요.

2. **OAuth 토큰 저장/관리**: 각 채널별 인증 정보를 어디에 저장할지. Supabase vault? 환경 변수?

3. **콘텐츠 렌더러**: `organic_posts` → 채널별 포맷 변환 로직. 현재 `distributions.rendered_body` 필드는 있지만 렌더러 코드 없음.

4. **에러 핸들링**: API 실패 시 재시도, 부분 발행 상태 관리. 5개 채널 중 2개만 성공하면?

---

## 전체 아키텍처

### 빠진 것

1. **마이그레이션 무중단 전략**: 768→3072 전환 중 서비스 가용성 계획 없음. 이중 컬럼 + 점진적 전환이 필수.

2. **비용 분석**:
   - Gemini Embedding 2 API 호출 비용 (재임베딩 1,912 + 일일 신규)
   - Railway 서버 비용 (LP 크롤링)
   - Supabase 스토리지 증가 (Phase 2 벡터 5개 × 3072)
   - SearchAPI.io 비용 증가 (소재 분석 추가)

3. **모니터링/관측성**: 새 임베딩 모델의 검색 품질을 어떻게 측정할지. A/B 테스트? `knowledge_usage` 테이블의 기존 로깅으로 충분한지.

4. **의존성 순서**: Phase 1(임베딩 교체) → Phase 2(소재 분석)는 순서 의존이 맞지만, Phase 3(오가닉)은 Phase 1과 독립적. 병렬 진행 가능.

5. **`(supabase as any)` 제거**: `database.ts` 타입 재생성이 모든 Phase의 선행 조건. 현재 15군데에서 타입 우회 중이며, 이 상태에서 새 테이블을 추가하면 타입 안전성이 더 악화.

### 타임라인 현실성

**6주 타임라인 평가:**

| Phase | 기획 기간 | 현실 평가 | 사유 |
|-------|-----------|-----------|------|
| Phase 1 (임베딩 교체) | 2주 추정 | 2주 현실적 | 모델 교체 + RPC + 인덱스 + 재임베딩. 코드 변경 자체는 소규모 |
| Phase 2 (소재·LP) | 2주 추정 | **3-4주 필요** | 새 테이블 + Meta API 추가 호출 + Playwright 인프라 + 5개 임베딩 파이프라인 |
| Phase 3 (오가닉) | 2주 추정 | **네이버 블로그 제외 시 2주** | 카페 API + 기타 채널. 블로그 포함 시 불확정 |

**결론: 6주는 Phase 2 복잡도를 과소평가. 8-10주가 현실적.**

### 권장 변경사항

1. **모델명 수정**: `gemini-embedding-exp-03-07` → `gemini-embedding-2-preview`

2. **Phase 1에 task_type 추가**: 인덱싱 시 `RETRIEVAL_DOCUMENT`, 검색 시 `RETRIEVAL_QUERY` 분리 사용. `generateEmbedding()` 시그니처에 `taskType?: string` 파라미터 추가.

3. **Phase 2 벡터 전략 축소**: 5개 벡터 × 3072는 과도. 대안:
   - `output_dimensionality: 768` 또는 `1536`으로 축소 (MRL 지원)
   - 핵심 2-3개 벡터만 3072, 나머지는 768
   - 또는 복합 임베딩: 소재 텍스트+이미지를 하나의 멀티모달 임베딩으로 통합 (Gemini Embedding 2의 interleaved input 활용)

4. **Phase 3 네이버 블로그 제외**: 공식 API 없으므로 스코프에서 제외하거나, "콘텐츠 생성 → 수동 발행 보조" 수준으로 축소.

5. **선행 작업 추가**: Phase 0로 `supabase gen types` 실행 + `(supabase as any)` 제거. 이후 Phase의 DB 변경이 타입 안전하게 반영됨.

6. **마이그레이션 전략 문서화**: 이중 컬럼 전략, 롤백 계획, 검색 품질 비교 테스트 기준을 Phase 1 설계서에 명시.

---

## 파일별 영향 범위 요약

### Phase 1 변경 대상
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/gemini.ts` | 모델명, outputDimensionality, task_type 파라미터 |
| `src/lib/image-embedder.ts` | 멀티모달 임베딩 분기 추가 |
| `src/lib/qa-embedder.ts` | embedding_model 필드 업데이트 |
| `src/actions/embed-pipeline.ts` | embedding_model 필드 업데이트 |
| `src/lib/knowledge.ts` | searchChunksByEmbedding은 변경 불필요 (RPC가 처리) |
| `src/lib/hybrid-search.ts` | 변경 불필요 |
| `supabase/migrations/` | 새 마이그레이션: 컬럼 추가 + RPC 교체 + 인덱스 재생성 |
| `src/types/database.ts` | `supabase gen types` 재생성 |

### Phase 2 신규 생성 대상
| 파일 | 내용 |
|------|------|
| `supabase/migrations/XXXX_ad_creative_embeddings.sql` | 새 테이블 |
| `src/lib/creative-embedder.ts` | 소재 임베딩 파이프라인 |
| `src/lib/lp-crawler.ts` | LP 크롤링 (Railway API 호출) |
| `src/actions/creative-analysis.ts` | Server Action |

### Phase 3 변경 대상
| 파일 | 변경 내용 |
|------|-----------|
| `src/actions/organic.ts` | 채널별 발행 로직 추가 |
| `src/types/organic.ts` | 배포 상태 타입 확장 |
| `supabase/migrations/` | channel_distributions 테이블 (필요 시) |

---

*리뷰 일시: 2026-03-16*
*리뷰어: Claude Code (코드 기반 자동 리뷰)*
*검토 파일: 12개 소스 + 6개 마이그레이션 + 1개 타입 정의*
