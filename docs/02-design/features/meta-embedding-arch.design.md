# Meta 소재 임베딩 아키텍처 Phase 1 — Design

## 1. 데이터 모델

### 1.1 ad_creative_embeddings 확장 (ALTER TABLE)
```sql
ALTER TABLE ad_creative_embeddings
  ADD COLUMN IF NOT EXISTS embedding_768 vector(768),
  ADD COLUMN IF NOT EXISTS text_embedding_768 vector(768),
  ADD COLUMN IF NOT EXISTS modality TEXT,
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- 768차원 HNSW 인덱스 (pgvector 제한 내)
CREATE INDEX IF NOT EXISTS idx_ace_embedding_768_hnsw
  ON ad_creative_embeddings USING hnsw (embedding_768 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_ace_text_embedding_768_hnsw
  ON ad_creative_embeddings USING hnsw (text_embedding_768 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_ace_account_id
  ON ad_creative_embeddings(account_id);
```

### 1.2 creative_clusters 테이블 (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  cluster_label TEXT NOT NULL,
  centroid vector(768),
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

### 2.1 POST /api/admin/creative-embed-768
768차원 임베딩 배치 실행.

**요청**: `{ batchSize?: number }` (기본 50)
**응답**: `{ processed, embedded, errors, remaining }`

동작:
1. embedding_768 IS NULL인 row 조회
2. media_url → generateEmbedding({ imageUrl }, { dimensions: 768 })
3. ad_copy → generateEmbedding(text, { dimensions: 768 })
4. UPDATE embedding_768, text_embedding_768, embedded_at

### 2.2 GET /api/admin/creative-similarity?account_id=xxx
같은 account_id 내 소재 간 유사도 매트릭스.

**응답**:
```json
{
  "account_id": "xxx",
  "total": 50,
  "pairs": [
    { "ad_id_a": "...", "ad_id_b": "...", "similarity": 0.92, "risk": "high" },
    ...
  ]
}
```

동작:
1. account_id로 embedding_768 NOT NULL 필터
2. pgvector 1 - (a.embedding_768 <=> b.embedding_768) 크로스 조인
3. similarity >= 0.7만 반환 (노이즈 제거)
4. risk: 0.9+ = "확실중복", 0.85+ = "위험", else null

### 2.3 GET /api/admin/creative-clusters?account_id=xxx
소재 클러스터 조회.

**응답**:
```json
{
  "account_id": "xxx",
  "clusters": [
    {
      "label": "cluster-1",
      "member_count": 5,
      "member_ad_ids": ["..."],
      "avg_roas": 2.3,
      "avg_ctr": 0.015
    }
  ]
}
```

### 2.4 POST /api/admin/creative-clusters/generate?account_id=xxx
클러스터 생성/갱신.

동작:
1. account_id의 embedding_768 NOT NULL 벡터 조회
2. 코사인 유사도 기반 Agglomerative 클러스터링 (threshold: 0.8)
3. creative_clusters upsert

### 2.5 GET /api/admin/creative-fatigue?account_id=xxx
피로도 위험 소재 목록.

**응답**:
```json
{
  "account_id": "xxx",
  "fatigueRisks": [
    {
      "ad_id": "...",
      "similar_to": "...",
      "similarity": 0.91,
      "level": "확실중복",
      "media_url": "...",
      "ad_copy": "..."
    }
  ],
  "summary": { "total": 50, "high_risk": 3, "medium_risk": 7 }
}
```

## 3. 컴포넌트 구조
Phase 1은 API만 구현. UI는 Phase 4.

### 신규 파일
| 파일 | 역할 |
|------|------|
| `supabase/migrations/20260318_embedding_768.sql` | 스키마 변경 |
| `src/lib/creative-analyzer.ts` | 유사도 계산 + 클러스터링 + 피로도 로직 |
| `src/app/api/admin/creative-embed-768/route.ts` | 768차원 임베딩 배치 |
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

## 5. 구현 순서
1. [ ] SQL 마이그레이션 작성 + 실행
2. [ ] creative-analyzer.ts 핵심 로직 (유사도, 클러스터링, 피로도)
3. [ ] creative-embed-768 API
4. [ ] creative-similarity API
5. [ ] creative-clusters API (조회 + 생성)
6. [ ] creative-fatigue API
7. [ ] 768차원 임베딩 배치 실행 (352건)
8. [ ] tsc + build 검증
