# TASK: 사전계산 Phase 2 — 집계 캐시 4개

## 무엇을 (What)
관리자 대시보드 통계, 이메일 캠페인 분석, 지식관리 일별 통계, 계정 동기화 상태를 사전계산/캐시하여 어드민 페이지 로드 속도를 개선한다.

## 왜 (Why)
- Phase 1 (T3/성과/진단) 완료 후 나머지 Tier 2 영역
- Admin 대시보드 6개 COUNT 쿼리 → 1회 캐시 조회로 통합
- 이메일 분석 1000건 루프 → 집계 테이블 조회
- 지식관리 500건 reduce → 일별 집계 테이블 조회
- 계정 상태 → collect-daily 완료 시 자동 기록

## 대상 4개

### 1. 대시보드 통계 캐시
- **현재**: `src/actions/admin.ts` (lines 230-310) — COUNT 쿼리 6개 병렬 + 28일 질문 그룹화
- **지연**: 30~80ms
- **방안**: `dashboard_stats_cache(stat_key TEXT, value JSONB, updated_at TIMESTAMPTZ)` 테이블
- **갱신**: 질문/답변/콘텐츠 변경 시 또는 1시간 주기

### 2. 이메일 캠페인 통계
- **현재**: `src/app/api/admin/email/analytics/route.ts` (lines 17-79) — email_sends 1000건 Map 집계
- **지연**: 20~60ms
- **방안**: `email_campaign_stats(subject, recipients INT, opens INT, clicks INT, open_rate NUMERIC, click_rate NUMERIC, updated_at)` 테이블
- **갱신**: 이메일 발송/열람 이벤트 시 증분 업데이트

### 3. 지식관리 일별 통계
- **현재**: `src/app/(main)/admin/knowledge/page.tsx` (lines 80-120) — knowledge_usage 500건 reduce 3회
- **지연**: 10~30ms (클라이언트)
- **방안**: `knowledge_daily_stats(date DATE, total_cost NUMERIC, avg_duration_ms INT, consumer_counts JSONB)` 테이블
- **갱신**: usage INSERT 시 트리거 또는 일별 집계

### 4. 계정 동기화 상태
- **현재**: `src/app/api/admin/protractor/status/route.ts` — ad_accounts + daily_ad_insights 최근 3일 조회
- **지연**: 20~50ms
- **방안**: collect-daily 크론 완료 시 계정별 상태 기록
- **갱신**: 크론 완료 이벤트

## 관련 파일
- `src/actions/admin.ts`
- `src/app/api/admin/email/analytics/route.ts`
- `src/app/(main)/admin/knowledge/page.tsx`
- `src/app/api/admin/protractor/status/route.ts`
- `docs/precompute-audit.md` (감사 문서)
- `supabase/migrations/` (마이그레이션)

## 검증 기준
1. 각 테이블 생성 + 초기 데이터 populate 확인
2. 기존 API 엔드포인트: 사전계산 테이블 우선 → 없으면 기존 로직 폴백
3. Admin 대시보드 전체 로드: 100ms 이하
4. `tsc --noEmit` 에러 없음
5. `next build` 성공
6. "마지막 계산 시각" UI 표시 (데이터 신선도)

## 패턴
- Phase 1과 동일: cache hit → 빠름 / cache miss → 기존 로직 폴백
- DB 마이그레이션은 `supabase/migrations/` 에 SQL 파일 생성
