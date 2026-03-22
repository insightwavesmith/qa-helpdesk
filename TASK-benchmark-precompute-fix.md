# TASK: 사전계산 벤치마크 2건 — 색상 판정 + IMAGE/CATALOG 정상화

## 이건 프론트 문제가 아님. 백엔드 사전계산 로직 문제야.

## 버그 1: 색상 판정 불일치
### 증상
- 구매전환율 0.00% / 벤치마크 10.72%인데 노랑(🟡) 표시 — 빨강이어야 함
- 결제시작율 3.08% / 벤치마크 16.29%인데 노랑(🟡) — 빨강이어야 함

### 원인
- 실시간 진단(`aggregate.ts`의 `bm()` 함수): 3단계 판정 — ≥100% 초록, ≥75% 노랑, <75% 빨강
- 사전계산(`diagnosis-precompute.ts` → `diagnoseAd()`): 판정 로직이 다름
- 캐시(`ad_diagnosis_cache`)에 저장된 verdict가 `bm()` 로직과 동기화 안 됨

### 해야 할 것
1. `src/lib/diagnosis.ts`의 `diagnoseAd()` verdict 판정 로직 확인
2. `src/lib/protractor/aggregate.ts`의 `bm()` 3단계 로직과 비교
3. 두 로직을 일치시킴 — 하나의 공통 함수로 만들든, 캐시 저장 시 `bm()` 로직으로 재판정하든
4. 0% 값은 명확히 빨강으로 판정

## 버그 2: IMAGE/CATALOG 벤치마크 "데이터 없음"
### 증상
- 벤치마크 관리 → 이미지 탭: "해당 크리에이티브 타입 데이터 없음"
- 카탈로그 탭: "해당 크리에이티브 타입 데이터 없음"
- 영상 탭: 정상 표시

### DB 상태 (정상)
- IMAGE: 11건, CATALOG: 9건 — benchmarks 테이블에 있음
- ranking_type: quality/engagement/conversion 다 있음

### 원인 추정
- `diagnosis-precompute.ts`에서 `ranking_group: ABOVE_AVERAGE`만 조회
- 프론트에서 IMAGE/CATALOG 조회 시 다른 조건으로 필터링해서 매칭 실패
- 또는 사전계산 시 creative_type 매칭 로직 문제

### 해야 할 것
1. 프론트에서 이미지/카탈로그 벤치마크를 어떤 API로 조회하는지 확인
2. 해당 API가 DB에서 어떤 조건으로 SELECT하는지 확인
3. DB에 있는 IMAGE/CATALOG 데이터가 프론트 조건과 매칭되는지 확인
4. 매칭 안 되는 원인 수정

## 확인할 파일
- `src/lib/diagnosis.ts` — diagnoseAd() verdict 판정
- `src/lib/protractor/aggregate.ts` — bm() 3단계 판정
- `src/lib/precompute/diagnosis-precompute.ts` — 사전계산 로직
- `src/app/api/diagnose/route.ts` — 진단 API
- `src/app/(main)/protractor/` — 벤치마크 관리 UI (이미지/카탈로그 탭)
- `scripts/precompute-scores.mjs` — 수동 캐시 재생성

## 완료 조건
1. 0% 값 → 빨강 표시
2. 벤치마크 75% 미만 → 빨강 (실시간과 동일)
3. 이미지/카탈로그 탭에서 벤치마크 데이터 정상 표시
4. 전체 캐시 재생성 실행
5. `tsc --noEmit` + `next lint` + `next build` 통과
