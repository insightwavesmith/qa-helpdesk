# TASK-데이터수집v2: GCP 원본 기반 데이터 수집 재설계

## 개요
GCP 원본 `collect_daily.py` + `collect_benchmarks.py` 로직을 QA 헬프데스크에 이식.
핵심: Meta ranking 3종 수집 + ranking_group별 벤치마크 분리 + 진단 판정 로직 변경.

## 참조 문서
- 아키텍처: `https://mozzi-reports.vercel.app/reports/architecture/2026-02-26-data-collection-architecture.html`
- GCP 원본 코드: `/Users/smith/.openclaw/workspace/총가치각도기-source/collect-benchmarks/`
  - `collect_daily.py` — 일별 수집 원본
  - `collect_benchmarks.py` — 벤치마크 수집 원본
  - `diagnose_ad_v3.py` — 진단 엔진 원본
  - `dashboard_api.py` — 대시보드 API 원본
- GCP 프론트엔드: `/Users/smith/.openclaw/workspace/총가치각도기-source/dynamic.html`
- 레퍼런스 이미지: `/Users/smith/.openclaw/workspace/refs/`
  - `top5-ads-light.png` — TOP5 광고+일별 (삭제 대상)
  - `t3-detail-dark.png` — 광고별 상세 진단 (기반점수/참여율/전환율)
  - `revenue-funnel-light.png` — 매출추이+퍼널 (삭제 대상)
  - `overlap-analysis-dark.png` — 타겟중복 분석

## 리뷰 결과
(코드리뷰 후 기재)

---

## D1. collect-daily 수정 (Meta API 필드 추가 + 계산식 변경)

### 현재
- 파일: `src/app/api/cron/collect-daily/route.ts` (488줄)
- 엔드포인트: `/{account_id}/insights` → 인사이트만 조회
- ranking 3종: 미수집
- creative_type: `videoP3s > 0 ? 'VIDEO' : 'IMAGE'` (SHARE 구분 불가)
- video_p3s_rate 분모: reach
- retention_rate: thruplay / videoP3s

### 변경사항

#### D1-1. API 엔드포인트 변경
```
현재: GET /{account_id}/insights?fields=...
변경: GET /{account_id}/ads?fields={AD_FIELDS},insights.date_preset(yesterday){INSIGHT_FIELDS}
```
GCP 방식: 광고+인사이트 단일 요청. `creative.fields(object_type)` 포함.

#### D1-2. 수집 필드 추가
**AD_FIELDS 추가:**
```
creative.fields(object_type)
```

**INSIGHT_FIELDS 추가:**
```
quality_ranking
engagement_rate_ranking    ← API 필드명 (저장 시 engagement_ranking으로)
conversion_rate_ranking    ← API 필드명 (저장 시 conversion_ranking으로)
video_p100_watched_actions ← retention_rate 계산용
```

#### D1-3. ACTIVE 광고 필터 추가
```
filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]
```

#### D1-4. creative_type 분류 변경
```
현재: videoP3s > 0 ? 'VIDEO' : 'IMAGE'

변경 (GCP get_creative_type 이식):
  creative.object_type 값 매핑:
    VIDEO              → 'VIDEO'
    SHARE              → 'SHARE'
    IMAGE              → 'IMAGE'
    PRIVACY_CHECK_FAIL → 'VIDEO'
    기타               → 'UNKNOWN'
```

#### D1-5. ranking 정규화 + 저장
```typescript
function normalizeRanking(ranking: string | null): string {
  if (!ranking) return 'UNKNOWN';
  const upper = ranking.toUpperCase();
  if (upper.includes('ABOVE')) return 'ABOVE_AVERAGE';
  if (upper.includes('BELOW')) return 'BELOW_AVERAGE';
  if (upper === 'AVERAGE') return 'AVERAGE';
  return 'UNKNOWN';
}
```

저장 컬럼:
- `quality_ranking` ← API `quality_ranking`
- `engagement_ranking` ← API `engagement_rate_ranking` (필드명 다름!)
- `conversion_ranking` ← API `conversion_rate_ranking`

#### D1-6. 계산식 변경
```
video_p3s_rate:
  현재: videoP3s / reach × 100
  변경: videoP3s / impressions × 100  ← 분모 변경

retention_rate:
  현재: thruplay / videoP3s × 100
  변경: video_p100 / videoP3s × 100   ← 정의 변경 (GCP: 100% 시청 / 3초 시청)
```

#### D1-7. video_p100 저장
`video_p100_watched_actions`에서 `video_view` 타입 값 추출 → `video_p100` 컬럼에 저장.

---

## D2. collect-benchmarks 수정 (ranking_group별 AVG 추가)

### 현재
- 파일: `src/app/api/cron/collect-benchmarks/route.ts` (160줄)
- 전체 광고 대상 → p25/p50/p75/p90/avg 백분위수 저장
- ranking 무시, creative_type=ALL 포함

### 변경사항

