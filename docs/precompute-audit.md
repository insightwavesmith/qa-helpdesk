# 사전계산 후 로드 — 적용 가능 영역 전수 조사

> 작성일: 2026-03-11
> 목적: 페이지 로드 시 실시간 계산하는 영역을 파악하여, 수집/크론 시점에 사전계산 → DB 저장 → 프론트 로드 구조로 전환 가능한 영역 식별

---

## 현재 사전계산 인프라 (이미 존재)

| 테이블 | 갱신 주기 | 트리거 | 용도 |
|--------|----------|--------|------|
| `daily_ad_insights` | 매일 18:00 UTC | Cron | 광고 지표 원본 |
| `benchmarks` | 매주 월 17:00 UTC | Cron | T3/진단 벤치마크 |
| `daily_mixpanel_insights` | 매일 18:30 UTC | Cron | 믹스패널 매출 |
| `adset_overlap_cache` | 온디맨드 | 백필/수동 | 오버랩 캐시 (24h TTL) |
| `account_categories` | 온디맨드 | 벤치마크 수집 시 | 계정 분류 |

---

## 영역별 분석

### 🔴 Tier 1 — 매우 높은 효과 (즉시 적용 추천)

#### 1. T3 총가치각도기 점수 계산
- **파일**: `src/app/api/protractor/total-value/route.ts`, `src/lib/protractor/t3-engine.ts`
- **현재 동작**:
  - `daily_ad_insights` 조회 (계정+기간, 50~50,000행)
  - `computeMetricValues()`: 14개 지표 가중평균 계산 (비디오 3 + 참여도 5 + 전환 6)
  - `getDominantCreativeType()`: 크리에이티브 유형별 빈도 집계
  - `fetchBenchmarks()`: 벤치마크 조회 + 폴백 로직
  - `calculateT3Score()`: 14개 지표 × ratio → 0~100 점수 → 3파트 평균 → 등급(A~F)
  - pctOfBenchmark 변환 (14개 지표별)
- **데이터 규모**: 1K~50K행 루프, 42개 점수 계산
- **예상 지연**: 100~300ms/요청
- **사전계산 방안**:
  - 크론(collect-daily) 완료 후 계정별 T3 점수 자동 계산
  - `t3_scores_precomputed(account_id, period, creative_type, score, grade, metrics_json, computed_at)` 테이블 신설
  - 기간별(7/30/90일) 사전계산
- **구현 난이도**: 보통
- **영향**: 관리자 + 수강생 (총가치각도기 대시보드)
- **효과**: ⭐⭐⭐⭐⭐

#### 2. 수강생 성과 분석 (Performance)
- **파일**: `src/actions/performance.ts` (lines 62-256)
- **현재 동작**:
  - 수강생 프로필 조회 (role=student)
  - ad_accounts 전체 조회
  - `daily_ad_insights` 기간별 조회 (10K+ 행 가능)
  - 수강생별 for 루프: spend/revenue/purchases/roas 합산
  - 수강생별 `computeMetricValues()` + `calculateT3Score()` 실행
  - `daily_mixpanel_insights` 조회 + 매칭
  - `fetchBenchmarksForT3()` 벤치마크 로드
- **데이터 규모**: 수강생 20~30명 × 30일 × 광고 N개 = 수만 행
- **예상 지연**: 500ms~2s/요청
- **사전계산 방안**:
  - `student_performance_daily(student_id, period, spend, revenue, roas, t3_score, t3_grade, computed_at)` 테이블 신설
  - 크론(collect-daily) 완료 후 전 수강생 성과 일괄 계산
- **구현 난이도**: 보통
- **영향**: 관리자 전용 (`/admin/performance`)
- **효과**: ⭐⭐⭐⭐⭐

#### 3. 광고 진단 (Diagnosis)
- **파일**: `src/app/api/diagnose/route.ts`, `src/lib/diagnosis/engine.ts`
- **현재 동작**:
  - 벤치마크 로드 (ABOVE_AVERAGE, 크리에이티브별)
  - `daily_ad_insights` 조회 (limit 1000)
  - ad_id별 그룹화 + 합산
  - spend 상위 5개 광고 추출
  - 광고별 `diagnoseAd()`: 6파트 × 2지표 = 12개 판정 (GOOD/NORMAL/POOR)
  - `generateOneLineDiagnosis()` 진단 요약
