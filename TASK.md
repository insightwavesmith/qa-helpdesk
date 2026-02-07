# TASK: P1-4 TipTap WYSIWYG 이메일 에디터

## 목표
기존 textarea HTML 직접 입력 → TipTap WYSIWYG 에디터로 교체.
스티비 수준의 이메일 편집 경험 제공.

## 설계 문서
`/Users/smith/.openclaw/workspace/projects/qa-knowledge-base/docs/02-design/P1-email-ai-autowrite.md`

## 현재 상태
- 이메일 발송 페이지: `src/app/(main)/admin/email/page.tsx`
- 기존 에디터: textarea에 HTML 직접 입력
- 템플릿 3가지: newsletter(HTML 수동), webinar(폼), performance(폼)
- 발송: Nodemailer SMTP, 50건 배치
- React Email 렌더링: `src/lib/email-renderer.ts`
- 이메일 템플릿: `src/emails/newsletter.tsx`, `webinar-invite.tsx`, `performance-report.tsx`

## 작업

### 1. TipTap 설치
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder @tiptap/extension-text-align @tiptap/extension-underline @tiptap/extension-color @tiptap/extension-text-style @tiptap/pm
```

### 2. TipTap 에디터 컴포넌트 (신규)
`src/components/email/tiptap-editor.tsx`

툴바:
- 텍스트: Bold, Italic, Underline, Strikethrough
- 헤딩: H1, H2, H3
- 리스트: Bullet, Ordered
- 정렬: Left, Center, Right
- 링크: URL 삽입/수정
- 이미지: URL로 이미지 삽입
- 구분선: Horizontal Rule
- 색상: 텍스트 색상 (primary #F75D5D 포함)

에디터 영역:
- 최소 높이 400px
- 플레이스홀더: "이메일 내용을 작성하세요..."
- 포커스 시 border highlight

### 3. 이메일 발송 페이지 수정
`src/app/(main)/admin/email/page.tsx`

변경:
- newsletter 탭: textarea → TipTap 에디터
- TipTap JSON → HTML 변환 → 기존 발송 파이프라인에 연결
- 미리보기: TipTap HTML 출력 → React Email 래핑 → 미리보기
- 발송: TipTap getHTML() → 기존 newsletter 템플릿에 삽입

### 4. 콘텐츠 라이브러리 UI (향후 확장 준비)
- 지금은 에디터만 교체
- 나중에 content_library에서 콘텐츠 불러오기 기능 추가 예정
- 에디터에 "불러오기" 버튼 자리만 마련 (disabled 상태)

## 디자인
- Primary: #F75D5D, Hover: #E54949
- 폰트: Pretendard
- 한국어 UI
- 라이트 모드 only
- 툴바: shadcn/ui 기반 (ToggleGroup 또는 커스텀)
- 에디터 영역: 깔끔한 white bg + border

## 체크리스트
- [x] TipTap 패키지 설치
- [x] tiptap-editor.tsx 컴포넌트 작성
- [x] 툴바 (볼드/이탤릭/헤딩/리스트/링크/이미지/정렬)
- [x] 이메일 페이지에서 textarea → TipTap 교체
- [x] HTML 변환 + 미리보기 연동
- [x] 발송 시 TipTap HTML → 기존 파이프라인 연결
- [x] npm run build 성공
- [ ] git add -A && git commit -m "feat: P1-4 TipTap WYSIWYG 이메일 에디터" && git push
