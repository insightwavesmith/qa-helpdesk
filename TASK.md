# Phase 2: 콘텐츠 허브 UI + 배포 연동

설계 문서: `docs/02-design/P2-content-hub-ui.md`
아키텍처: `docs/02-design/content-hub-architecture.md`

## 선행 완료
- DB 테이블: contents, distributions, email_logs (이미 생성됨)
- 서버 액션: `src/actions/contents.ts` (CRUD + publishToPost + generateNewsletterFromContents)
- 타입: `src/types/database.ts` (contents, distributions, email_logs 포함)
- 타입: `src/types/content.ts` (Content, Distribution, ChannelAdapter 등)

## 에이전트팀 구성
- **frontend-dev 1명**: 콘텐츠 관리 페이지 + 콘텐츠 선택 모달 + 사이드바 수정
- **frontend-dev 1명**: 뉴스레터 템플릿 리디자인 + 이메일 페이지 수정

## 태스크

### Task 1: 콘텐츠 관리 페이지 (frontend-dev A)
**새 파일**: `src/app/(main)/admin/content/page.tsx`
- "use client" 페이지
- 상단: "콘텐츠 관리" h1 + "동기화" 버튼 (향후용, disabled) + 콘텐츠 수 카드 4개 (전체/초안/검수대기/발행가능)
- 필터: 카테고리 Select (전체/blueprint/trend/insight/general) + 상태 Select (전체/draft/review/ready/archived)
- 테이블: 제목 | 카테고리(Badge) | 상태(Badge, 색상별) | 작성일
- 행 클릭 → 편집 Dialog 열림
- 서버 액션 사용: `getContents`, `updateContent`, `deleteContent`, `publishToPost`
- **반드시 기존 디자인 시스템 따르기**: shadcn/ui 컴포넌트, #F75D5D 프라이머리, Pretendard 폰트
- 상태 배지 색상: draft=gray, review=yellow, ready=green, archived=slate

### Task 2: 콘텐츠 편집 Dialog (frontend-dev A)
**새 파일**: `src/components/content/content-editor-dialog.tsx`
- Dialog 컴포넌트 (shadcn/ui Dialog)
- 제목 Input, 본문 Textarea (큰 사이즈), 카테고리 Select, 태그 Input (콤마 구분)
- 상태 Select (draft/review/ready/archived)
- "저장" 버튼 → updateContent
- "정보공유에 게시" 버튼 (ready 상태일 때만 활성) → publishToPost → toast 알림
- "삭제" 버튼 → confirm → deleteContent

### Task 3: 사이드바에 콘텐츠 관리 메뉴 추가 (frontend-dev A)
**수정 파일**: `src/components/dashboard/Sidebar.tsx`
- 관리 섹션에 "콘텐츠 관리" 추가 (이메일 발송 위)
- 아이콘: `FileText` from lucide-react
- 경로: `/admin/content`
- **기존 메뉴 순서/구조 변경 최소화**

### Task 4: 이메일 페이지에 콘텐츠 가져오기 기능 (frontend-dev B)
**수정 파일**: `src/app/(main)/admin/email/page.tsx`
**새 파일**: `src/components/content/content-picker-dialog.tsx`

콘텐츠 선택 모달:
- ready 상태 콘텐츠 목록 (체크박스로 다중 선택)
- 카테고리 필터
- 선택 후 "가져오기" 버튼 → `generateNewsletterFromContents(selectedIds)` 호출
- 결과 HTML → 부모의 setHtml + setSubject에 전달

이메일 페이지 수정:
- 뉴스레터 템플릿 선택 시 "콘텐츠에서 가져오기" 버튼 추가 (AI 자동작성 버튼 옆)
- 기존 AI 자동작성은 그대로 유지

### Task 5: 뉴스레터 템플릿 리디자인 (frontend-dev B)
**수정 파일**: `src/emails/newsletter.tsx`

현재 react-email 기본 스타일 → beehiiv/Flodesk 수준으로 업그레이드:
- **헤더**: 흰 배경, "BS CAMP" 텍스트 로고 (coral red #F75D5D), 하단에 얇은 coral 라인
- **본문**: 카드형 섹션 (흰 배경 + 얇은 border + 8px 라운드)
- **CTA 버튼**: coral red 배경 (#F75D5D), 흰 텍스트, 큰 패딩 (16px 40px), 라운드
- **푸터**: 회색 배경, 자사몰사관학교 정보, "수신거부" 링크
- **전체**: max-width 600px, 넉넉한 여백 (section 간 24px), 시스템 폰트 스택
- react-email 컴포넌트 사용: `<Html>`, `<Body>`, `<Container>`, `<Section>`, `<Text>`, `<Button>`, `<Hr>`
- **기존 props 인터페이스 유지** (bodyHtml 등 — 하위 호환)

## 공통 규칙
- shadcn/ui 컴포넌트 사용 (import from `@/components/ui/`)
- 프라이머리 색상: #F75D5D (hover: #E54949)
- 한국어 UI
- 이모지 사용 안 함
- `npm run lint` 에러 0개
- `npm run build` 성공

## 완료 후
1. `npm run lint` 확인
2. `npm run build` 확인
3. `git add -A && git commit -m "feat: 콘텐츠 허브 UI + 뉴스레터 리디자인 (Phase 2)" && git push`
4. `openclaw gateway wake --text "Done: Phase 2 콘텐츠 허브 UI 완료"`