#### D2-1. 기존 백분위수 로직 유지
T3 점수 엔진이 percentile 기반이므로 기존 로직 그대로 유지.
단, creative_type 필터 추가: `VIDEO`, `SHARE`만 (IMAGE 제외).
`ALL` 그룹도 유지 (VIDEO+SHARE 합산).

#### D2-2. ranking_group별 AVG 벤치마크 추가
기존 로직 이후에 추가 실행:

```
1. daily_ad_insights에서 최근 7일, impressions >= 3500 조회
2. creative_type IN ('VIDEO', 'SHARE')
3. ranking != 'UNKNOWN' 필터
4. 6개 그룹 생성:
   - VIDEO × quality_ranking → GROUP BY quality_ranking
   - VIDEO × engagement_ranking → GROUP BY engagement_ranking  
   - VIDEO × conversion_ranking → GROUP BY conversion_ranking
   - SHARE × quality_ranking → GROUP BY quality_ranking (비디오 지표 NULL)
   - SHARE × engagement_ranking → GROUP BY engagement_ranking (비디오 지표 NULL)
   - SHARE × conversion_ranking → GROUP BY conversion_ranking (비디오 지표 NULL)
5. 각 그룹 내 ranking_group(ABOVE/AVERAGE/BELOW)별 AVG 계산
6. benchmarks 테이블에 upsert (ranking_type + ranking_group 포함)
```

#### D2-3. SHARE 비디오 지표 NULL 처리
SHARE 타입 벤치마크 저장 시:
- `video_p3s_rate` → NULL
- `thruplay_rate` → NULL  
- `retention_rate` → NULL

#### D2-4. 벤치마크 지표 목록 (14개)
```
video_p3s_rate, thruplay_rate, retention_rate,
reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k, engagement_per_10k,
ctr, click_to_checkout_rate, click_to_purchase_rate, checkout_to_purchase_rate,
reach_to_purchase_rate, roas
```
❌ 제거: click_to_cart_rate, cart_to_purchase_rate

---

## D3. 진단 엔진 판정 로직 변경

### 현재
- 파일: `src/lib/diagnosis/engine.ts` (265줄)
- 판정: p75 이상=🟢, avg 이상=🟡, avg 미만=🔴

### 변경사항

#### D3-1. 판정 기준 변경 (GCP dynamic.html 방식)
```
기준값 = ABOVE_AVERAGE 그룹 평균 (aboveAvg) 하나만 사용

정방향 (높을수록 좋음):
  🟢 우수: value >= aboveAvg
  🟡 보통: value >= aboveAvg × 0.75
  🔴 미달: value < aboveAvg × 0.75

역방향 (낮을수록 좋음 — CPC 등):
  🟢 우수: value <= aboveAvg
  🟡 보통: value <= aboveAvg × 1.25
  🔴 미달: value > aboveAvg × 1.25
```

#### D3-2. 벤치마크 조회 변경
```
현재: benchmarks 테이블에서 metric_name으로 조회 → p75/avg 사용
변경: benchmarks 테이블에서 ranking_type + ranking_group='ABOVE_AVERAGE' 조회 → avg_value 사용
```

#### D3-3. ranking_type ↔ 진단 파트 매핑
```
engagement 벤치마크 → 기반점수 (video_p3s_rate, thruplay_rate, retention_rate)
engagement 벤치마크 → 참여율 (reactions/comments/shares/saves_per_10k, engagement_per_10k)
conversion 벤치마크 → 전환율 (ctr, click_to_checkout/purchase_rate, checkout_to_purchase_rate, roas)
```

#### D3-4. 참여율 실제/기대 비교 추가
GCP 방식: 참여율 지표는 "실제값/기대값" 형태로 비교.
기대값 = ABOVE_AVERAGE 그룹의 해당 지표 AVG × (내 impressions / 10000).

#### D3-5. SHARE 타입 기반점수 스킵
```
if (creative_type === 'SHARE') {
  기반점수 파트 = UNKNOWN (⚪)  // 비디오 지표 없음
}
```

---

## D4. DB 마이그레이션

### D4-1. daily_ad_insights 컬럼 추가
```sql
ALTER TABLE daily_ad_insights
  ADD COLUMN IF NOT EXISTS quality_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS engagement_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS conversion_ranking TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS video_p100 INTEGER DEFAULT 0;
```

### D4-2. benchmarks 컬럼 추가
```sql
ALTER TABLE benchmarks
  ADD COLUMN IF NOT EXISTS ranking_type TEXT,
  ADD COLUMN IF NOT EXISTS ranking_group TEXT,
  ADD COLUMN IF NOT EXISTS total_impressions BIGINT;
```

### D4-3. benchmarks unique 제약조건
기존: `(metric_name, creative_type, date)`
변경: `(metric_name, creative_type, date, ranking_type, ranking_group)`
※ ranking_type=NULL인 기존 행(백분위수) 호환 유지

---

## D5. 총가치각도기 UI 변경

