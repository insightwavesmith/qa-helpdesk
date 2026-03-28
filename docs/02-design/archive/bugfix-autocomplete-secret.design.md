# 버그수정: 자동완성 방지 + 시크릿키 마스킹 설계서

## 1. 데이터 모델
변경 없음.

## 2. API 설계
변경 없음.

## 3. 컴포넌트 구조

### T1. member-detail-modal.tsx — 자동완성 방지
수정 대상 input 목록 (광고계정 수정/추가 폼):

| 폼 | 필드 | name 속성 | autoComplete |
|-----|------|-----------|--------------|
| 수정 | account_name | edit-account-name | off |
| 수정 | mixpanel_project_id | edit-mixpanel-project-id | off |
| 수정 | mixpanel_board_id | edit-mixpanel-board-id | off |
| 수정 | mixpanel_secret_key | edit-mixpanel-secret-key | new-password |
| 추가 | account_id | new-account-id | off |
| 추가 | account_name | new-account-name | off |
| 추가 | mixpanel_project_id | new-mixpanel-project-id | off |
| 추가 | mixpanel_board_id | new-mixpanel-board-id | off |
| 추가 | mixpanel_secret_key | new-mixpanel-secret-key | new-password |

### T2. onboarding/page.tsx — 시크릿키 마스킹
- lucide-react에서 `Eye`, `EyeOff` 추가 import
- StepAdAccount 컴포넌트에 `showSecretKey` state 추가
- input type: "text" → `{showSecretKey ? "text" : "password"}`
- 레퍼런스 패턴: `settings-form.tsx`의 relative positioned button + Eye/EyeOff 아이콘

## 4. 에러 처리
변경 없음.

## 5. 구현 순서
- [x] Plan 작성
- [x] Design 작성
- [ ] T1 구현 (frontend-dev)
- [ ] T2 구현 (frontend-dev)
- [ ] npm run build 확인
- [ ] Gap 분석
