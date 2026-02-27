# TASK.md — 총가치각도기 v2 + 벤치마크 서비스 리빌드

> 작성: 모찌 | 2026-02-27
> 기획서(벤치마크): https://mozzi-reports.vercel.app/reports/architecture/2026-02-27-benchmark-service-plan.html
> 기획서(비교): https://mozzi-reports.vercel.app/reports/architecture/2026-02-27-benchmark-architecture-comparison.html
> 목업(v2): https://mozzi-reports.vercel.app/reports/architecture/2026-02-26-protractor-v2-mockup.html
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 9ffa913

---

## 타입
개발

## 목표
1. 벤치마크 계산을 percentile → GCP 방식(Meta 랭킹 기반 ABOVE_AVERAGE 그룹 평균)으로 전면 교체
2. 장바구니 지표 2개 삭제 (카페24 픽셀 오류), 최종 13개 지표 확정
3. 총가치각도기 UI v2: TOP5 삭제→타겟중복 이동, 콘텐츠 탭 광고비순 1~5등, 벤치마크 관리 탭 신규
4. 성공 기준: 벤치마크 수집 크론 실행 → benchmarks 테이블에 ~33행 저장 → 대시보드에서 ABOVE_AVERAGE 기준선으로 3단계 판정

## 레퍼런스
- 벤치마크 기획서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-27-benchmark-service-plan.html
- GCP 원본 코드: /Users/smith/Library/Mobile Documents/com~apple~CloudDocs/cluade_code/meta-ads-benchmark/
- v2 목업: docs/design/protractor-v2-mockup.html (로컬)
- 이전 코드리뷰: https://mozzi-reports.vercel.app/reports/review/2026-02-25-protractor-code-review.html

## 제약
- daily_ad_insights 테이블 구조 변경 금지 (수강생 일별 데이터 수집용, T3 아키텍처)
- daily_lp_metrics 테이블 DROP 금지 (데이터 유지, 코드만 제거)
- 기존 수강생 로그인/계정관리 기능 깨뜨리지 않기
- META_ACCESS_TOKEN은 Vercel env에서 관리 (코드에 하드코딩 금지)

## 개요

총가치각도기를 GCP(collect_benchmarks.py) 방식 벤치마크로 전환 + UI v2 개편.
핵심: Meta 랭킹(품질/참여/전환) 기반 ABOVE_AVERAGE 그룹 평균을 벤치마크로 사용.
장바구니 관련 지표 2개 삭제 (카페24 픽셀 오류). 최종 13개 지표.

---

## Phase 1: DB 스키마 + 삭제 (병렬 가능)

### T1. LP 관련 코드 제거

**현재:** LP품질 파트가 4파트 중 1개로 존재
**변경:** 완전 제거

- `src/lib/diagnosis/engine.ts` — PART_METRICS에서 LP품질 파트 삭제
- `src/components/protractor/lp-metrics-card.tsx` — 컴포넌트 제거
- `src/app/api/protractor/lp-metrics/route.ts` — 라우트 비활성
- `src/app/api/protractor/collect-daily/route.ts` — Mixpanel LP 수집 블록 비활성
- `src/app/protractor/real-dashboard.tsx` — `void lpMetrics` 제거 + LpMetricsCard import 제거
- 테이블 `daily_lp_metrics`는 유지 (코드만 제거)

### T2. 장바구니 지표 제거

**현재:** click_to_cart_rate, cart_to_purchase_rate, lp_session_to_cart 존재
**변경:** 3개 모두 제거 (카페24 픽셀 장바구니 이벤트 오류)

제거 대상 파일:
- `src/lib/diagnosis/engine.ts` — 진단 로직에서 제거
- `src/lib/diagnosis/metrics.ts` — 벤치마크 메트릭 정의에서 제거
- `src/app/api/protractor/collect-benchmarks/route.ts` — 수집 로직에서 제거
- `src/components/protractor/ConversionFunnel` — 장바구니 스텝 제거 (H5)
- 전환율 파트 UI에서 장바구니 관련 행 삭제

### T3. benchmarks 테이블 스키마 변경

**현재:** metric_name, creative_type, p25/p50/p75/p90/avg_value/sample_size
**변경:** GCP 방식으로 전환 — 한 행 = 조합 1개, 13개 지표값 포함

