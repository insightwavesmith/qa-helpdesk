# TASK.md — 총가치각도기 리팩토링

> 작성: 모찌 | 2026-02-25
> 기획서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-25-protractor-integrated-plan.html
> 목업: https://mozzi-reports.vercel.app/reports/architecture/2026-02-25-protractor-ui-mockup.html

---

## 개요

총가치각도기 핵심 리팩토링. LP/장바구니 제거, 진단 3파트 변경, 총가치수준 게이지 신규, 벤치마크 수집 로직 변경, 수강생 UI 개선.

---

## T1. LP 관련 코드 제거

- `engine.ts` PART_METRICS에서 LP품질 파트(파트1) 삭제
- `lp-metrics-card.tsx` 컴포넌트 제거 또는 비활성
- `/api/protractor/lp-metrics` 라우트 비활성
- `collect-daily/route.ts`에서 Mixpanel LP 수집 블록 비활성
- `daily_lp_metrics` 수집 중단 (데이터 테이블은 유지, 코드만 제거)
- `real-dashboard.tsx`의 `void lpMetrics` 제거 + LpMetricsCard import/사용 제거

## T2. 장바구니 지표 제거

- `click_to_cart_rate`, `cart_to_purchase_rate`, `lp_session_to_cart` 제거 대상:
  - `engine.ts` 진단 로직
  - `metrics.ts` 벤치마크 메트릭 정의
  - `collect-benchmarks/route.ts` 수집 로직
- 전환율 파트에서 장바구니 관련 행 삭제

## T3. 진단 파트 구조 변경 (4파트 → 3파트)

- 파트0 **기반점수**: video_p3s_rate, thruplay_rate, retention_rate
- 파트1 **참여율**: reactions, comments, shares, engagement_per_10k (모두 per 10K impressions)
- 파트2 **전환율**: CTR, 결제시작율, 구매전환율, 노출대비구매전환율(신규), 결제→구매율
  - `reach_to_purchase_rate` = purchases / impressions 추가 (진단 + 벤치마크 양쪽)
- PART_METRICS 배열 인덱스 재정렬

## T4. benchmarks 테이블 컬럼 추가

Supabase 마이그레이션:
```sql
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS creative_type text;
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS source text DEFAULT 'all_accounts';
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmarks_metric_type_date 
  ON benchmarks (metric_name, creative_type, date);
```

## T5. 벤치마크 수집 로직 변경

- 파일: `collect-benchmarks/route.ts`
- 현재: ad_accounts 테이블의 수강생 계정만 대상
- 변경:
  1. `GET /me/adaccounts` → META_ACCESS_TOKEN으로 전체 접근 가능 계정 목록
  2. 각 계정별 `GET /act_{id}/insights?level=ad` 조회
  3. 노출 ≥ 3,500 필터
  4. `creative_type`별 그룹핑 (VIDEO / IMAGE / CAROUSEL / ALL)
  5. 그룹별 p25 / p50 / p75 / p90 / avg / sample_size 계산
  6. benchmarks 테이블에 creative_type + source 포함 INSERT
- `belowVal = avgVal * 0.5` → 실제 p25 계산으로 변경

## T6. 진단 엔진 벤치마크 조회 수정

- 해당 광고의 creative_type에 맞는 벤치마크 행 조회
- creative_type이 없으면 'ALL' 폴백
- `real-dashboard.tsx`의 `void benchmarks` 제거 + BenchmarkCompare 연결 확인

## T7. 총가치수준 게이지 API

- 신규: `/api/protractor/total-value`
- 입력: account_id, date_start, date_end
- 로직:
  1. 해당 계정+기간의 모든 daily_ad_insights 집계
  2. 6개 지표 가중평균:
     - 3초시청률: SUM(video_p3s) / SUM(impressions)
     - CTR: SUM(clicks) / SUM(impressions)
     - 참여합계: (SUM(reactions+comments+shares) / SUM(impressions)) × 10,000
     - 결제시작율: SUM(initiate_checkout) / SUM(clicks)
     - 구매전환율: SUM(purchases) / SUM(clicks)
     - 노출→구매: SUM(purchases) / SUM(impressions)
  3. benchmarks 테이블에서 p50/p75 조회 → 비교
  4. 등급: 🟢(≥p75) 4개↑→A, 3개→B, 2개→C, 1개→D, 0개→F
