# 크론 수집 안정화 Plan

> 작성: 2026-03-01

## 배경
- 크론(collect-daily, collect-mixpanel, collect-benchmarks)이 실패해도 console.error만 찍힘
- 실행 이력이 저장되지 않아 2/6~2/25 20일 공백 발생 시 아무도 몰랐음
- collect-daily에 재시도 로직 없음 (Meta API 실패 → 영구 누락)
- collect-benchmarks 스케줄 주석이 실제와 불일치

## 범위
- A1: cron_runs 테이블 + /api/cron/health 엔드포인트
- A2: collect-daily 재시도 로직 (최대 2회, 429 Retry-After 존중)
- A3: collect-benchmarks 스케줄 주석 수정

## 범위 외
- 외부 알림 서비스 연동 (슬랙 등)
- collect-mixpanel/collect-benchmarks 재시도 (이미 있음)
- 기존 크론 로직 변경

## 성공 기준
1. 크론 실행 시 cron_runs에 이력이 기록됨 (started_at, finished_at, status, records_count)
2. /api/cron/health 호출 시 최근 24시간 실행 여부 확인 가능
3. collect-daily Meta API 실패 시 최대 2회 재시도 후 partial 기록
4. collect-benchmarks 주석이 실제 스케줄과 일치
5. npm run build 성공