```sql
-- 기존 benchmarks 테이블 DROP 후 재생성
DROP TABLE IF EXISTS benchmarks;

CREATE TABLE benchmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_type text NOT NULL,        -- VIDEO / IMAGE / CATALOG
  ranking_type text NOT NULL,         -- quality / engagement / conversion
  ranking_group text NOT NULL,        -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE / MEDIAN_ALL
  sample_count integer DEFAULT 0,
  -- 영상 (3개)
  video_p3s_rate numeric,
  thruplay_rate numeric,
  retention_rate numeric,
  -- 참여 (5개)
  reactions_per_10k numeric,
  comments_per_10k numeric,
  shares_per_10k numeric,
  saves_per_10k numeric,
  engagement_per_10k numeric,
  -- 전환 (5개)
  ctr numeric,
  click_to_checkout_rate numeric,
  click_to_purchase_rate numeric,
  checkout_to_purchase_rate numeric,
  roas numeric,
  -- 메타
  calculated_at timestamptz DEFAULT now(),
  UNIQUE (creative_type, ranking_type, ranking_group)
);
```

총 행 수: 최대 27행 (3×3×3) + 6행 (MEDIAN_ALL) = ~33행

### T4. ad_insights_classified 테이블 생성

**현재:** 없음 (신규)
**변경:** GCP 방식 광고 원본 저장용

```sql
CREATE TABLE IF NOT EXISTS ad_insights_classified (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id text NOT NULL,
  account_id text NOT NULL,
  ad_name text,
  creative_type text NOT NULL,        -- VIDEO / IMAGE / CATALOG
  quality_ranking text,               -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE / UNKNOWN
  engagement_ranking text,
  conversion_ranking text,
  impressions numeric DEFAULT 0,
  clicks numeric DEFAULT 0,
  spend numeric DEFAULT 0,
  reach numeric DEFAULT 0,
  -- 13개 계산된 지표
  video_p3s_rate numeric,
  thruplay_rate numeric,
  retention_rate numeric,
  reactions_per_10k numeric,
  comments_per_10k numeric,
  shares_per_10k numeric,
  saves_per_10k numeric,
  engagement_per_10k numeric,
  ctr numeric,
  click_to_checkout_rate numeric,
  click_to_purchase_rate numeric,
  checkout_to_purchase_rate numeric,
  roas numeric,
  -- 메타
  collected_at timestamptz DEFAULT now()
);

CREATE INDEX idx_aic_creative_type ON ad_insights_classified (creative_type);
CREATE INDEX idx_aic_engagement ON ad_insights_classified (engagement_ranking);
CREATE INDEX idx_aic_conversion ON ad_insights_classified (conversion_ranking);
CREATE INDEX idx_aic_quality ON ad_insights_classified (quality_ranking);
```

---

## Phase 2: 벤치마크 수집 엔진 (T3, T4 완료 후)

### T5. 벤치마크 수집 로직 — GCP 방식으로 전면 교체

**현재:** 수강생 계정 대상 percentile 계산
**변경:** 전체 활성 계정 → Meta 랭킹 기반 ABOVE_AVERAGE 그룹 평균

파일: `src/app/api/protractor/collect-benchmarks/route.ts`

#### STEP 1: 광고 원본 수집

```
1-1. 계정 목록
    META_ACCESS_TOKEN으로 GET /me/adaccounts
    → account_status = 1 (활성)만
    → EXCLUDED_ACCOUNTS 배열에 있는 계정 제외

1-2. 계정별 광고 수집
    GET /{account_id}/ads?date_preset=last_7d
    → effective_status = ACTIVE
    → impressions >= 3,500
    → spend DESC 정렬 → 상위 10개만

1-3. 각 광고 지표 계산 (calculateMetrics)
    Meta 원시 데이터 → 13개 지표 계산:
    
    영상:
    - video_p3s_rate = (video_p3s / impressions) × 100
    - thruplay_rate = (video_thruplay / impressions) × 100
    - retention_rate = (video_play_100p / video_p3s) × 100
    
    참여:
    - reactions_per_10k = reactions × (10000 / impressions)
    - comments_per_10k = comments × (10000 / impressions)
    - shares_per_10k = shares × (10000 / impressions)
    - saves_per_10k = post_saves × (10000 / impressions)
    - engagement_per_10k = (reactions+comments+shares+post_saves) × (10000 / impressions)
    
    전환:
    - ctr = Meta API 그대로
    - click_to_checkout_rate = (initiate_checkout / clicks) × 100
    - click_to_purchase_rate = (purchases / clicks) × 100
    - checkout_to_purchase_rate = (purchases / initiate_checkout) × 100
    - roas = purchase_value / spend

1-4. Meta 랭킹 정규화
    quality_ranking ← quality_ranking
    engagement_ranking ← engagement_rate_ranking
    conversion_ranking ← conversion_rate_ranking
    None / "" / 없음 → "UNKNOWN"

1-5. ad_insights_classified 테이블에 UPSERT
    기존 데이터 DELETE → INSERT (전체 교체)
```

