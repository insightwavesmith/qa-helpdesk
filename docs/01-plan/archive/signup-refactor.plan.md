# 가입 폼 리팩토링 (T1) Plan

## 요구사항
- 초대코드 입력 필드 추가 (폼 최상단, 선택사항)
- 초대코드 유효 시 student 모드 (전체 사업정보 폼), 무효/없음 시 lead 모드 (간소화 폼)
- signUp() options.data에 invite_code 포함 (student 모드일 때만)
- 가입 후 리다이렉트: student -> /onboarding, lead -> /dashboard

## 범위
- 파일: `src/app/(auth)/signup/page.tsx` (수정)
- 의존: T0 (DB 마이그레이션), T2 (초대코드 검증 API — POST /api/invite/validate)

## 성공 기준
1. 초대코드 입력 + 검증 버튼 동작
2. student 모드: 전체 폼 (이메일, 비밀번호, 이름, 전화번호, 쇼핑몰명, 쇼핑몰URL, 사업자등록번호, 사업자등록증)
3. lead 모드: 간소화 폼 (이메일, 비밀번호+확인, 이름만)
4. 기존 스타일 유지 (#F75D5D, 카드 레이아웃)
5. npm run build 성공
