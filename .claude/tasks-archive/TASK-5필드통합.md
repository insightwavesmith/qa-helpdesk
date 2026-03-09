# TASK: 5개 필드 데이터 관리 통합 + 상태 표시 수정

## 목표
광고계정 5개 필드(계정ID, 계정명, 프로젝트ID, 시크릿키, 보드ID)가 profiles와 ad_accounts에 중복 저장되고 있다. ad_accounts + service_secrets를 단일 소스로 통합하고, 상태 표시 로직을 정확하게 수정한다.

## 빌드/테스트
- `npm run build` 성공 필수
- 테스트: smith.kim@inwv.co / test1234!
- 확인 URL: https://bscamp.vercel.app

---

## T1. key_name 패턴 통일

### 현재 동작
- 저장 시: `secret_${accountId}` (save-secret, onboarding, admin 전부)
- 조회 시: status API만 `secret_act_${accountId}`로 조회
- 결과: Mixpanel 연동 상태가 항상 "미설정"으로 표시

### 기대 동작
- 저장/조회 모든 곳에서 key_name 패턴이 동일
- 기존 DB 데이터와 호환되는 패턴 사용

### 하지 말 것
- DB 마이그레이션으로 기존 key_name을 변경하지 말 것 (기존 데이터 깨짐 위험)

---

## T2. profiles 레거시 필드 정리

### 현재 동작
- profiles 테이블에 mixpanel_project_id, mixpanel_secret_key, mixpanel_board_id가 있음
- ad_accounts에도 동일 필드 존재
- 온보딩/설정에서 두 테이블에 동시 저장 중
- collect-mixpanel 크론이 service_secrets 우선, profiles.mixpanel_secret_key 폴백

### 기대 동작
- ad_accounts + service_secrets가 단일 소스 (Single Source of Truth)
- profiles의 mixpanel 필드에 더 이상 쓰지 않음 (읽기 폴백은 유지)
- 온보딩/설정 저장 시 profiles mixpanel 필드 쓰기 제거
- collect-mixpanel의 profiles 폴백은 당분간 유지 (기존 사용자 호환)

### 하지 말 것
- profiles 테이블에서 컬럼 삭제하지 말 것 (기존 데이터 유지)
- collect-mixpanel의 profiles 폴백을 아직 제거하지 말 것

---

## T3. Mixpanel 상태 표시 로직 수정

### 현재 동작
- status API에서 mixpanelOk가 항상 false (하드코딩)
- "미설정" 하나로만 표시

### 기대 동작
- **미연동** = 프로젝트ID 없음 or 매출 데이터(daily_mixpanel_insights) 수집 안 됨
- **보드없음** = 프로젝트ID 있고 매출 데이터 있지만 보드ID 없음
- **연동완료** = 프로젝트ID 있고 + 매출 데이터 있고 + 보드ID 있음

### 참고
- ad_accounts 테이블의 mixpanel_project_id, mixpanel_board_id 확인
- daily_mixpanel_insights에 해당 계정 데이터 존재 여부 확인

---

## T4. 온보딩 Step2에 광고계정명 추가

### 현재 동작
- 온보딩 Step2 폼에 account_name 입력란이 없음
- 계정명 없이 저장되어 각도기 헤더에 ID만 표시

### 기대 동작
- 온보딩 Step2에 "광고계정 이름" 입력란 추가
- 저장 시 ad_accounts.account_name에 반영

---

## T5. 수정 폼 5개 필드 노출 확인

### 현재 동작
- 설정 > 편집 폼에서 account_id가 수정 불가 상태로 안 보일 수 있음
- 5개 필드가 전부 표시되는지 불확실

### 기대 동작
- 편집 폼에 5개 필드 전부 표시
- account_id는 읽기전용으로 표시 (수정 불가)
- 시크릿키는 마스킹 표시, 빈칸이면 기존 값 유지

---

## 실행 순서
T1(key_name 통일) → T3(상태 표시) → T2(레거시 정리) → T4(온보딩) → T5(수정 폼)

## 하지 말 것
- DB 테이블 구조 변경 (컬럼 추가/삭제) 하지 말 것
- profiles 테이블 컬럼 삭제하지 말 것
- 각도기 페이지(total-value, diagnose, content-ranking) 건드리지 말 것
- 다른 사용자의 기존 데이터를 깨뜨리지 말 것

## 리뷰 결과
- T1: status/route.ts key_name `secret_act_` → `secret_` 패턴 통일 완료
- T2: onboarding.ts, admin.ts profiles mixpanel 쓰기 제거 완료
- T3: status API 3단계 상태(ok/no_board/not_configured) + 클라이언트 UI 반영 완료
- T4: 온보딩 Step2 광고계정 이름 입력란 추가 + saveAdAccount에 accountName 전달 완료
- T5: 설정 편집 폼에 Meta 계정 ID 읽기전용 필드 추가 완료