#### STEP 2: 벤치마크 계산 (calculate_and_save_benchmarks)

```
크리에이티브 타입: [VIDEO, IMAGE, CATALOG]
× 랭킹 타입: [quality, engagement, conversion]
× 랭킹 그룹: [ABOVE_AVERAGE, AVERAGE, BELOW_AVERAGE]

각 조합에서:
- WHERE creative_type = ? AND {ranking_type}_ranking = {ranking_group}
- UNKNOWN 자동 제외
- 13개 지표 전부 AVG 산출
- sample_count = COUNT(*)
- benchmarks 테이블에 UPSERT
```

#### STEP 3: 전체 평균 (calculate_and_save_median_benchmarks)

```
크리에이티브 타입: [VIDEO, IMAGE, CATALOG]
× 랭킹 타입: [engagement, conversion]

각 조합에서:
- 랭킹 필터 없음 (UNKNOWN 포함 전체)
- ranking_group = 'MEDIAN_ALL'
- 13개 지표 AVG + sample_count
- benchmarks 테이블에 UPSERT
```

#### 환경변수

- `META_ACCESS_TOKEN`: Vercel env (전체 계정 접근용)
- `EXCLUDED_ACCOUNTS`: config 또는 env로 관리 (현재 5개)

#### Rate Limit 대응

- 계정별 200ms sleep
- 429 응답 시 exponential backoff (1s → 2s → 4s, 최대 3회)
- 전체 타임아웃: 5분

---

## Phase 3: 진단 엔진 + 프론트 (T5 완료 후)

### T6. 진단 파트 구조 변경 (4파트 → 3파트)

**현재:** 4파트 (LP품질/기반점수/참여율/전환율)
**변경:** 3파트

```
파트0 기반점수 (영상):
  - video_p3s_rate  → 벤치마크: engAbove.video_p3s_rate
  - thruplay_rate   → 벤치마크: engAbove.thruplay_rate
  - retention_rate   → 벤치마크: engAbove.retention_rate
  - ctr             → 벤치마크: convAbove.ctr (여기만 conversion 기준)

파트1 참여율:
  - reactions_per_10k    → 벤치마크: engAbove.reactions_per_10k
  - comments_per_10k     → 벤치마크: engAbove.comments_per_10k
  - shares_per_10k       → 벤치마크: engAbove.shares_per_10k
  - engagement_per_10k   → 벤치마크: engAbove.engagement_per_10k

파트2 전환율:
  - click_to_checkout_rate    → 벤치마크: convAbove.click_to_checkout_rate
  - click_to_purchase_rate    → 벤치마크: convAbove.click_to_purchase_rate
  - checkout_to_purchase_rate → 벤치마크: convAbove.checkout_to_purchase_rate
  - roas                      → 벤치마크: convAbove.roas
```

**engAbove** = `benchmarks WHERE ranking_type='engagement' AND ranking_group='ABOVE_AVERAGE'`
**convAbove** = `benchmarks WHERE ranking_type='conversion' AND ranking_group='ABOVE_AVERAGE'`

수정 파일:
- `src/lib/diagnosis/engine.ts` — PART_METRICS 재정의
- `src/lib/diagnosis/metrics.ts` — 메트릭 목록 변경
- `src/lib/diagnosis/one-line.ts` — 한줄 진단 텍스트 (H3: SHARE 분기 재작성)

### T7. 벤치마크 API 수정

**현재:** percentile(p25/p50/p75/p90) + creative_type별 조회
**변경:** ABOVE_AVERAGE 평균 + engAbove/convAbove 분리 전달

파일: `src/app/api/protractor/diagnosis/route.ts` (또는 해당 API)

```typescript
// API 응답 구조
{
  benchmarks: {
    VIDEO: {
      engagement: {
        above_avg: { video_p3s_rate: 23.5, reactions_per_10k: 38, ... }
      },
      conversion: {
        above_avg: { ctr: 3.2, click_to_checkout_rate: 10.5, ... }
      },
      sample_counts: { engagement: 29, conversion: 23 }
    },
    IMAGE: { ... },
    CATALOG: { ... }
  }
}
```

### T8. 판정 로직 수정

**현재:** percentile 기반 구간 판정
**변경:** ABOVE_AVERAGE 평균 기준 3단계

```typescript
function get3LevelVerdict(value: number, aboveAvg: number) {
  const threshold = aboveAvg * 0.75;
  if (value >= aboveAvg)  return '🟢';  // 우수
  if (value >= threshold) return '🟡';  // 보통
  return '🔴';                           // 미달
}
```