- **데이터 규모**: 1000행 → 상위 5개 광고 × 12 판정
- **예상 지연**: 50~150ms/요청
- **사전계산 방안**:
  - `ad_diagnosis_cache(account_id, ad_id, verdict, parts_json, one_liner, computed_at)` 테이블
  - 크론 시점에 계정별 상위 광고 진단 미리 수행
- **구현 난이도**: 쉬움
- **영향**: 관리자 + 수강생 (진단 탭)
- **효과**: ⭐⭐⭐⭐

---

### 🟡 Tier 2 — 높은 효과

#### 4. 대시보드 요약 통계 (Admin Stats)
- **파일**: `src/app/(main)/admin/stats/page.tsx` (lines 21-57), `src/actions/admin.ts` (lines 230-310)
- **현재 동작**:
  - 6개 COUNT 쿼리 병렬 실행 (질문 수, 답변 수, 승인된 답변, 활성 회원, 발행 콘텐츠, 최근 7일 질문)
  - `getWeeklyQuestionStats()`: 28일치 질문 → for 루프 → 일별 그룹화
- **데이터 규모**: COUNT 쿼리 6개 + 28일 질문 그룹화
- **예상 지연**: 30~80ms/요청
- **사전계산 방안**:
  - `dashboard_stats_cache(stat_key, value, updated_at)` 테이블
  - 질문/답변/콘텐츠 변경 시 트리거 또는 1시간 주기 갱신
- **구현 난이도**: 쉬움
- **영향**: 관리자 전용
- **효과**: ⭐⭐⭐

#### 5. 이메일 분석 통계
- **파일**: `src/app/api/admin/email/analytics/route.ts` (lines 17-79)
- **현재 동작**:
  - `email_sends` 조회 (status=sent, limit 1000)
  - Map으로 subject별 그룹화: recipients, opens, clicks 집계
  - openRate/clickRate 퍼센트 계산
- **데이터 규모**: 최대 1000 이메일 발송 기록
- **예상 지연**: 20~60ms/요청
- **사전계산 방안**:
  - `email_campaign_stats(subject, recipients, opens, clicks, open_rate, click_rate, updated_at)` 테이블
  - 이메일 발송/열람 이벤트 시 증분 업데이트
- **구현 난이도**: 쉬움
- **영향**: 관리자 전용
- **효과**: ⭐⭐⭐

#### 6. 지식관리 모니터링 (Knowledge Stats)
- **파일**: `src/app/(main)/admin/knowledge/page.tsx` (lines 80-120)
- **현재 동작** (클라이언트 사이드):
  - `knowledge_usage` 조회 (30일, 500건 limit)
  - `reduce()` 3회: 일별 비용, 소비자 분포, 일별 응답시간
  - 토큰 → 비용 변환: input 70% × $0.0X + output 30% × $0.0X
- **데이터 규모**: 최대 500행 reduce
- **예상 지연**: 10~30ms (클라이언트)
- **사전계산 방안**:
  - `knowledge_daily_stats(date, total_cost, avg_duration_ms, consumer_counts_json)` 테이블
  - usage 로그 INSERT 시 트리거로 일별 집계
- **구현 난이도**: 쉬움
- **영향**: 관리자 전용
- **효과**: ⭐⭐⭐

#### 7. 프로트랙터 계정 상태 (Protractor Status)
- **파일**: `src/app/api/admin/protractor/status/route.ts`
- **현재 동작**:
  - `ad_accounts` 전체 조회 (10~20개)
  - `daily_ad_insights` 최근 3일 조회 (100~500행)
  - Map 집계: 계정별 lastDate, adCount
  - mixpanel 상태 Map 집계
  - 결과 합산: metaOk/mixpanelOk/error 카운트
- **데이터 규모**: 20 계정 × 3일
- **예상 지연**: 20~50ms/요청
- **사전계산 방안**:
  - collect-daily 크론 완료 후 계정별 상태 기록
