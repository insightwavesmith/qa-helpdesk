# TASK-각도기v2.md — 총가치각도기 탭 구조 개편

> 작성: 모찌 | 2026-02-26
> 목업: `docs/design/protractor-v2-mockup.html`
> 우선순위: 최긴급

## 현재 화면 스크린샷 (참조)

아래 이미지는 현재 배포 화면 캡처. "현재" 상태 파악 후 수정 작업 시 참고.

| 파일 | 설명 |
|------|------|
| `docs/design/current-top5-light.png` | TOP5 광고 + 일별 성과 (라이트) — **T2에서 삭제** |
| `docs/design/current-t3-detail-dark.png` | 총가치각도기 광고별 상세 (다크) — **T4 콘텐츠 탭 목표** |
| `docs/design/current-revenue-funnel-light.png` | 매출추이 + 전환퍼널 (라이트) — **T4에서 삭제** |
| `docs/design/current-overlap-dark.png` | 타겟중복 분석 (다크) — **T3 라이트모드로 전환** |

---

## ⚠️ 절대 규칙

1. **`docs/design/protractor-v2-mockup.html`을 반드시 처음에 읽어라.**
2. **기존 코드를 먼저 읽어라.** real-dashboard.tsx, 각 컴포넌트 전부.
3. **라이트 모드(화이트) 전용.**
4. **"이미 구현됨" 판단 금지.**

---

## 전체 변경 요약

| 탭 | 현재 | 변경 |
|---|---|---|
| 성과 요약 | 게이지+지표+진단+TOP5+일별테이블 | 게이지+지표+진단 (TOP5/일별 **삭제**) |
| 타겟중복 | 기존 OverlapAnalysis (구현됨) | 라이트모드 적용 + 이미지 2번 목업 반영 |
| 콘텐츠 | 추이차트+전환퍼널+벤치마크비교 | **전면 교체** → 컨텐츠별 1~5등 + p100 벤치마크 |
| 벤치마크 관리 | ❌ 없음 | **신규** — 벤치마크 데이터 조회 (관리자 전용) |

---

## T1. 3초 시청률 수집 필드 수정

### 현재 (잘못됨)
- `collect-daily/route.ts`에서 `video_play_actions` 사용 (비디오 재생 시작 = 1ms 이상)
- 분모: reach → 80~95% 나옴 (비정상적으로 높음)

### 수정
- Meta API 필드를 `video_p3s_watched_actions`로 변경 (3초 이상 시청 횟수)
- 또는 `actions` 필드에서 `video_view` type 중 `action_video_type: "3_sec"` 필터
- 계산: `video_p3s_watched_actions / reach × 100`
- 업계 평균 30%대가 나와야 정상

### 파일
- `src/app/api/cron/collect-daily/route.ts` — Meta API 요청 필드 + calculateMetrics() 수정

### 완료 기준
- [ ] 3초 시청률이 30~50% 범위 (업계 정상)
- [ ] collect-daily 재실행 후 데이터 확인

---

## T2. 성과 요약 탭 — TOP5 + 일별 삭제

### 삭제 대상
- `Top5AdCards` 컴포넌트 및 import
- `DailyMetricsTable` 컴포넌트 및 import
- 관련 API 호출 (insights API에서 TOP5 데이터 fetch)

### 유지
- TotalValueGauge (게이지)
- 6개 지표 카드
- DiagnosticPanel (진단 3파트)
- SummaryCards (총광고비/클릭/구매/ROAS 카드)

### 파일
- `src/app/(main)/protractor/real-dashboard.tsx` — 성과 요약 탭 렌더링 수정

### 완료 기준
- [ ] 성과 요약 탭에서 TOP5 섹션 없음
- [ ] 성과 요약 탭에서 일별 테이블 없음
- [ ] 게이지+지표+진단은 유지

---

## T3. 타겟중복 탭 — 라이트모드 + 목업 반영

### 현재
- OverlapAnalysis 컴포넌트 구현됨 (다크모드 스타일 가능성)
- 7일 이상 기간에만 활성

### 수정
- 라이트모드(화이트) 스타일 확인/적용
- 목업 이미지 2번 참조:
  - 히어로: 전체 중복률 도넛 + 실제도달/개별합/중복낭비
  - 경고: 60%↑ 조합 (캠페인명+세트명)
  - 전체 세트 현황 테이블
  - "새로 분석" 버튼
- 기존 구현이 목업과 다르면 수정

### 파일
- `src/app/(main)/protractor/components/overlap-analysis.tsx`

### 완료 기준
- [ ] 라이트모드 스타일 적용
- [ ] 히어로 (도넛+통계) 정상 표시
- [ ] 중복 경고 카드 정상 표시
- [ ] 전체 세트 테이블 정상 표시

---

## T4. 콘텐츠 탭 — 전면 교체

### 삭제 대상
- PerformanceTrendChart (매출 vs 광고비 추이)
- ConversionFunnel (전환 퍼널)
- BenchmarkCompare (기존 벤치마크 비교)

### 신규 구현 — ContentRanking 컴포넌트