수정 파일:
- `src/lib/diagnosis/engine.ts`
- `src/components/protractor/benchmark-compare.tsx`

### T9. 참여 표시 — per_10k → 실제 개수 환산

**현재:** per_10k 그대로 표시
**변경:** "어제" 단일 조회 시 실제 개수로 환산 표시

```typescript
// 어제(단일) 조회 시:
const actual   = ad.reactions_per_10k × (ad.impressions / 10000);  // 실제 280개
const expected = engAbove.reactions_per_10k × (ad.impressions / 10000);  // 기대 222개
// 표시: "280개 / 222개"
// 판정: per_10k 값으로 비교

// 기간 평균(7/14/30일) 조회 시:
// per_10k 그대로 표시 ("48.0 / 38.0")
```

수정 파일: `src/components/protractor/` 관련 컴포넌트

---

## Phase 4: UI v2 개편

### T10. 성과 요약 탭 — TOP5 삭제 + 타겟중복 이동

**현재:** 게이지 + 진단 3파트 + TOP5 광고 + 일별 테이블
**변경:** 게이지 + 진단 3파트 + 타겟중복 (TOP5/일별 삭제)

- TOP 5 광고 섹션 삭제 (성과 요약 탭에서)
- 일별 성과 테이블 삭제 (성과 요약 탭에서)
- 타겟중복 분석을 성과 요약 탭 하단에 배치
- 타겟중복 기존 별도 탭 → 성과 요약 내 섹션으로 이동

### T11. 콘텐츠 탭 — 광고비순 1~5등 랭킹

**현재:** 추이 차트 + 퍼널
**변경:** 광고비순 1~5등 카드

- 기존 추이/퍼널 삭제
- 광고비 DESC 정렬 → 상위 5개 광고 카드
- 각 카드: 광고명 + 지출/노출/클릭/CTR/구매 요약
- 각 카드에 3파트 점수바 (기반점수/참여율/전환율)
- 1등 카드 펼침: 지표별 실제값 vs ABOVE_AVERAGE 벤치마크 그리드
- 각 카드에 버튼 2개:
  - **광고 통계**: `https://adsmanager.facebook.com/adsmanager/manage/ads?act={account_id}&selected_ad_ids={ad_id}`
  - **믹스패널**: `https://mixpanel.com/project/{project_id}/view/{board_id}`

### T12. 벤치마크 관리 탭 (관리자 전용, 신규)

**현재:** 없음
**변경:** 관리자가 벤치마크 데이터를 확인할 수 있는 탭

- 사이드바에 "벤치마크 관리" 메뉴 (관리자만 표시)
- creative_type별 탭 (VIDEO / IMAGE / CATALOG)
- 각 타입: ranking_type × ranking_group별 13개 지표값 테이블
- sample_count, calculated_at 표시
- 수동 재수집 버튼 (collect-benchmarks API 호출)
- 수집 히스토리 (최근 5회)

---

## 참고 파일

| 파일 | 역할 |
|------|------|
| `src/lib/diagnosis/engine.ts` | 진단 엔진 (PART_METRICS, 판정 로직) |
| `src/lib/diagnosis/metrics.ts` | 벤치마크 메트릭 정의 |
| `src/lib/diagnosis/one-line.ts` | 한줄 진단 텍스트 |
| `src/app/api/protractor/collect-benchmarks/route.ts` | 벤치마크 수집 크론 |
| `src/app/api/protractor/collect-daily/route.ts` | 일일 데이터 수집 |
| `src/app/api/protractor/lp-metrics/route.ts` | LP 메트릭 API (제거 대상) |
| `src/app/protractor/real-dashboard.tsx` | 수강생 대시보드 메인 |
| `src/components/protractor/ad-metrics-table.tsx` | TOP 5 광고 테이블 |
| `src/components/protractor/lp-metrics-card.tsx` | LP 카드 (제거 대상) |
| `src/components/protractor/benchmark-compare.tsx` | 벤치마크 비교 |
| `docs/design/protractor-v2-mockup.html` | v2 목업 (로컬) |
| GCP 원본 | `/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/cluade_code/meta-ads-benchmark/` |

## 환경변수

- `META_ACCESS_TOKEN`: Vercel env (전체 계정 접근용 토큰)
- `EXCLUDED_ACCOUNTS`: 제외할 광고계정 ID 배열

## 리뷰 결과 (이전 버전)

리뷰 보고서: https://mozzi-reports.vercel.app/reports/review/2026-02-25-protractor-code-review.html

### 경로 수정
- `src/lib/protractor/engine.ts` → `src/lib/diagnosis/engine.ts`
- `src/lib/protractor/metrics.ts` → `src/lib/diagnosis/metrics.ts`

