# TASK: 총가치각도기 개선 + 인프라 정비

> Plan 인터뷰 스킵

## T1. 노출당구매확률 벤치마크 추가

현재 reach_to_purchase_rate(노출당구매확률)는 벤치마크 비교 없이 값만 표시됨.
전환율 순위(conversion_rate_ranking)가 ABOVE_AVERAGE인 데이터의 평균으로 벤치마크를 만든다.

- **DB**: benchmarks 테이블에 `avg_reach_to_purchase_rate` 컬럼 추가
- **collect-benchmarks**: ad_insights_classified에서 reach_to_purchase_rate 계산 → benchmarks에 저장
  - 분류 기준: conversion_rate_ranking = ABOVE_AVERAGE
  - 계산식: purchases / impressions × 100 (분모 = impressions, reach 아님)
- **총가치각도기 UI**: 노출당구매확률에도 🟢🟡🔴 벤치마크 비교 표시
- **파일**: 
  - src/app/api/cron/collect-benchmarks/route.ts
  - src/app/api/protractor/benchmarks/route.ts (매핑 추가)
  - benchmarks 관련 UI 컴포넌트

## T2. 수강생 성과 탭 카드 UI 축소

현재 6개 카드가 너무 크게 표시됨 → 컴팩트하게 축소.

- **현재**: 카드 6개가 화면에 2~3개만 보임
- **변경**: 카드 크기 축소, 한 화면에 6개 다 보이게
  - 패딩/마진 줄이기
  - 폰트 사이즈 축소
  - 그리드 레이아웃 조정 (2열 → 3열 또는 카드 높이 줄이기)
- **파일**: 수강생 성과 페이지 컴포넌트 (정확한 파일 리뷰 시 확인)

## 모찌 직접 작업 (인프라, 코드 변경 아님)

### E1. 모찌리포트 Vercel 비밀번호 보호

- Vercel API로 mozzi-reports 프로젝트에 비밀번호 보호 설정
- URL 접근 시 비밀번호 입력 필요하게

### E2. 개발 프로세스 hook + 알림 점검

- Notification(idle_prompt) hook 실제 작동 검증
- agent-send.sh 스크립트 작동 검증
- notify-task.sh / notify-stop.sh 알림 정상 수신 확인
- 에이전트팀 완료 → 모찌 자동 확인 → Smith님 보고 흐름 검증

## 완료 기준

- [ ] T1: 노출당구매확률에 벤치마크 비교 🟢🟡🔴 표시
- [ ] T2: 수강생 성과 탭 6개 카드 한 화면에 보임
- [ ] E1: mozzi-reports 비밀번호 없이 접근 불가
- [ ] E2: 에이전트팀 task 완료 시 알림 정상 수신

## 리뷰 결과
- T1: DB 컬럼 추가만 필요 (코드는 이미 구현됨). 목업 불필요.
- T2: CSS 축소 변경. 기존 컴포넌트 수정.
