# CLAUDE.md — 프로젝트 규칙 (에이전트팀 필수 읽기)

## 절대 규칙
1. **코드 품질**: lint 에러 0개 유지. `npm run build` 반드시 성공.
2. **한국어 UI**: 모든 사용자 노출 텍스트는 한국어. 영어 라벨 금지.
3. **기존 파일 최소 변경**: 신규 파일 추가 선호. 기존 파일 대폭 수정 지양.
4. **디자인 시스템**: Primary `#F75D5D`, hover `#E54949`, Pretendard 폰트, 라이트 모드만.
5. **DB 안전**: RLS 정책 필수. SECURITY DEFINER → SET search_path = public. 변수명 테이블/타입과 겹치지 않게.

## 작업 완료 기준
- [ ] `npm run build` 성공
- [ ] lint 에러 0개
- [ ] 타입 에러 0개
- [ ] 기존 기능 깨지지 않음 확인

## 기술 스택
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- TipTap (에디터)

## 커밋 컨벤션
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- style: UI/스타일
- chore: 설정/빌드
