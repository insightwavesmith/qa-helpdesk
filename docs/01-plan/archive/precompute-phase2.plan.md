# 사전계산 Phase 2 — 집계 캐시 4개

## 개요
관리자 대시보드 통계, 이메일 캠페인 분석, 지식관리 일별 통계, 계정 동기화 상태를 사전계산/캐시하여 어드민 페이지 로드 속도를 개선한다.

## 배경
- Phase 1 (T3/성과/진단) 완료 후 나머지 Tier 2 영역
- Admin 대시보드 6개 COUNT 쿼리 → 1회 캐시 조회로 통합
- 이메일 분석 1000건 루프 → 집계 테이블 조회
- 지식관리 500건 reduce → 일별 집계 테이블 조회
- 계정 상태 → collect-daily 완료 시 자동 기록

## 범위

### 1. 대시보드 통계 캐시
- 현재: `getDashboardStats()` — COUNT 6개 병렬, `getWeeklyQuestionStats()` — 28일 질문 그룹화
- 방안: `dashboard_stats_cache(stat_key TEXT, value JSONB, updated_at)` 테이블
- 갱신: 1시간 주기 또는 질문/답변/콘텐츠 변경 시

### 2. 이메일 캠페인 통계
- 현재: `GET /api/admin/email/analytics` — email_sends 1000건 Map 집계
- 방안: `email_campaign_stats(subject, recipients, opens, clicks, ...)` 테이블
- 갱신: 이메일 발송/열람 이벤트 시 증분 업데이트 또는 주기적 일괄 계산

### 3. 지식관리 일별 통계
- 현재: `/admin/knowledge` 클라이언트에서 usageData reduce 3회
- 방안: `knowledge_daily_stats(date, total_cost, avg_duration_ms, consumer_counts)` 테이블
- 갱신: 일별 집계 크론

### 4. 계정 동기화 상태
- 현재: `GET /api/admin/protractor/status` — ad_accounts + daily_ad_insights 3일 조회 + mixpanel 조회
- 방안: `account_sync_status(account_id, meta_ok, meta_last_date, ...)` 테이블
- 갱신: collect-daily 크론 완료 시

## 성공 기준
- [ ] 4개 신규 테이블 생성 (마이그레이션 SQL)
- [ ] 각 기존 엔드포인트: 사전계산 우선 → 없으면 기존 로직 폴백
- [ ] `tsc --noEmit` 에러 0
- [ ] `npm run build` 성공
- [ ] "마지막 계산 시각" 정보 포함 (데이터 신선도)

## 하지 말 것
- 기존 getDashboardStats / getWeeklyQuestionStats 함수 삭제
- 기존 email analytics route 삭제
- 기존 knowledge page 클라이언트 로직 대폭 변경
- 기존 protractor status route 삭제
- 프론트 UI 레이아웃 변경

## 신규 파일
- `supabase/migrations/20260312_precompute_phase2.sql`
- `src/lib/precompute/dashboard-precompute.ts`
- `src/lib/precompute/email-precompute.ts`
- `src/lib/precompute/knowledge-precompute.ts`
- `src/lib/precompute/sync-status-precompute.ts`

## 수정 파일 (최소 변경)
- `src/lib/precompute/index.ts` — 4개 모듈 추가 호출
- `src/actions/admin.ts` — getDashboardStats에 캐시 조회 + 폴백
- `src/app/api/admin/email/analytics/route.ts` — 캐시 조회 + 폴백
- `src/app/api/admin/knowledge/stats/route.ts` — 서버에서 집계 데이터 반환 시 캐시 우선
- `src/app/api/admin/protractor/status/route.ts` — 캐시 조회 + 폴백
- `src/types/database.ts` — 4개 테이블 타입 추가
