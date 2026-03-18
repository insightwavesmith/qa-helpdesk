# Meta 소재 임베딩 아키텍처 Phase 1 — Design

## 1. 데이터 모델

### 1.1 ad_creative_embeddings 확장 (ALTER TABLE)
```sql
ALTER TABLE ad_creative_embeddings
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072),
  ADD COLUMN IF NOT EXISTS text_embedding_3072 vector(3072),
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- account_id 인덱스 (유사도 쿼리용)
CREATE INDEX IF NOT EXISTS idx_ace_account_id ON ad_creative_embeddings(account_id);

-- 참고: vector(3072)는 pgvector HNSW 인덱스 불가 (2000차원 제한)
-- 현재 352건 규모에서는 순차 스캔으로 충분
```

### 1.2 creative_clusters 테이블 (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  cluster_label TEXT NOT NULL,
  centroid vector(3072),
  member_count INTEGER DEFAULT 0,
  member_ad_ids TEXT[] DEFAULT '{}',
  avg_roas FLOAT,
  avg_ctr FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_clusters
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_clusters
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cc_account_id ON creative_clusters(account_id);
```

## 2. API 설계

### 2.1 POST /api/admin/creative-embed-3072
3072차원 유사도 전용 임베딩 배치 실행. knowledge_chunks.embedding_v2와 동일 차원.

**요청**: `{ batchSize?: number }` (기본 50)
**응답**: `{ processed, embedded, errors, remaining }`

동작:
1. embedding_3072 IS NULL인 row 조회
2. media_url → generateEmbedding({ imageUrl }, { dimensions: 3072, taskType: 'SEMANTIC_SIMILARITY' })
3. ad_copy → generateEmbedding(text, { dimensions: 3072, taskType: 'SEMANTIC_SIMILARITY' })
4. UPDATE embedding_3072, text_embedding_3072, embedded_at

### 2.2 GET /api/admin/creative-similarity?account_id=xxx
같은 account_id 내 소재 간 유사도 매트릭스.

**응답**:
```json
{
  "account_id": "xxx",
  "total": 50,
  "pairs": [
    { "ad_id_a": "...", "ad_id_b": "...", "similarity": 0.92, "risk": "duplicate" }
  ]
}
```

동작:
1. account_id로 embedding_3072 NOT NULL 필터
2. JS에서 코사인 유사도 계산 (벡터를 Supabase에서 가져와서)
3. similarity >= 0.7만 반환
4. risk: 0.9+ = "duplicate", 0.85+ = "danger", 0.7+ = "warning"

### 2.3 GET /api/admin/creative-clusters?account_id=xxx
소재 클러스터 조회.

### 2.4 POST /api/admin/creative-clusters/generate?account_id=xxx
클러스터 생성/갱신.

동작:
1. account_id의 embedding_3072 NOT NULL 벡터 조회
2. 코사인 유사도 기반 Agglomerative 클러스터링 (threshold: 0.8)
3. creative_clusters upsert

### 2.5 GET /api/admin/creative-fatigue?account_id=xxx
피로도 위험 소재 목록.

## 3. 컴포넌트 구조
Phase 1은 API만 구현. UI는 Phase 4.

### 신규 파일
| 파일 | 역할 |
|------|------|
| `supabase/migrations/20260318_embedding_768.sql` | 스키마 변경 (3072차원) |
| `src/lib/creative-analyzer.ts` | 유사도 계산 + 클러스터링 + 피로도 로직 |
| `src/app/api/admin/creative-embed-3072/route.ts` | 3072차원 임베딩 배치 |
| `src/app/api/admin/creative-similarity/route.ts` | 유사도 매트릭스 |
| `src/app/api/admin/creative-clusters/route.ts` | 클러스터 조회 |
| `src/app/api/admin/creative-clusters/generate/route.ts` | 클러스터 생성 |
| `src/app/api/admin/creative-fatigue/route.ts` | 피로도 위험 |

### 수정 파일
없음 — 전부 신규 파일. 기존 코드 변경 없음.

## 4. 에러 처리
| 상황 | 에러 코드 | 메시지 |
|------|-----------|--------|
| 미인증 | 401 | 인증이 필요합니다 |
| 비관리자 | 403 | 관리자 권한이 필요합니다 |
| account_id 누락 | 400 | account_id 파라미터가 필요합니다 |
| 임베딩 실패 | 부분 성공 | 에러 건은 skip, 로그 기록 |

## 5. 구현 순서 (Phase 1)
1. [x] SQL 마이그레이션 작성 + 실행
2. [x] creative-analyzer.ts 핵심 로직 (유사도, 클러스터링, 피로도)
3. [x] creative-embed-3072 API
4. [x] creative-similarity API
5. [x] creative-clusters API (조회 + 생성)
6. [x] creative-fatigue API
7. [x] 3072차원 임베딩 배치 실행 (193/352건)
8. [x] tsc + build 검증 + Gap 분석 (92%)

## 6. Phase 1.5 — 소재 재수집 + 동영상 + spend 필터

### 6.1 스크립트: scripts/reseed-creatives.mjs
전체 소재 재수집 + 임베딩 통합 스크립트.

**플로우:**
1. daily_ad_insights에서 고유 account_id 목록 추출
2. 각 account_id로 Meta API `act_{id}/ads` 호출 (effective_status 전체, 페이지네이션)
3. 신규 ad_id → ad_creative_embeddings INSERT (media_type, media_url/thumbnail_url, ad_copy, lp_url)
4. 기존 ad_id 중 media_url이 403인 건 → Meta API로 최신 URL 재수집, UPDATE
5. daily_ad_insights에서 ad_id별 SUM(spend) 조회 → spend > 0 set 구성
6. spend > 0이고 embedding_3072 IS NULL인 건만 임베딩 실행:
   - VIDEO → thumbnail_url을 이미지로 임베딩
   - IMAGE → media_url을 이미지로 임베딩
   - ad_copy → 텍스트 임베딩
7. embedding_3072, text_embedding_3072, embedded_at UPDATE

### 6.2 Meta API 호출
```
GET /act_{account_id}/ads
  ?fields=id,name,effective_status,creative{id,thumbnail_url,image_url,image_hash,body,object_story_spec}
  &limit=500
  &access_token={META_ACCESS_TOKEN}
```
- effective_status 필터 없음 → ON+OFF 전부 수집
- paging.next로 전체 페이지네이션

### 6.3 VIDEO 임베딩 전략
- Gemini embedContent API는 텍스트+이미지만 지원 (영상 직접 불가)
- VIDEO 소재 → Meta creative.thumbnail_url (정적 이미지) 사용
- thumbnail_url을 이미지로 fetch → base64 → embedContent
- 결과를 embedding_3072에 저장 (IMAGE와 동일 컬럼)

### 6.4 spend > 0 필터 로직
```sql
SELECT ad_id, SUM(spend) as total_spend
FROM daily_ad_insights
WHERE ad_id IS NOT NULL
GROUP BY ad_id
HAVING SUM(spend) > 0
```
- total_spend > 0 → 임베딩 대상
- total_spend = 0 또는 daily_ad_insights에 없음 → 데이터만 저장, 임베딩 스킵