- **구현 난이도**: 쉬움
- **영향**: 관리자 전용
- **효과**: ⭐⭐

---

### 🟢 Tier 3 — 중간 효과

#### 8. Summary Cards (T2 집계)
- **파일**: `src/lib/protractor/aggregate.ts` (lines 36-181)
- **현재 동작**:
  - insights API 결과 메모리 재사용
  - `aggregateSummary()`: totalSpend/Impressions/Reach/Clicks/Purchases/Revenue 합산
  - 비율 계산: avgCtr, avgCpc, roas, avgVideoP3sRate 등
  - `toSummaryCards()`: 6개 카드 + 벤치마크 비교 퍼센트
- **데이터 규모**: insights 메모리 데이터 재활용 (추가 DB 호출 없음)
- **예상 지연**: 10~20ms (클라이언트)
- **사전계산 방안**: T3 사전계산 시 summary도 함께 저장
- **구현 난이도**: 쉬움 (T3와 동시 구현)
- **영향**: 관리자 + 수강생
- **효과**: ⭐⭐

#### 9. 광고별 집계 (Ad Metrics Table)
- **파일**: `src/lib/protractor/aggregate.ts` (lines 262-286)
- **현재 동작**:
  - `aggregateInsightsByAd()`: ad_id별 그룹화
  - 14개 지표 합산 + 비율 재계산
  - spend DESC 정렬
- **데이터 규모**: 10~100개 광고
- **예상 지연**: 10~30ms (클라이언트)
- **사전계산 방안**: insights 테이블에 ad_id 레벨 집계 뷰 추가
- **구현 난이도**: 쉬움
- **영향**: 관리자 + 수강생
- **효과**: ⭐⭐

#### 10. 콘텐츠 상태별 카운트
- **파일**: `src/app/(main)/admin/content/page.tsx` (lines 89-153)
- **현재 동작**:
  - 콘텐츠 전체 로드 후 `.filter()` 로 상태별 카운트
  - `useCallback`으로 메모이징
- **데이터 규모**: 100~500개 콘텐츠
- **예상 지연**: <10ms (클라이언트)
- **사전계산 방안**: DB에서 GROUP BY status COUNT 또는 Supabase RPC
- **구현 난이도**: 쉬움
- **영향**: 관리자 전용
- **효과**: ⭐

#### 11. 기수(Cohort) 목록 중복제거
- **파일**: `src/actions/admin.ts` (line 79)
- **현재 동작**: 프로필 전체 조회 → `new Set()` → `.sort()`
- **사전계산 방안**: DB DISTINCT 쿼리로 대체 (사전계산 불필요, 쿼리 최적화)
- **구현 난이도**: 쉬움
- **효과**: ⭐

---

### ⚪ 사전계산 불필요 (현재 구조 유지)

| 영역 | 파일 | 이유 |
|------|------|------|
| Insights 원본 조회 | `/api/protractor/insights/route.ts` | 계산 없음, 순수 DB 조회 |
| 벤치마크 표시 | `/api/protractor/benchmarks/route.ts` | 이미 사전계산됨 (주간 크론) |
| 오버랩 분석 | `/api/protractor/overlap/route.ts` | 이미 24h 캐시, Meta API 실시간 의존 |
| QA 질문/답변 목록 | `src/actions/questions.ts`, `answers.ts` | 단순 페이지네이션, 집계 없음 |
| 게시글 목록 | `src/actions/posts.ts` | 단순 조회 + 매핑 |
| 회원 대시보드 | `member-dashboard.tsx` | 3건 fetch + slice, 계산 없음 |
| 답변 승인 카운트 | `answers/page.tsx` | 단순 COUNT 1건 |

---

## 우선순위 매트릭스

