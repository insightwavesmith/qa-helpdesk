# T8. 과거데이터 수동 수집 기능 — Plan

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 개요

- **기능**: 어드민 페이지에서 특정 광고계정의 과거 N일 데이터를 수동으로 수집(백필)하는 UI + API
- **해결하려는 문제**: `collect-daily` 크론은 당일/전일만 수집. 신규 계정 등록 시 과거 데이터 없음.
- **위치**: `/admin/protractor` 페이지 내 신규 섹션

## 2. 현재 상태 분석

### 기존 collect-daily 분석
- `/api/cron/collect-daily` — 전체 계정 대상, `targetDate` 파라미터 지원
- `fetchAccountAds(accountId, targetDate)` — 특정 날짜 Meta API 호출 지원
- **재활용 가능**: `targetDate` 파라미터를 활용하면 일별 과거 데이터 수집 가능

### 기존 어드민 수동 수집 버튼 (`recollect-buttons.tsx`)
- 버튼 4개: 벤치마크/광고데이터/매출데이터/타겟중복 재수집
- 전체 계정 대상, 기간 선택 없음

## 3. 핵심 요구사항

### 기능적 요구사항
- FR-01: 계정 선택 드롭다운 (기존 ad_accounts에서 조회)
- FR-02: 기간 선택 (7일 / 30일 / 90일)
- FR-03: "수동 수집" 버튼 클릭 시 API 호출
- FR-04: 1계정씩 순차 처리 (동시 수집 금지)
- FR-05: 수집 중 진행 상태 표시 ("수집 중... 15/30일")
- FR-06: 완료 시 "30일 데이터 수집 완료" 토스트

### 비기능적 요구사항
- 기존 `collect-daily` 크론 로직 변경 금지
- 여러 계정 동시 수집 금지 (Meta API rate limit)
- 벤치마크 재계산은 이 TASK 범위 밖

## 4. 범위

### 포함
- 신규 API: `POST /api/admin/backfill` — SSE 스트리밍으로 진행 상태 전송
- 신규 컴포넌트: `BackfillSection.tsx` — UI (계정/기간 선택 + 진행 상태)
- `/admin/protractor/page.tsx` — BackfillSection 추가

### 제외
- `collect-daily` 크론 로직 변경 금지
- 벤치마크 재계산 API
- 복수 계정 동시 수집
- Mixpanel 백필 (이 TASK 범위 밖)

## 5. 성공 기준

- [ ] 어드민 페이지에서 계정 선택 + 기간 선택이 가능하다
- [ ] "수동 수집" 버튼 클릭 시 API가 호출된다
- [ ] 수집 중 "N/M일 수집 중..." 진행 상태가 실시간 표시된다
- [ ] 완료 시 "30일 데이터 수집 완료" 토스트가 표시된다
- [ ] 수집 중 버튼 비활성화로 동시 실행 방지
- [ ] `npm run build` 성공

## 6. 실행 순서

1. `BackfillSection.tsx` 컴포넌트 신규 작성
2. `POST /api/admin/backfill/route.ts` 신규 작성 (SSE 스트리밍)
3. `admin/protractor/page.tsx`에 BackfillSection 추가
4. 빌드 + 기능 검증
