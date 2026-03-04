# TASK: 500 에러 수정 + AI 답변 humanize + placeholder 이미지

## 우선순위
F1 > F2 > F3 순서로 처리

---

## F1. /questions/{id} 500 에러 수정 (최우선)

### 목표
개별 질문 상세 페이지가 정상 렌더링되어야 한다.

### 현재 동작
- `/questions/{id}`에 직접 접근하면 500 에러 발생
- 답변완료된 질문 3개 모두 동일
- 질문 목록(`/questions`)은 정상

### 기대 동작
- 모든 질문 상세 페이지가 에러 없이 정상 렌더링
- 답변이 있는 질문은 답변도 함께 표시

### 원인
- 커밋 `a20bf82`에서 XSS 보안 수정으로 `sanitizeHtml`을 서버 컴포넌트에 추가
- `isomorphic-dompurify`가 서버(Node.js)에서 browser 빌드를 선택 → `DOMPurify.sanitize is not a function`
- `post-body.tsx`는 `"use client"`라 괜찮지만, `questions/[id]/page.tsx`는 서버 컴포넌트

### 수정 방향
- 서버 컴포넌트에서 `sanitizeHtml` 래핑 제거 (`mdToHtml` 내부에 이미 `escapeHtml()` 있음)
- 또는 `next.config.ts`에 `serverExternalPackages: ['isomorphic-dompurify', 'jsdom', 'dompurify']` 추가
- `/notices/[id]`에도 동일 패턴 있으면 같이 수정

### 관련 파일
- `src/app/(main)/questions/[id]/page.tsx`
- `src/lib/sanitize.ts`
- `src/app/(main)/notices/[id]/page.tsx` (동일 패턴 있으면)

### 하지 말 것
- 질문 목록 페이지 레이아웃 변경
- `post-body.tsx`의 클라이언트 sanitize 제거 (이건 정상 동작중)

---

## F2. AI 답변 프롬프트 humanize

### 목표
수강생 질문에 대한 AI 자동 답변 톤을 자연스럽게 변경한다.

### 현재 동작 (QA_SYSTEM_PROMPT)
AI 답변이 다음 패턴을 반복:
- "안녕하세요!" 인사말 시작
- "~드리겠습니다" / "설명드리겠습니다" / "안내드리겠습니다"
- "더 궁금한 점이 있으시면 언제든 추가 질문해주세요! 😊" 마무리
- 과도한 마크다운 (##, **, ✅ 이모지 남발)

### 기대 동작
- 인사말/맺음말 제거 — 바로 본론
- ~요체 30% 이하, 단정형(~다, ~이다) 위주
- 이모지 사용 금지
- 마크다운 최소화 (굵기 강조만 허용, ## 헤딩 금지)
- 톤: 강사가 수강생에게 설명하듯 간결하고 실용적으로

### 관련 파일
- `src/lib/knowledge.ts` — `QA_SYSTEM_PROMPT` (~line 75-130)

### 하지 말 것
- RAG 검색 로직 변경
- 정보공유 생성 프롬프트 변경 (별도 파일)
- consumer 설정 변경

---

## F3. 정보공유 placeholder 이미지 제거

### 목표
정보공유 글 생성 시 placehold.co 이미지 대신 이미지 없이 생성한다.

### 현재 동작
- 일부 정보공유 글에 `placehold.co` placeholder 이미지가 포함됨
- 섹션 1, 3에 placeholder / 섹션 4, 5는 Unsplash 실제 이미지

### 기대 동작
- 이미지를 넣을 수 없으면 이미지 태그 자체를 생성하지 않음
- placehold.co URL은 절대 사용 금지
- Unsplash 이미지도 한국어 검색이 안 되는 경우 많으므로, 이미지 없이 텍스트만으로 생성

### 관련 파일
- `src/app/api/admin/curation/generate/route.ts` — 정보공유 생성 프롬프트

### 하지 말 것
- 기존 정보공유 글 수정 (새 글 생성에만 적용)
- 정보공유 CSS 변경
- QA 답변 프롬프트 변경