#### 구조 (이미지 4번 참조)
광고비 합산 기준 TOP 1~5등, 각 카드:
```
#1
홈케어 세트 - 체험 후기 30초 영상
┌──────────┬────────┬────────┬────────┬────────┐
│ ₩289,200 │ 58,420 │ 1,659  │ 2.84%  │   52   │
│   지출   │  노출  │  클릭  │  CTR   │  구매  │
└──────────┴────────┴────────┴────────┴────────┘
  🟢 기반점수     🟡 참여율     🟢 전환율

[성과 분석 펼치기]
┌──────────────┬──────────────┬──────────────┐
│ 기반점수      │ 참여율        │ 전환율        │
├──────────────┼──────────────┼──────────────┤
│ 3초시청률     │ 좋아요  28/22│ CTR  2.84%   │
│ 42.3%   🟢   │ 댓글    2/5  │ 결제시작 5.2% │
│ ThruPlay율   │ 공유    4/6  │ 구매전환 3.1% │
│ 8.2%    🟡   │ 참여합계34/33│ 노출→구매0.09%│
│ 지속비율      │              │ ROAS 3.21    │
│ 56.1%   🟡   │              │              │
└──────────────┴──────────────┴──────────────┘
  * 참여율의 28/22 = 실제값/p100(상위10%)벤치마크
```

#### p100 벤치마크 표시
- 각 지표 옆에 **p90 벤치마크 값** 표시 (상위 10% 이내 = p90 이상)
- 형식: `실제값 / p90값`
- 실제값 ≥ p90 → 🟢, p50~p90 → 🟡, < p50 → 🔴
- 참여율의 경우: `좋아요 28 / 22` = 내 좋아요 28 / p90 기준 22

#### 데이터 소스
- 기간 내 daily_ad_insights에서 ad_id별 합산
- creative_type별 구분 (광고명에서 유추 또는 DB)
- 벤치마크: benchmarks 테이블에서 p90 조회
- 진단 3파트: T3 엔진으로 개별 광고 점수 계산

#### 버튼
- 각 카드에 [광고 통계] [믹스패널] 버튼 (기존 TOP5와 동일)

### 파일
- `src/app/(main)/protractor/components/content-ranking.tsx` — 신규
- `src/app/(main)/protractor/real-dashboard.tsx` — 콘텐츠 탭 렌더링 변경
- `src/app/api/protractor/insights/route.ts` — ad별 진단 데이터 포함 응답

### 완료 기준
- [ ] 콘텐츠 탭에서 추이차트+퍼널 없음
- [ ] 광고비순 1~5등 카드 표시
- [ ] 각 카드에 지출/노출/클릭/CTR/구매 표시
- [ ] 기반점수/참여율/전환율 바 표시 (🟢🟡🔴)
- [ ] 성과 분석 펼치기: 지표별 실제값 / p90 벤치마크 표시
- [ ] [광고 통계] [믹스패널] 버튼

---

## T5. 벤치마크 관리 탭 (신규, 관리자 전용)

### 목적
- Smith님이 벤치마크 데이터와 계산 방식을 직접 확인할 수 있는 관리 화면

### 구현
- 탭: "벤치마크 관리" (관리자 role일 때만 표시)
- 내용:
  1. **계산 방식 안내**: 모집단(전체 접근 계정), 필터(impressions ≥ 3,500), percentile 선형보간법
  2. **벤치마크 테이블**: metric_name, creative_type, p25, p50, p75, p90, avg, sample_size, calculated_at
  3. **수집 이력**: 마지막 수집 시각, 다음 예정
  4. **수동 수집 버튼**: "벤치마크 재수집" → collect-benchmarks API 호출

### API
- `GET /api/protractor/benchmarks` — 벤치마크 전체 목록 (관리자 전용)
- 기존 collect-benchmarks 크론 API 재사용 (수동 트리거)

### 파일
- `src/app/(main)/protractor/components/benchmark-admin.tsx` — 신규
- `src/app/api/protractor/benchmarks/route.ts` — 신규 (GET: 목록 조회)
- `src/app/(main)/protractor/real-dashboard.tsx` — 벤치마크 관리 탭 추가

### 완료 기준
- [ ] 관리자만 벤치마크 관리 탭 보임
- [ ] 벤치마크 데이터 테이블 (지표별 p25/p50/p75/p90/avg/sample)
- [ ] 계산 방식 안내 텍스트
- [ ] 수동 재수집 버튼 동작

---

## T6. ad_name 수집 수정

### 현재
- daily_ad_insights에 ad_name이 전부 null
- Meta API fields에서 ad_name 누락 추정

### 수정
- collect-daily에서 Meta API 요청 시 `ad_name` 필드 포함 확인
- 없으면 fields에 추가
- 컨텐츠 탭에서 광고명 표시에 필수

### 파일
- `src/app/api/cron/collect-daily/route.ts`

### 완료 기준
- [ ] collect-daily 재실행 후 ad_name 정상 저장
- [ ] 컨텐츠 탭에서 광고명 표시

---

## 수정 대상 파일 요약

| 파일 | T1 | T2 | T3 | T4 | T5 | T6 |
|------|----|----|----|----|----|----|
| collect-daily/route.ts | ✅ | | | | | ✅ |
| real-dashboard.tsx | | ✅ | | ✅ | ✅ | |
| overlap-analysis.tsx | | | ✅ | | | |
| content-ranking.tsx (신규) | | | | ✅ | | |
| benchmark-admin.tsx (신규) | | | | | ✅ | |
| benchmarks API (신규) | | | | | ✅ | |
| insights/route.ts | | | | ✅ | | |

---

## 금지 사항
- 다크모드 스타일 추가 금지
- 기존 게이지/진단 로직 변경 금지
- DB 스키마 변경 금지
- 일별 비율 평균 사용 금지 (분자/분모 SUM 후 재계산)
