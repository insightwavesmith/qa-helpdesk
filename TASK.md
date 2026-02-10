# TASK.md — Phase B 버그 수정 (QA 결과)

## 배경
Phase B 콘텐츠 허브 배포 후 브라우저 QA에서 버그 2건 발견.

---

## T1: MDXEditor에 콘텐츠 미표시 (P0)

### 문제
- body_md 컬럼에 HTML이 저장되어 있음 (`<p># 제목</p><p>내용</p>` 형태)
- TipTap 시절에 마크다운 → HTML 변환되어 저장된 것
- MDXEditor는 마크다운만 입력받으므로 빈 에디터로 표시됨

### 해결 방법
1. **로딩 시 HTML→마크다운 변환**: `post-edit-panel.tsx`와 `newsletter-edit-panel.tsx`에서 body_md를 MDXEditor에 전달하기 전에 HTML 감지 → 마크다운 변환
2. **DB 마이그레이션 스크립트**: 10개 기사의 body_md를 마크다운으로 일괄 변환

### 구현 상세
- HTML 감지: `body_md.trim().startsWith('<')` 또는 `/<[a-z][\s\S]*>/i.test(body_md)` 
- 변환 라이브러리: `turndown` (HTML→Markdown 변환기) — `npm install turndown @types/turndown`
- 유틸 함수: `src/lib/html-to-markdown.ts` 생성
  ```typescript
  import TurndownService from 'turndown';
  
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  
  export function ensureMarkdown(content: string): string {
    if (!content) return '';
    if (/<[a-z][\s\S]*>/i.test(content)) {
      return turndown.turndown(content);
    }
    return content;
  }
  ```
- `post-edit-panel.tsx`: `initialBodyMd` 를 `ensureMarkdown(initialBodyMd)` 로 변환 후 MDXEditor에 전달
- `newsletter-edit-panel.tsx`: 동일하게 `email_summary` 또는 body_md 전달 시 변환

### 담당 파일
- `src/lib/html-to-markdown.ts` (신규)
- `src/components/content/post-edit-panel.tsx` (수정)
- `src/components/content/newsletter-edit-panel.tsx` (수정)
- `package.json` (turndown 추가)

### 완료 기준
- [x] 콘텐츠 상세 → 정보공유 탭에서 기존 HTML 콘텐츠가 마크다운으로 변환되어 MDXEditor에 표시됨
- [x] 뉴스레터 탭에서도 동일하게 작동
- [x] 순수 마크다운 콘텐츠는 변환 없이 그대로 표시됨
- [x] npm run build 성공

---

## T2: 사이드바 "이메일 발송" 메뉴 제거 (P1)

### 문제
- 콘텐츠 허브에 뉴스레터 탭이 통합되었으므로 별도 "이메일 발송" 메뉴 불필요
- 사이드바에 아직 남아있음

### 해결 방법
- `app-sidebar.tsx`에서 "이메일 발송" (`/admin/email`) 항목 제거

### 담당 파일
- `src/components/layout/app-sidebar.tsx` (수정)

### 완료 기준
- [x] 사이드바 관리 섹션에서 "이메일 발송" 메뉴 사라짐
- [x] `/admin/email` 라우트 접근 시 리디렉트 또는 404 (선택)
- [x] npm run build 성공

---

## 작업 순서
1. T1 먼저 (P0)
2. T2 (P1)
3. `npm run build` 확인
4. 완료 보고

## 주의사항
- main 브랜치에서 작업
- 커밋 메시지: `fix: MDXEditor HTML→마크다운 변환 + 이메일 발송 메뉴 제거`
