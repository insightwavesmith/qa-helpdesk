# Creative Saliency (Layer 2) — Design

## 1. 데이터 모델

### 1.1 creative_saliency (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_saliency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  target_type TEXT DEFAULT 'creative',
  attention_map_url TEXT,
  top_fixations JSONB,
  cta_attention_score FLOAT,
  cognitive_load TEXT,
  model_version TEXT DEFAULT 'deepgaze-iie',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_saliency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_saliency
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_saliency
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cs_ad_id ON creative_saliency(ad_id);
CREATE INDEX IF NOT EXISTS idx_cs_account_id ON creative_saliency(account_id);
```

### 1.2 top_fixations JSONB 스키마
```json
[
  { "x": 195, "y": 120, "rank": 1, "attention_pct": 0.35 },
  { "x": 195, "y": 400, "rank": 2, "attention_pct": 0.25 },
  { "x": 195, "y": 700, "rank": 3, "attention_pct": 0.18 }
]
```

## 2. 스크립트: scripts/saliency-predict.py

### 2.1 플로우
1. .env.local에서 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 로드
2. ad_creative_embeddings에서 media_type='IMAGE', media_url IS NOT NULL 조회
3. creative_saliency에 이미 분석된 ad_id 제외
4. 각 소재:
   - 이미지 다운로드 → PIL Image
   - DeepGaze IIE 모델로 saliency map 예측
   - 히트맵 이미지 생성 (원본 + 오버레이)
   - Supabase Storage에 히트맵 업로드
   - top fixation 좌표 추출 (상위 5개)
   - CTA 영역 주목도 점수 계산 (creative_element_analysis의 cta_position 참조)
   - cognitive_load 판정 (분산도 기반)
5. creative_saliency에 UPSERT

### 2.2 CTA 주목도 점수 계산
- creative_element_analysis에서 cta_position 조회
- cta_position에 따라 관심 영역(ROI) 설정:
  - bottom: 이미지 하단 20%
  - center: 이미지 중앙 30%
  - end_frame: 이미지 하단 15%
- ROI 내 saliency 합 / 전체 saliency 합 = cta_attention_score

### 2.3 cognitive_load 판정
- saliency map의 엔트로피 기반:
  - low: 엔트로피 < 3.0 (시선 집중)
  - medium: 3.0 ≤ 엔트로피 < 4.5
  - high: 엔트로피 ≥ 4.5 (시선 분산)

### 2.4 CLI 옵션
```
python scripts/saliency-predict.py [--limit N] [--account-id xxx]
  --limit N         : 최대 N건 처리 (기본: 9999)
  --account-id xxx  : 특정 광고 계정만 처리
```

## 3. API

### 3.1 GET /api/admin/creative-saliency?ad_id=xxx
시선 예측 결과 조회.
- 응답: `{ ad_id, attention_map_url, top_fixations, cta_attention_score, cognitive_load }`

## 4. 신규 파일
| 파일 | 역할 |
|------|------|
| `scripts/saliency-predict.py` | 시선 예측 배치 |
| `scripts/requirements-saliency.txt` | Python 의존성 |
| `supabase/migrations/20260318_creative_saliency.sql` | 테이블 생성 |
| `src/app/api/admin/creative-saliency/route.ts` | 결과 조회 API |

## 5. 에러 처리
| 상황 | 처리 |
|------|------|
| 이미지 다운로드 실패 | skip, 로그 기록 |
| 모델 로드 실패 | exit (첫 실행 시 가중치 자동 다운로드) |
| Storage 업로드 실패 | skip (결과는 DB에 저장, URL만 null) |
| CTA 위치 정보 없음 | cta_attention_score = null |

## 6. 구현 순서
1. [ ] SQL 마이그레이션 작성
2. [ ] requirements-saliency.txt 작성
3. [ ] scripts/saliency-predict.py 작성
4. [ ] GET /api/admin/creative-saliency API 작성
5. [ ] 배치 실행 + 검증
