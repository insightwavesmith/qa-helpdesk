# 사전계산 Phase 1 — 크론 후 자동 계산 + DB 캐시 + 폴백

## 개요
collect-daily 크론 완료 후 T3 점수 / 수강생 성과 / 광고 진단을 자동 사전계산하여 DB에 저장.
프론트에서는 사전계산 테이블 우선 조회, 없으면 기존 실시간 계산으로 폴백.

## 배경
- T3 대시보드: 1K~50K행 루프 → 100~300ms/요청
- 수강생 성과: 수만 행 for 루프 + T3 계산 → 500ms~2s/요청
- 광고 진단: 1000행 → 5개 광고 × 12판정 → 50~150ms/요청
- 사전계산 후 예상: T3 <50ms, 성과 <100ms, 진단 <30ms

## 범위

### T1. T3 점수 사전계산
- collect-daily 크론 완료 후 전 계정의 T3 점수 자동 계산
- 기간별(7/30/90일) × 크리에이티브별(ALL/VIDEO/IMAGE/CATALOG)
- `t3_scores_precomputed` 테이블 신설
- `/api/protractor/total-value` route에서 사전계산 우선 조회 + 폴백

### T2. 수강생 성과 사전계산
- collect-daily 크론 완료 후 전 수강생 성과 일괄 계산
- `student_performance_daily` 테이블 신설
- `performance.ts` 서버액션에서 사전계산 우선 조회 + 폴백

### T3. 광고 진단 사전계산
- collect-daily 크론 완료 후 계정별 상위 5개 광고 진단
- `ad_diagnosis_cache` 테이블 신설
- `/api/diagnose` route에서 캐시 우선 조회 + 폴백

## 성공 기준
- [ ] 3개 신규 테이블 생성 (마이그레이션 SQL)
- [ ] collect-daily 크론 완료 후 사전계산 자동 실행
- [ ] 각 API/액션에서 사전계산 데이터 우선 조회
- [ ] 사전계산 비어있으면 기존 실시간 계산 폴백 (동작 100% 동일)
- [ ] `npm run build` 성공
- [ ] 기존 UI 점수/등급 동일 표시

## 하지 말 것
- 기존 t3-engine.ts / diagnosis/engine.ts 계산 로직 변경
- 기존 API route 삭제
- 프론트 UI 레이아웃 변경
- 수강생 프로필/역할 로직 변경

## 신규 파일
- `supabase/migrations/20260311_precompute_tables.sql`
- `src/lib/precompute/t3-precompute.ts`
- `src/lib/precompute/performance-precompute.ts`
- `src/lib/precompute/diagnosis-precompute.ts`
- `src/lib/precompute/index.ts` (크론 연결용 오케스트레이터)

## 수정 파일 (최소 변경)
- `src/app/api/cron/collect-daily/route.ts` — 크론 완료 후 사전계산 호출 1줄 추가
- `src/app/api/protractor/total-value/route.ts` — 사전계산 조회 + 폴백 분기
- `src/actions/performance.ts` — 사전계산 조회 + 폴백 분기
- `src/app/api/diagnose/route.ts` — 캐시 조회 + 폴백 분기
- `src/types/database.ts` — 3개 테이블 타입 추가
