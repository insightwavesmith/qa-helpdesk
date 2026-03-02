# A3. 데일리콜랙트 overlap 제거 — Plan

> 작성: 2026-03-02

## 1. 개요
- **기능**: collect-daily 크론에서 overlap 수집 코드 전부 제거하여 광고 데이터 수집만 유지
- **해결하려는 문제**: overlap pair별 순차 Meta API 호출(최대 28쌍)로 인해 Vercel 300초 maxDuration 타임아웃 발생. 광고 데이터 수집과 overlap 수집을 분리하여 크론 안정성 확보.
- **선행 작업**: cron-stabilization (cron_runs 로깅 + 재시도) — implementing 상태

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: collect-daily = 광고 데이터 수집만 (Meta insights → daily_ad_insights upsert)
- FR-02: overlap 관련 코드 전부 제거
  - `fetchActiveAdsets`, `fetchCombinedReach`, `makePairKey` dynamic import
  - 개별 reach 조회 + pair 계산 로직
  - `daily_overlap_insights` upsert
  - `accountResult.overlap_rate` 할당
- FR-03: 기존 overlap 데이터(DB `daily_overlap_insights` 테이블)는 유지
- FR-04: cron_runs 이력 기록은 정상 동작 유지

### 비기능적 요구사항
- overlap DB 테이블/데이터 삭제 금지
- 프론트엔드 overlap 표시 UI 변경 금지
- on-demand overlap API (`/api/protractor/overlap`) 수정 금지
- collect-mixpanel, collect-benchmarks 수정 금지

## 3. 범위

### 포함
- `src/app/api/cron/collect-daily/route.ts` — overlap 블록(약 lines 333~439) 삭제

### 제외
- `src/lib/protractor/overlap-utils.ts` — on-demand API에서 사용하므로 유지
- `src/app/api/protractor/overlap/route.ts` — 독립 API, 변경 없음
- `daily_overlap_insights` 테이블 — DB 데이터 유지
- `src/app/(main)/admin/protractor/recollect-buttons.tsx` — "타겟중복 재수집" 버튼은 on-demand API 호출이므로 무관
- collect-mixpanel, collect-benchmarks 크론

## 4. 성공 기준
- [ ] collect-daily 실행 시 광고 데이터만 수집 (overlap 로직 없음)
- [ ] `overlap-utils.ts`의 함수가 collect-daily에서 import되지 않음
- [ ] `daily_overlap_insights` 테이블 기존 데이터 보존
- [ ] on-demand overlap API(`/api/protractor/overlap`) 정상 동작
- [ ] cron_runs 로깅 정상 동작
- [ ] Vercel 타임아웃 위험 감소 (API 호출 수 대폭 감소)
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `collect-daily/route.ts`에서 overlap 블록 전체 삭제 (lines 333~439)
2. 삭제 후 남은 코드 정합성 확인 (hasPartialError, results 등 참조 무결)
3. 빌드 확인
