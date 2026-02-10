# TASK.md — Phase B-2: 콘텐츠 허브 UX 버그 수정 + 뉴스레터 이메일 템플릿

## 배경
Phase B 콘텐츠 허브 QA에서 6건 버그 발견. 저장/게시 기능 불가 + 뉴스레터 파이프라인 미완성.

**레퍼런스**: 마켓핏랩 뉴스레터 구조 (stibee.com/p/62)
- 브랜드 헤더 배너 → 훅 질문 → 핵심 요약 3-4문단 → CTA 버튼 → 푸터(수신거부)
- 뉴스레터 = 정보공유 글의 **티저 요약본** (전문 복사 X)

---

## T1: 정보공유 탭 — 저장 + 게시 버튼 (P0)

### 문제
- `post-edit-panel.tsx`에 "저장" 버튼만 있음. `disabled={saving || !dirty}`인데 dirty 상태가 올바르게 작동하는지 확인 필요.
- **게시완료/임시저장 상태 전환 버튼이 없음.** `publishContent()` 액션은 `contents.ts`에 이미 존재하지만 상세 페이지에서 호출하는 UI가 없음.

### 해결
1. `post-edit-panel.tsx` 툴바에 상태 전환 버튼 추가:
   - 현재 status=draft/review/ready → "게시" 버튼 표시 (publishContent 호출 → status=published)
   - 현재 status=published → "게시 취소" 버튼 표시 (updateContent → status=draft)
   - "임시저장" = 기존 "저장" 버튼 (body_md만 저장, status 유지)
2. dirty 상태 점검: MDXEditor의 onChange가 마운트 시 불필요하게 호출되는지 확인. 필요시 `useRef`로 초기 호출 무시.

### props 변경
```typescript
// post-edit-panel.tsx props에 추가
interface PostEditPanelProps {
  contentId: string;
  initialBodyMd: string;
  status: string;           // 추가: 현재 게시 상태
  onSaved?: () => void;
  onStatusChange?: () => void;  // 추가: 상태 변경 후 콜백
}
```

### 호출 측 변경
```typescript
// [id]/page.tsx에서 PostEditPanel 호출 시
<PostEditPanel
  contentId={content.id}
  initialBodyMd={content.body_md}
  status={content.status}
  onSaved={refreshContent}
  onStatusChange={refreshContent}
/>
```

### 담당 파일
- `src/components/content/post-edit-panel.tsx` (수정)
- `src/app/(main)/admin/content/[id]/page.tsx` (수정 — props 전달)

### 완료 기준
- [ ] 저장 버튼이 편집 후 활성화됨
- [ ] 게시 버튼 클릭 시 status=published로 변경되고 뱃지 즉시 반영
- [ ] 게시 취소 시 status=draft로 복원
- [ ] 빌드 성공

---

## T2: "새 콘텐츠" 생성 수정 (P1)

### 문제
- 허브 페이지에서 "새 콘텐츠" 버튼 클릭 시 `createContent({ title: "새 콘텐츠", body_md: "", status: "draft" })` 호출
- API 에러 발생 (toast: "콘텐츠 생성 실패"). DB 제약조건 위반 가능성 — `type`, `category` 등 NOT NULL 컬럼 누락.

### 해결
- `createContent` 호출 시 기본값 모두 포함:
```typescript
await createContent({
  title: "새 콘텐츠",
  body_md: "",
  status: "draft",
  type: "info",           // 추가
  category: "education",  // 추가
  tags: [],               // 추가
});
```

### 담당 파일
- `src/app/(main)/admin/content/page.tsx` (수정 — handleNewContent)

### 완료 기준
- [ ] "새 콘텐츠" 클릭 시 정상 생성 후 상세 페이지로 이동
- [ ] 생성된 콘텐츠의 type=info, category=education, status=draft
- [ ] 빌드 성공

---

## T3: 뉴스레터 "정보공유에서 가져오기" → AI 요약 (P1)

### 문제
- `handleImportFromPost`가 `body_md` 전문을 그대로 복사: `setEmailSummary(ensureMarkdown(content.body_md))`
- 뉴스레터 = 정보공유 글의 **티저 요약본**이어야 함 (마켓핏랩 스타일)

### 해결
- "정보공유에서 가져오기" 클릭 시 `/api/admin/content/summarize` API 호출
- API는 Gemini Flash로 body_md를 email_summary 형태로 요약
- 요약 형태 (마크다운):
  ```
  [훅 질문 또는 통계 1줄]
  
  ## 핵심 포인트
  
  - 포인트 1 (2-3줄)
  - 포인트 2 (2-3줄)  
  - 포인트 3 (2-3줄)
  
  **[전체 글에서 자세히 확인하세요 →]**
  ```

### 신규 API
```
POST /api/admin/content/summarize
body: { content_id: string }
response: { summary: string }
```

### 구현
1. `src/app/api/admin/content/summarize/route.ts` 신규 생성
   - Gemini Flash (`gemini-2.0-flash`) 호출
   - 프롬프트: "정보공유 본문을 뉴스레터 이메일 요약으로 변환. 훅 질문 1개 + 핵심 포인트 3개 + CTA 문구. 마크다운 형식. ~해요 말투. 200자 이내."
   - API 키: `process.env.GEMINI_API_KEY` (이미 프로젝트에 존재)
2. `newsletter-edit-panel.tsx`의 `handleImportFromPost` 수정:
   - 전문 복사 → API 호출로 변경
   - 로딩 상태 표시 (Sparkles 아이콘 회전)
   - 기존 "AI 요약" 버튼(disabled)은 제거하고 "정보공유에서 가져오기"가 AI 요약을 수행

