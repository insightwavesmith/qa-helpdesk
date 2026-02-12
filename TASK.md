# TASK: BS CAMP → 자사몰사관학교 브랜딩 변경

## 목표
웹사이트 전체에서 "BS CAMP" 표기를 "자사몰사관학교"로 변경.
로고 옆 텍스트, 페이지 타이틀, 이메일 템플릿, 메타 태그 등 모든 곳.

## 범위
소스 파일 32개, 총 75곳 변경.

### T1: 이메일 템플릿 (17곳) — 우선순위 HIGH
- `src/lib/email-default-template.ts` (7곳)
- `src/lib/email-templates.ts` (5곳)
- `src/emails/newsletter.tsx` (5곳)
- `src/emails/performance-report.tsx` (4곳)
- `src/emails/webinar-invite.tsx` (2곳)
- `src/components/email/NewsletterInlineEditor.tsx` (4곳)
- `src/components/email/SendConfirmModal.tsx` (1곳)

### T2: 인증 페이지 (10곳)
- `src/app/(auth)/login/page.tsx` (2곳)
- `src/app/(auth)/signup/page.tsx` (2곳)
- `src/app/(auth)/subscribe/page.tsx` (2곳)
- `src/app/(auth)/unsubscribe/page.tsx` (4곳)
- `src/app/(auth)/pending/page.tsx` (2곳)

### T3: 레이아웃 & 사이드바 (7곳)
- `src/app/layout.tsx` (2곳) — HTML title, metadata
- `src/app/(main)/layout.tsx` (1곳)
- `src/components/layout/app-sidebar.tsx` (2곳)
- `src/components/layout/student-header.tsx` (2곳)
- `src/components/dashboard/Sidebar.tsx` (1곳)
- `src/components/dashboard/MobileSidebar.tsx` (1곳)

### T4: 콘텐츠 & 대시보드 (8곳)
- `src/app/(main)/posts/page.tsx` (1곳)
- `src/app/(main)/questions/questions-list-client.tsx` (1곳)
- `src/app/(main)/dashboard/member-dashboard.tsx` (1곳)
- `src/app/(main)/dashboard/student-home.tsx` (1곳)
- `src/app/(main)/admin/email/page.tsx` (1곳)
- `src/actions/contents.ts` (6곳) — 콘텐츠 기본값/AI 프롬프트

### T5: API & OG 이미지 (4곳)
- `src/app/api/og/route.tsx` (2곳) — OG 이미지 동적 생성
- `src/app/api/admin/email/send/route.ts` (2곳)
- `src/app/api/admin/email/ai-write/route.ts` (2곳)

### T6: CSS 주석 & 기타 (8곳)
- `src/app/globals.css` (5곳) — 주석만, 기능 영향 없음
- `e2e/auth.spec.ts` (1곳)
- `e2e/home.spec.ts` (1곳)
- `playwright.config.ts` (1곳)

## 변경 규칙
1. "BS CAMP" → "자사몰사관학교" (대부분)
2. "BS Camp" → "자사몰사관학교"
3. "bs camp" → "자사몰사관학교"
4. 로고 뱃지 텍스트 "BS CAMP" → "자사몰사관학교" (길어지므로 레이아웃 확인)
5. **로고 이미지(`10+`) 자체는 변경하지 않음** — 아이콘은 유지
6. metadata/title에서 "BS CAMP" → "자사몰사관학교"
7. 이메일 발신자명 등은 확인 후 변경
8. **sed 사용 금지 (한글 UTF-8 깨짐)** — python3 또는 직접 수정

## 완료 기준
- [ ] `grep -rn "BS CAMP\|BS Camp\|bs camp" --include="*.tsx" --include="*.ts" --include="*.css"` 결과 0건
- [ ] `npm run build` 성공
- [ ] 로컬에서 주요 페이지 렌더링 확인 (login, 대시보드, 이메일 미리보기)

## 주의
- sed로 한글 치환 금지 (UTF-8 깨짐) → python3 사용
- `.next/` 빌드 캐시는 무시 (빌드하면 자동 갱신)
- `public/` 하위 HTML 목업 파일은 이 태스크에서 제외 (별도 처리)