### 숨은 이슈 (이전 리뷰에서 발견, 여전히 유효)
- **H1**: collect-daily가 영상/참여/creative_type 수집 안 함 → T5에서 함께 처리
- **H2**: database.ts 타입 재생성 필요 (initiate_checkout 등)
- **H3**: one-line.ts SHARE 분기 → T6에서 함께 재작성
- **H4**: engine.ts quality_ranking 키 → T1에서 함께 제거
- **H5**: ConversionFunnel 장바구니 스텝 → T2에서 함께 제거

### 실행 순서
Phase 1(병렬): T1 + T2 + T3 + T4 → Phase 2: T5 → Phase 3(병렬): T6 + T7 + T8 + T9 → Phase 4(병렬): T10 + T11 + T12

---

## 엣지 케이스

| 상황 | 기대 동작 |
|------|-----------|
| Meta 랭킹이 전부 UNKNOWN인 광고 | 벤치마크 계산에서 자동 제외, ad_insights_classified에는 저장 |
| 계정에 활성 광고가 0개 | 해당 계정 스킵, 에러 없이 다음 계정 진행 |
| CATALOG 타입 광고가 0개 | CATALOG 조합 벤치마크 행 생성 안 함 (NULL 행 금지) |
| IMAGE 광고의 영상 지표 | video_p3s_rate 등 NULL 저장, 벤치마크 AVG에서 NULL 제외 |
| Rate Limit (429) | exponential backoff 1s→2s→4s, 최대 3회 재시도 |
| impressions < 3,500 | 수집 대상에서 제외 |
| 수강생 광고에 creative_type 없음 | 'ALL' 벤치마크로 폴백 |
| benchmarks 테이블 비어있음 (첫 수집 전) | 대시보드에 "벤치마크 데이터 없음" 안내 표시 |

## 리뷰 보고서

- 보고서 파일: https://mozzi-reports.vercel.app/reports/review/2026-02-27-benchmark-v2-review.html
- 리뷰 일시: 2026-02-27 10:34
- 변경 유형: 혼합 (DB + 백엔드 구조 + API + UI/UX)
- 피드백 요약:
  - engine.ts ↔ utils.ts 판정 로직 이미 불일치 (2-threshold vs 0.75 단일) → 통일 필요
  - DB 컬럼 대부분 이미 존재 (quality/engagement/conversion_ranking), 값만 미수집
  - 데이터 단절 리스크: video_p3s_rate 분모(reach→impressions), retention_rate, creative_type 변경
  - 의사결정 필요: D1(retention_rate 분모), D2(타겟중복 배치), D3(T3 엔진 유지), D4(콘텐츠 벤치마크 기준)
- 반영: D1=retention_rate 계산식은 GCP 방식(100%시청/3초조회) 그대로, D2=성과요약 내 배치 확정, D4=ABOVE_AVERAGE 기준 확정

## 검증

☐ npm run build 성공
☐ npx tsc --noEmit — 타입 에러 0
☐ 기존 수강생 로그인 + 대시보드 접근 정상
☐ 벤치마크 수집 API 호출 → ad_insights_classified에 광고 데이터 저장 확인
☐ 벤치마크 수집 API 호출 → benchmarks 테이블에 ~33행 생성 확인
☐ 대시보드에서 ABOVE_AVERAGE 기준선으로 🟢🟡🔴 판정 표시 확인
☐ 참여 파트: 실제 개수 환산 표시 ("280개 / 222개" 형태) 확인
☐ 성과 요약 탭: TOP5 삭제, 타겟중복 하단 배치 확인
☐ 콘텐츠 탭: 광고비순 1~5등 카드 표시 확인
☐ 벤치마크 관리 탭: 관리자 접근 시 데이터 테이블 표시 확인

## 완료 후 QA

### 1단계: 에이전트팀 자체 QA (bkit)
- [ ] npm run build 성공
- [ ] 타입/린트 에러 0
- [ ] bkit qa-strategist Gap 분석
- [ ] bkit qa-monitor 런타임 검증
- [ ] 보안 점검 (RLS, 인증)
- [ ] QA봇에 결과 보고

### 2단계: 브라우저 QA (서브에이전트)
- [ ] 관리자 로그인 → 벤치마크 관리 탭 접근 → 데이터 확인
- [ ] 수강생 로그인 → 총가치각도기 → 진단 3파트 + 판정 확인
- [ ] 성과 요약 탭 → 타겟중복 하단 표시 확인
- [ ] 콘텐츠 탭 → 광고비순 1~5등 확인
- [ ] 기존 기능 회귀 테스트