### 담당 파일
- `src/app/api/admin/content/summarize/route.ts` (신규)
- `src/components/content/newsletter-edit-panel.tsx` (수정 — handleImportFromPost)

### 완료 기준
- [ ] "정보공유에서 가져오기" 클릭 시 로딩 표시 후 AI 요약된 텍스트가 에디터에 삽입
- [ ] 요약이 200자 내외의 티저 형태 (전문 X)
- [ ] 에러 시 toast 표시
- [ ] 빌드 성공

---

## T4: 뉴스레터 이메일 템플릿 프리뷰 (P1)

### 문제
- 미리보기가 `mdToPreviewHtml(emailSummary)` — 단순 HTML 변환만 하고 브랜드 래핑 없음
- 실제 발송 시에도 `newsletterTemplate`의 래핑이 제대로 적용되는지 불확실
- 마켓핏랩처럼 **브랜드 헤더 + 본문 + CTA 버튼 + 푸터** 구조 필요

### 해결
1. 미리보기를 `newsletterTemplate` 래핑 결과로 표시:
   - 현재 `email-templates.ts`의 `newsletterTemplate`은 이미 BS CAMP 헤더 + 본문 + CTA + 수신거부 푸터 구조
   - 미리보기에서 이 템플릿을 사용하되, `<iframe>` 또는 `srcdoc`으로 격리 표시
2. CTA 버튼 연결:
   - 정보공유 글 URL: `/posts?content_id=${contentId}`
   - CTA 텍스트: "전체 글 읽기 →"
3. `newsletterTemplate` 함수에 **헤더 이미지/배너** 옵션 추가 (선택적):
   - 콘텐츠의 `thumbnail_url`이 있으면 헤더 영역에 배너 이미지 삽입

### 구현
- `newsletter-edit-panel.tsx`의 미리보기 영역:
```typescript
// 기존: dangerouslySetInnerHTML={{ __html: mdToPreviewHtml(emailSummary) }}
// 변경: iframe srcdoc로 실제 이메일 템플릿 표시
const previewHtml = newsletterTemplate({
  subject: emailSubject,
  bodyHtml: mdToPreviewHtml(emailSummary),
  ctaText: "전체 글 읽기 →",
  ctaUrl: `${siteUrl}/posts?content_id=${content.id}`,
  thumbnailUrl: content.thumbnail_url,
});
// <iframe srcdoc={previewHtml} className="w-full h-[500px] border rounded" />
```

- `email-templates.ts`의 `newsletterTemplate` 수정:
  - `thumbnailUrl` 옵션 파라미터 추가
  - 있으면 헤더 아래에 `<img>` 배너 삽입

### 담당 파일
- `src/components/content/newsletter-edit-panel.tsx` (수정 — 미리보기)
- `src/lib/email-templates.ts` (수정 — thumbnailUrl 옵션)

### 완료 기준
- [ ] 미리보기에 BS CAMP 브랜드 헤더 표시
- [ ] 미리보기에 CTA 버튼 ("전체 글 읽기 →") 표시
- [ ] 미리보기에 수신거부 푸터 표시
- [ ] 썸네일 있는 콘텐츠는 배너 이미지 표시
- [ ] 테스트 발송 이메일도 동일한 템플릿 적용
- [ ] 빌드 성공

---

## T5: 뉴스레터 저장 + 재편집 (P1)

### 문제
- 뉴스레터 탭의 저장 버튼도 `disabled={saving || !dirty}`인데 dirty가 올바르게 관리되지 않을 수 있음
- email_summary가 저장된 후 다시 편집 페이지에 들어오면 MDXEditor에 기존 내용이 로드되지 않거나 dirty 초기화 문제

### 해결
1. `newsletter-edit-panel.tsx`에서 dirty 상태 점검:
   - `emailSubject` 변경 시에도 dirty=true
   - `target` 변경은 dirty에 영향 X (발송 설정이므로)
   - MDXEditor onChange 초기 호출 필터링
2. email_summary가 저장 후 재로드 시 MDXEditor에 정상 표시되는지 확인:
   - `ensureMarkdown(content.email_summary || "")` 정상 작동 확인
   - `content` prop이 업데이트되면 에디터 내용도 갱신

### 담당 파일
- `src/components/content/newsletter-edit-panel.tsx` (수정)

### 완료 기준
- [ ] email_summary 편집 후 저장 버튼 활성화
- [ ] 저장 후 페이지 재방문 시 기존 email_summary 표시
- [ ] emailSubject 변경 시에도 저장 가능
- [ ] 빌드 성공

---

## 작업 순서

1. **T2** (가장 간단 — 새 콘텐츠 생성 기본값 추가)
2. **T1** (저장/게시 버튼 — 핵심 UX)
3. **T5** (뉴스레터 저장/재편집 — T1과 유사한 dirty 상태 수정)
4. **T4** (이메일 템플릿 프리뷰 — UI 개선)
5. **T3** (AI 요약 — 신규 API 필요)

## 주의사항
- main 브랜치에서 작업
- `npm run build` 매 태스크 완료 시 확인
- 커밋 메시지 prefix: `fix:` (버그 수정)
- 한국어 UI 텍스트 유지
- `email-templates.ts`의 기존 `newsletterTemplate` 시그니처 변경 시 기존 호출부도 수정
- MDXEditor onChange 초기 호출 이슈: 마운트 시 한번 호출되는지 확인하고 `useRef`로 skip 처리
