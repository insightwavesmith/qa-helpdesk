# 온보딩 프로필 필수값 강제 (T3) Plan

## 요구사항
온보딩 Step 1(프로필 정보 확인)에서 브랜드명, 쇼핑몰 URL, 연매출, 월 광고예산 4개 필드를 필수로 강제한다.
현재는 `!name.trim() || !isCategoryValid`만 체크하여 4개 필드가 빈 채로 저장 가능하다.

## 범위
- **파일**: `src/app/(auth)/onboarding/page.tsx` — `StepProfile` 컴포넌트 (수정만)
- **의존**: 없음 (기존 onboarding-ui 완료 상태에서 필수값만 추가)
- **제외**: 온보딩 전체 흐름(Step 구조) 변경 금지, 새 UI 컴포넌트 추가 금지 — 기존 스타일로 에러 텍스트만 추가

## 현재 문제점
1. submit 버튼 disabled 조건: `!name.trim() || !isCategoryValid`만 체크
2. `shopName` (브랜드명): 빈 채로 저장 가능
3. `shopUrl` (쇼핑몰 URL): 빈 채로 저장 가능
4. `annualRevenue` (연매출): 선택 안 해도 저장 가능
5. `monthlyAdBudget` (월 광고예산): 선택 안 해도 저장 가능

## 기대 동작
1. 4개 필드 모두 필수:
   - 브랜드명: 빈값 불가
   - 쇼핑몰 URL: 빈값 불가
   - 연매출: 선택 안 하면 불가
   - 월 광고예산: 선택 안 하면 불가
2. submit 버튼 disabled 조건에 4개 필드 빈값 체크 추가
3. 미입력 필드에 빨간색 "필수 항목입니다" 텍스트 (submit 시도 시 또는 blur 시)
4. 기존 스타일 유지 (빨간 텍스트, 기존 input/select 스타일 그대로)

## 성공 기준
1. 4개 필드 중 하나라도 빈값이면 submit 버튼 disabled
2. submit 시도 시 빈 필드 아래에 "필수 항목입니다" 에러 메시지 표시
3. 모든 필드 입력 후 정상 제출 가능
4. 온보딩 전체 흐름(Step 0~3) 무변경
5. 기존 UI 스타일 유지 (새 컴포넌트 없음)
6. `npm run build` 성공

## 충돌 방지
- `onboarding-ui` design: 기존 Step 1 구조 보존 (name, shopName, shopUrl, annualRevenue, monthlyAdBudget, category)
- `signup-refactor` (implementing): onboarding과 직접 관련 없음 (signup → onboarding redirect만)
