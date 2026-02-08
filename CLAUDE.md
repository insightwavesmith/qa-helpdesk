# CLAUDE.md — 프로젝트 규칙 (에이전트팀 필수 읽기)

## 절대 규칙
1. **코드 품질**: lint 에러 0개 유지. `npm run build` 반드시 성공.
2. **한국어 UI**: 모든 사용자 노출 텍스트는 한국어. 영어 라벨 금지.
3. **기존 파일 최소 변경**: 신규 파일 추가 선호. 기존 파일 대폭 수정 지양.
4. **디자인 시스템**: Primary `#F75D5D`, hover `#E54949`, Pretendard 폰트, 라이트 모드만.
5. **DB 안전**: RLS 정책 필수. SECURITY DEFINER → SET search_path = public. 변수명 테이블/타입과 겹치지 않게.

## 에이전트팀 운영
- 이 프로젝트는 **상시 에이전트팀**으로 운영됨
- Leader는 delegate 모드 — 코드 직접 작성 금지, 조율만
- 모든 구현은 plan approval 후에만 진행
- TASK.md를 읽고 작업 분배 (의존성 순서 준수)
- 완료 후: `openclaw gateway wake --text 'Done' --mode now`

## 플러그인 (설치 완료 2026-02-08)
- **Compound Engineering** (v2.30.0) — every-marketplace
  - `/workflows:review` — 멀티 리뷰 (보안/성능/아키텍처)
  - `/workflows:compound` — 작업 후 교훈 문서화
  - `/workflows:plan` — 구조화된 계획
- **Conductor** (v0.1.0) — claude-conductor
  - `/conductor:setup` — 프로젝트 컨텍스트 설정
  - `/conductor:new-track` — 새 작업 트랙
  - `/conductor:implement` — 구현 실행
  - `/conductor:status` — 상태 확인

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