| 순위 | 영역 | 효과 | 난이도 | 데이터규모 | 지연절감 | 영향범위 |
|:----:|------|:----:|:------:|:---------:|:--------:|:--------:|
| **1** | T3 점수 계산 | ⭐⭐⭐⭐⭐ | 보통 | 1K~50K행 | 100~300ms | 관리자+수강생 |
| **2** | 수강생 성과 분석 | ⭐⭐⭐⭐⭐ | 보통 | 수만 행 | 500ms~2s | 관리자 |
| **3** | 광고 진단 | ⭐⭐⭐⭐ | 쉬움 | 1000행→5개 | 50~150ms | 관리자+수강생 |
| **4** | 대시보드 통계 | ⭐⭐⭐ | 쉬움 | COUNT 6개 | 30~80ms | 관리자 |
| **5** | 이메일 분석 | ⭐⭐⭐ | 쉬움 | 1000건 | 20~60ms | 관리자 |
| **6** | 지식관리 통계 | ⭐⭐⭐ | 쉬움 | 500건 | 10~30ms | 관리자 |
| **7** | 계정 상태 | ⭐⭐ | 쉬움 | 20계정×3일 | 20~50ms | 관리자 |
| **8** | Summary Cards | ⭐⭐ | 쉬움 | 메모리 | 10~20ms | 관리자+수강생 |
| **9** | 광고별 집계 | ⭐⭐ | 쉬움 | 10~100광고 | 10~30ms | 관리자+수강생 |
| **10** | 콘텐츠 카운트 | ⭐ | 쉬움 | 100~500건 | <10ms | 관리자 |
| **11** | 기수 중복제거 | ⭐ | 쉬움 | 30건 | <5ms | 관리자 |

---

## 추천 구현 순서

### Phase 1: 크론 파이프라인 확장 (핵심 3개)
1. **T3 점수 사전계산** — collect-daily 크론 후 자동 실행
   - 신규 테이블: `t3_scores_precomputed`
   - 계정별 × 기간별(7/30/90일) × 크리에이티브별
   - 프론트: DB 조회만 (계산 제거)

2. **수강생 성과 사전계산** — collect-daily 크론 후 자동 실행
   - 신규 테이블: `student_performance_daily`
   - 수강생별 spend/revenue/roas/t3_score/t3_grade
   - 프론트: 단순 SELECT (루프+T3 계산 제거)

3. **광고 진단 사전계산** — collect-daily 크론 후 자동 실행
   - 신규 테이블: `ad_diagnosis_cache`
   - 계정별 상위 광고 진단 결과 저장
   - 프론트: JSON 로드만

### Phase 2: 집계 캐시 (보조 4개)
4. **대시보드 통계 캐시** — Supabase Materialized View 또는 통계 테이블
5. **이메일 캠페인 통계** — 발송/열람 이벤트 시 증분 업데이트
6. **지식관리 일별 통계** — usage INSERT 트리거
7. **계정 동기화 상태** — collect-daily 완료 시 기록

### Phase 3: 클라이언트 최적화 (3개)
8. **Summary Cards** — T3 사전계산과 함께 저장
9. **광고별 집계 뷰** — DB 레벨 ad_id 그룹화
10. **콘텐츠/기수** — DB 쿼리 최적화 (DISTINCT, GROUP BY)

---

## 예상 총 효과

| 항목 | 현재 | 사전계산 후 |
|------|------|-----------|
| T3 대시보드 로드 | 200~500ms | <50ms |
| 수강생 성과 페이지 | 1~3s | <100ms |
| 진단 탭 로드 | 100~200ms | <30ms |
| Admin 대시보드 | 80~150ms | <30ms |
| 전체 UX | 지표 전환마다 로딩 | 즉시 표시 |

---

## 주의사항

1. **데이터 신선도**: 사전계산 데이터는 크론 주기만큼 지연됨 (일 1회). "마지막 계산 시각" 표시 필요
2. **기간 선택**: 사용자가 임의 기간을 선택하면 사전계산 미스 발생 → 폴백으로 실시간 계산 유지
3. **벤치마크 갱신**: 주간 벤치마크가 바뀌면 T3 점수도 재계산 필요
4. **저장 용량**: 계정 20개 × 기간 3종 × 크리에이티브 4종 = 240행/일 (미미)
5. **마이그레이션**: 기존 API 엔드포인트 유지, 사전계산 테이블 우선 조회 → 없으면 실시간 폴백
