# TASK: Meta 소재 임베딩 아키텍처 × Gemini Embedding 2

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
기획서: `docs/meta-embedding-architecture-plan.md` (또는 아래 내용 참고)
모찌리포트: https://mozzi-reports.vercel.app/reports/plan/2026-03-18-meta-embedding-architecture.html

Meta Andromeda 아키텍처의 소재 분석 구조를 가져와서, Gemini Embedding 2 + Claude Vision 위에 구현한다.

## 전체 구조 (Phase 1~4)
- Phase 1: 소재 이미지+텍스트 임베딩 파이프라인
- Phase 2: LP 모바일 크롤링 + 소재↔LP 멀티모달 일관성 점수
- Phase 3: 영상 임베딩 + 피로도 감지
- Phase 4: UI + 시각화 + 경쟁사 비교

## 이 TASK: Phase 1 — 소재 이미지+텍스트 임베딩 파이프라인

### 목표
수강생의 광고 소재(이미지+카피)를 Gemini Embedding 2로 임베딩하고, 소재 간 유사도/클러스터링 기반 분석을 제공한다.

### 전제조건
- ad_creative_embeddings 테이블 이미 존재 (TASK-EMBEDDING.md Step 5의 소재 seed가 먼저 완료되어야 함)
- Gemini Embedding 2 API 사용 (gemini-embedding-2-preview)
- 기존 Gemini Embedding 설정 활용 (.env.local의 GEMINI_API_KEY)

### 작업 내용

#### 1. 소재 이미지 임베딩
- Meta Ad Library에서 수집한 소재 이미지 URL → Gemini Embedding 2 이미지 임베딩
- 3072차원 벡터 → ad_creative_embeddings.embedding_3072 컬럼에 저장
- modality='image', source_type='ad_creative' 구분

#### 2. 소재 카피 임베딩
- 광고 헤드라인 + 본문 텍스트 → Gemini Embedding 2 텍스트 임베딩
- 같은 3072차원, 같은 벡터 공간 (기존 knowledge_chunks.embedding_v2와 동일)
- modality='text', source_type='ad_creative'

#### 3. 소재 간 유사도 매트릭스
- 같은 광고주(account_id) 내 소재 간 코사인 유사도 계산
- pgvector의 `<=>` 연산자 활용
- API: GET /api/admin/creative-similarity?account_id=xxx

#### 4. 소재 클러스터링 (HDBSCAN)
- 광고주별 소재 임베딩 → 클러스터 분류
- creative_clusters 테이블에 저장 (centroid, member_count, avg_duration)
- API: GET /api/admin/creative-clusters?account_id=xxx

#### 5. 피로도 위험 감지
- 유사도 0.85+ → 중복 위험 플래그
- 유사도 0.9+ → 중복 확실 플래그
- API: GET /api/admin/creative-fatigue?account_id=xxx

### DB 스키마 변경

```sql
-- ad_creative_embeddings 확장 (이미 있는 테이블에 컬럼 추가)
ALTER TABLE ad_creative_embeddings 
  ADD COLUMN IF NOT EXISTS modality TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072),
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT,
  ADD COLUMN IF NOT EXISTS token_count INTEGER,
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- 소재 클러스터
CREATE TABLE IF NOT EXISTS creative_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  cluster_label TEXT,
  centroid vector(3072),
  member_count INTEGER,
  avg_duration FLOAT,
  avg_performance JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 검증
- [ ] ad_creative_embeddings에 이미지+텍스트 임베딩 저장 확인 (modality 구분)
- [ ] 소재 간 유사도 API 정상 응답
- [ ] 클러스터링 결과 DB 저장 확인
- [ ] 피로도 위험 소재 목록 API 정상 응답
- [ ] tsc --noEmit + next build 통과
- [ ] 기존 기능 영향 없음 (QA챗봇, 총가치각도기 등)

### 비용
- 349 소재 × (이미지+텍스트) ≈ $0.09/회
- 월 $0.36 (주 1회 갱신)

### 금지사항
- 기존 embedding_v2 (knowledge_chunks용) 컬럼 건드리지 마
- .env.local 수정 금지
- 새 npm 패키지는 최소한으로 (hdbscan 필요 시 가벼운 것 사용)
- main 브랜치 직접 push 금지, feature 브랜치에서 작업
