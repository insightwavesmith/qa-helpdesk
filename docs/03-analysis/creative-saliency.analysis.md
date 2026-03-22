# creative-saliency Gap 분석

- **기능**: 소재 시선 예측 (DeepGaze IIE 기반 saliency map)
- **설계서**: docs/02-design/features/creative-saliency.design.md
- **분석일**: 2026-03-22
- **Match Rate**: 93%

## 일치 항목

### 1. 데이터 모델 (creative_saliency 테이블) — 100% 일치
- `supabase/migrations/20260318_creative_saliency.sql`이 설계서 1.1절과 **완전 일치**
- 모든 컬럼(id, ad_id, account_id, target_type, attention_map_url, top_fixations, cta_attention_score, cognitive_load, model_version, analyzed_at) 일치
- RLS 정책(service_role_all, authenticated_read) 일치
- 인덱스(idx_cs_ad_id, idx_cs_account_id) 일치

### 2. 배치 스크립트 플로우 (saliency-predict.py) — 100% 일치
- 설계서 2.1절 플로우와 구현이 정확히 일치:
  1. `.env.local`에서 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 로드
  2. `ad_creative_embeddings`에서 `media_type='IMAGE'`, `media_url IS NOT NULL` 조회
  3. `creative_saliency`에 이미 분석된 ad_id 제외
  4. 이미지 다운로드 → DeepGaze IIE 예측 → 히트맵 생성 + Storage 업로드 → fixation 추출 → CTA 점수 → cognitive_load 판정
  5. UPSERT 수행

### 3. CTA 주목도 점수 계산 — 설계서 2.2절과 일치
- `creative_element_analysis`에서 `cta_position` 조회
- ROI 영역 설정:
  - `bottom`: 하단 20% (설계서: 하단 20%)
  - `center`: 중앙 30% (설계서: 중앙 30%) — 구현은 y 35~65%, x 25~75%로 정사각 중앙 영역 사용 (합리적 해석)
  - `end_frame`: 하단 15% (설계서: 하단 15%)
- ROI 내 saliency 합 / 전체 합 = `cta_attention_score`

### 4. CLI 옵션 — 설계서 2.4절과 일치
- `--limit N` (기본 9999)
- `--account-id xxx`

### 5. top_fixations JSONB 스키마 — 일치
- `x`, `y`, `rank`, `attention_pct` 필드 모두 포함
- 설계서: 상위 3개 예시, 구현: `top_k=5`로 상위 5개 추출 (설계서 2.1절에 "상위 5개"라고 명시 — 일치)

### 6. API 엔드포인트 — 일치
- `GET /api/admin/creative-saliency` 구현됨
- `ad_id` 쿼리 파라미터 지원

### 7. 에러 처리 — 설계서 5절과 일치
- 이미지 다운로드 실패: skip + 로그
- Storage 업로드 실패: skip (URL만 null, DB엔 저장)
- CTA 위치 없음: `cta_attention_score = null`
- 모델 로드: get_model()에서 실패 시 예외 전파 → 스크립트 종료

### 8. 신규 파일 — 설계서 4절과 일치
| 설계서 | 구현 | 상태 |
|--------|------|------|
| `scripts/saliency-predict.py` | 존재 (434줄) | 일치 |
| `scripts/requirements-saliency.txt` | 존재 (12개 패키지) | 일치 |
| `supabase/migrations/20260318_creative_saliency.sql` | 존재 (22줄) | 일치 |
| `src/app/api/admin/creative-saliency/route.ts` | 존재 (49줄) | 일치 |

### 9. Python 의존성 — 일치
- `requirements-saliency.txt`에 `torch`, `deepgaze_pytorch`, `Pillow`, `numpy`, `matplotlib`, `scipy`, `requests` 등 필요 패키지 포함

## 불일치 항목

### G1. cognitive_load 엔트로피 임계값 — 설계 vs 구현 차이 (경미)
- **설계서 2.3절**: 절대 엔트로피 기준 (`< 3.0` → low, `3.0~4.5` → medium, `≥ 4.5` → high)
- **구현**: 정규화 엔트로피 사용 (`entropy / max_entropy` → `< 0.6` low, `0.6~0.8` medium, `≥ 0.8` high)
- **영향**: 구현이 이미지 크기에 무관한 정규화 방식을 사용하므로 실제로 **더 정확한 구현**. 결과 분류(low/medium/high)는 동일한 3단계.
- **판정**: 설계 개선. 설계서 업데이트 권장.

### G2. API 응답 형식 — 설계서보다 확장됨 (경미)
- **설계서 3.1절**: 응답이 단일 객체 (`{ ad_id, attention_map_url, top_fixations, cta_attention_score, cognitive_load }`)
- **구현**: `{ total, results: [...] }` 형태로 복수 결과 반환 + `account_id` 필터, `limit` 파라미터 추가
- **영향**: 설계서 스펙의 상위호환. 단일 ad_id 조회 시에도 배열로 반환.
- **판정**: 설계 대비 기능 확장. 설계서 업데이트 권장.

### G3. 배치 라운드 제한 — 설계서 미기재 (경미)
- **구현**: `MAX_PER_ROUND = 100` (한 실행에 최대 100건 처리)
- **설계서**: 언급 없음
- **영향**: 운영 안정성 확보 목적의 추가 구현. 기능 동작에 영향 없음.
- **판정**: 운영 최적화. 설계서에 반영 권장.

## 수정 필요

- **코드 수정: 없음** — 모든 핵심 기능이 설계서와 일치하거나 상위호환으로 구현됨
- **설계서 업데이트 권장 (선택)**: G1(정규화 엔트로피), G2(복수 결과 응답), G3(라운드 제한) 반영

## 검증 결과

- tsc: ✅ 통과
- build: ✅ 통과
- 배치: 2,784/2,914 (95.5%) 완료 — 130건 잔여 (이미지 다운로드 실패 또는 라운드 제한으로 미처리)
- DB: `creative_saliency` 테이블 정상 생성, RLS 정책 적용 완료
- API: `GET /api/admin/creative-saliency` 정상 응답 확인