### 현재
- 파일: `src/app/(main)/protractor/real-dashboard.tsx`
- 컴포넌트: `src/app/(main)/protractor/components/`
- 탭: 성과요약 / 타겟중복 / 콘텐츠

### 변경사항

#### D5-1. 성과 요약 탭 변경
- **유지**: T3 게이지, 3파트 진단 (기반점수/참여율/전환율)
- **삭제**: TOP5 광고 카드 (`top5-ad-cards.tsx`), 일별 성과 상세 테이블 (`ad-metrics-table.tsx`)
- **추가**: 타겟중복 분석 위젯 (기존 타겟중복 탭 UI를 성과 요약 하단에 삽입)
- **벤치마크 표시 변경**: 각 지표에 `벤치마크값 / 내 데이터` 형식 (예: `35% / 42.3%`)
- **참여율**: 실제/기대 형식 (예: `28/22`)

#### D5-2. 콘텐츠 탭 변경
- **삭제**: 매출 vs 광고비 추이 차트, 전환 퍼널
- **추가**: 광고비순 1~5등 광고 카드
  - 필터: impressions >= 3,500 AND ranking ABOVE_AVERAGE 이상
  - 각 카드: 5개 요약 지표(지출/노출/클릭/CTR/구매) + 3파트 판정
  - 접기/펼치기 (t3-detail-dark.png 참조)
  - aboveAvg 벤치마크 비교선

#### D5-3. 벤치마크 관리 탭 (관리자 전용)
- 신규 탭 추가 (admin role만 표시)
- 벤치마크 수집 현황 (최근 수집일, 샘플 수, creative_type별)
- ranking_group별 AVG 값 테이블 (VIDEO/SHARE × quality/engagement/conversion)
- 수동 재수집 트리거 버튼

#### D5-4. 라이트 모드
모든 UI는 라이트 모드. 다크 모드 지원하지 않음.

---

## 구현 순서
1. D4 (DB 마이그레이션) — Smith님 직접 또는 Supabase Dashboard
2. D1 (collect-daily 수정) — API 필드+계산식+ranking
3. D2 (collect-benchmarks 수정) — ranking_group별 AVG 추가
4. D3 (진단 엔진) — 판정 로직 변경
5. D5 (UI 변경) — 탭 구조+벤치마크 표시

## 제약조건
- GCP 원본 Python 코드 참조 필수 (경로 위에 명시)
- 레퍼런스 이미지 참조 필수 (refs/ 폴더)
- cart 관련 지표 전부 제거 (click_to_cart_rate, cart_to_purchase_rate, add_to_cart)
- 라이트 모드 전용
- engagement_per_10k = reactions+comments+shares+saves (saves 포함, QA 방식 유지)
- video_p3s_rate 분모 = impressions (reach 아님)
- retention_rate = video_p100 / videoP3s (thruplay 아님)

---

## 리뷰 결과

> 리뷰어: backend-dev | 2026-02-27
> 현재 구현 상태 분석 후 작성

| 항목 | 현재 상태 | 비고 |
|------|----------|------|
| D1 collect-daily | ✅ 구현 완료 (587199d) | GCP 방식 전면 재작성 |
| D2 collect-benchmarks | ✅ 구현 완료 (de8bc30, T5) | ranking_group별 평균 계산 |
| D3 진단 엔진 | ✅ 구현 완료 (b6cc078, Phase3) | ABOVE_AVERAGE 기반 판정 |
| D4-1 ranking 마이그레이션 | ✅ 파일 생성됨 | 20260227_daily_ad_insights_ranking.sql |
| D4-2 benchmarks 마이그레이션 | ✅ 파일 생성됨 | 20260227_benchmarks_wide_format.sql |
| D4-3 ad_insights_classified 생성 | ✅ 파일 생성됨 | 20260227_ad_insights_classified.sql |
| D5 UI 변경 | ✅ 구현 완료 (b48bc22, Phase4) | ContentRanking + BenchmarkAdmin |

⚠️ Smith님 실행 필요:
1. `20260227_benchmarks_wide_format.sql` — benchmarks 테이블 재생성
2. `20260227_ad_insights_classified.sql` — ad_insights_classified 테이블 생성
3. `20260227_daily_ad_insights_ranking.sql` — daily_ad_insights ranking 컬럼 추가

## T1. DB 마이그레이션 파일 작성

### 현재
- benchmarks 테이블: 구 EAV 형식 (metric_name/p25/p50/p75/p90)
- ad_insights_classified: 존재하지 않음
- daily_ad_insights: ranking 컬럼 없음

### 목업
- 신규 wide format benchmarks (creative_type × ranking_type × ranking_group)
- ad_insights_classified 신규 테이블
- daily_ad_insights ranking 컬럼 추가

### 변경
- `supabase/migrations/20260227_benchmarks_wide_format.sql` 생성 ✅
- `supabase/migrations/20260227_ad_insights_classified.sql` 생성 ✅
- `supabase/migrations/20260227_daily_ad_insights_ranking.sql` 생성 ✅ (587199d 포함)