- 출력: `{ grade, total_spend, metrics: [{name, value, p50, p75, status}] }`

## T8. TotalValueGauge 컴포넌트

- 신규: `src/components/protractor/TotalValueGauge.tsx`
- 좌측: 등급 원형(A~F) + 총 광고비 + 기간
- 우측: 6개 지표 카드 (값 + 게이지 바 + 벤치마크 기준 🟢🟡🔴)
- 하단: 한줄 진단 텍스트 (어떤 지표가 미달인지)
- real-dashboard.tsx 최상단에 배치 (기간 탭 바로 아래)
- 목업 참고: 수강생 대시보드 "총가치 수준" 섹션

## T9. TOP 5 광고 — 버튼 추가

- 파일: `ad-metrics-table.tsx`
- 각 광고 카드에 2개 버튼:
  - **Meta 광고통계**: `https://adsmanager.facebook.com/adsmanager/manage/ads?act={account_id}&selected_ad_ids={ad_id}`
  - **믹스패널**: `https://mixpanel.com/project/{project_id}/view/{board_id}`
- 필요 데이터: ad_accounts에서 mixpanel_project_id, mixpanel_board_id 조회
- ad_accounts 테이블에 `mixpanel_board_id` 컬럼 없으면 추가

## T10. 진단 UI 3파트 반영

- LP품질 파트 UI 제거
- 전환율 파트에 노출→구매 행 추가
- 목업 참고: 광고 상세 진단 화면 (3컬럼: 기반점수 / 참여율 / 전환율)

---

## 참고 파일

| 파일 | 역할 |
|------|------|
| `src/lib/protractor/engine.ts` | 진단 엔진 (PART_METRICS, 판정 로직) |
| `src/lib/protractor/metrics.ts` | 벤치마크 메트릭 정의 |
| `src/app/api/protractor/collect-benchmarks/route.ts` | 벤치마크 수집 크론 |
| `src/app/api/protractor/collect-daily/route.ts` | 일일 데이터 수집 |
| `src/app/api/protractor/lp-metrics/route.ts` | LP 메트릭 API (제거 대상) |
| `src/app/protractor/real-dashboard.tsx` | 수강생 대시보드 메인 |
| `src/components/protractor/ad-metrics-table.tsx` | TOP 5 광고 테이블 |
| `src/components/protractor/lp-metrics-card.tsx` | LP 카드 (제거 대상) |
| `src/components/protractor/benchmark-compare.tsx` | 벤치마크 비교 |
| 기존 GCP 원본 | `/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/cluade_code/meta-ads-benchmark/` |

## 환경변수

- `META_ACCESS_TOKEN`: Vercel env (또는 Smith님 직접 제공한 토큰)

---

## 리뷰 결과

리뷰 보고서: https://mozzi-reports.vercel.app/reports/review/2026-02-25-protractor-code-review.html

### 경로 수정
- `src/lib/protractor/engine.ts` → `src/lib/diagnosis/engine.ts`
- `src/lib/protractor/metrics.ts` → `src/lib/diagnosis/metrics.ts`

### 숨은 이슈 5건 (TASK.md에 추가 반영)
- **H1**: collect-daily가 영상/참여/creative_type 수집 안 함 → T5에서 함께 처리 (calculateMetrics 확장)
- **H2**: database.ts 타입 재생성 필요 (initiate_checkout 등)
- **H3**: one-line.ts SHARE 분기 → T3에서 함께 재작성
- **H4**: engine.ts quality_ranking 키 → T1에서 함께 제거
- **H5**: ConversionFunnel 장바구니 스텝 → T2에서 함께 확인

### 권장 실행 순서
Phase 1(병렬): T1, T2, T4, T9 → Phase 2: T3, T5 → Phase 3: T6, T10 → Phase 4: T7 → Phase 5: T8

### 고위험 태스크
- T3 (진단 3파트 구조): metrics.ts + one-line.ts 전체 재작성
- T5 (벤치마크 수집): Meta API 직접 호출로 전환 + rate limit 대응
