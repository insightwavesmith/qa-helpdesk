# TASK: 비밀번호 재설정 리다이렉트 수정

## 문제
비밀번호 재설정 메일의 "재설정하기" 버튼 클릭 시 `/reset-password` 페이지가 아닌 로그인 페이지로 감.

## 원인
코드에서 `NEXT_PUBLIC_SITE_URL` 환경변수가 없을 때 fallback이 `qa-helpdesk.vercel.app`(삭제된 프로젝트)으로 돼있음.

## 요구사항

### 1. fallback URL 수정
- `src/app/(auth)/forgot-password/page.tsx`의 fallback: `qa-helpdesk.vercel.app` → `bscamp.vercel.app`
- 프로젝트 전체에서 `qa-helpdesk.vercel.app` 문자열 검색 → 전부 `bscamp.vercel.app`으로 변경

### 2. reset-password 페이지 동작 확인
- `src/app/(auth)/reset-password/page.tsx` 존재 확인
- Supabase recovery flow: 이메일 링크 → `/api/auth/callback` → `/reset-password`로 리다이렉트
- auth callback route가 정상 동작하는지 코드 확인

### 3. signup 페이지도 동일 이슈 확인
- 회원가입 확인 메일의 redirect URL도 동일 패턴이면 함께 수정

## 빌드 검증 + 커밋 + 푸시
- `npm run build` 통과
- 커밋 메시지: `fix: 비밀번호 재설정 리다이렉트 — qa-helpdesk → bscamp URL 수정`
- main 브랜치에 푸시
