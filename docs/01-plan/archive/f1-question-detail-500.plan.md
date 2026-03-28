# F1. /questions/{id} 500 에러 수정 — Plan

> 작성: 2026-03-04
> 우선순위: **최우선** (사용자 접근 불가 버그)

## 1. 개요
- **기능**: 질문 상세 페이지(`/questions/{id}`) 500 에러 수정
- **해결하려는 문제**: 모든 질문 상세 페이지에서 500 에러 발생 (답변 완료 질문 3개 모두 동일)
- **원인**: 커밋 `a20bf82`에서 XSS 보안 수정으로 `sanitizeHtml` (isomorphic-dompurify)를 서버 컴포넌트에 추가함. `isomorphic-dompurify`가 서버(Node.js)에서 browser 빌드를 선택해 `DOMPurify.sanitize is not a function` 에러 발생.
- **영향 범위**: `/questions/[id]` + `/notices/[id]` (동일 패턴)

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: `/questions/{id}` 페이지가 에러 없이 정상 렌더링
- FR-02: 답변이 있는 질문은 답변도 함께 표시
- FR-03: `/notices/{id}` 페이지도 동일 수정 적용 (같은 패턴)
- FR-04: XSS 보안 수준 유지 (mdToHtml 내부 escapeHtml 활용)

### 비기능적 요구사항
- `post-body.tsx`의 클라이언트 sanitize 유지 (정상 동작 중)
- 질문 목록 페이지 레이아웃 변경 금지
- `npm run build` 성공

## 3. 범위

### 포함
- `src/app/(main)/questions/[id]/page.tsx` — 서버 컴포넌트에서 `sanitizeHtml` 제거
- `src/app/(main)/notices/[id]/page.tsx` — 동일 패턴 수정
- (대안) `next.config.ts`에 `serverExternalPackages` 추가

### 제외
- `src/components/posts/post-body.tsx` — 클라이언트 컴포넌트, 정상 동작
- `src/lib/sanitize.ts` — 파일 자체 삭제 안 함 (post-body.tsx에서 사용 중)
- 질문 목록 페이지 (`/questions`)

## 4. 수정 방향 (2가지 대안)

### 대안 A: 서버 컴포넌트에서 sanitizeHtml 래핑 제거 (권장)
- `mdToHtml()` 내부에 이미 `escapeHtml()`이 적용됨 → 이중 sanitize 불필요
- `questions/[id]/page.tsx`: `sanitizeHtml(mdToHtml(...))` → `mdToHtml(...)`
- `notices/[id]/page.tsx`: 동일 패턴 수정
- **장점**: 최소 변경, 근본 원인 해결
- **단점**: 서버 렌더링 시 DOMPurify 없음 (mdToHtml의 escapeHtml로 충분)

### 대안 B: next.config.ts에 serverExternalPackages 추가
- `serverExternalPackages: ['isomorphic-dompurify', 'jsdom', 'dompurify']`
- **장점**: sanitizeHtml 유지 가능
- **단점**: jsdom 의존성 추가, 서버 번들 크기 증가

### 선택: **대안 A** (권장)
- `mdToHtml()`이 이미 `escapeHtml()`로 HTML 이스케이프를 수행하므로, 서버에서 DOMPurify 불필요
- 최소 변경 원칙에 부합

## 5. 성공 기준
- [ ] `/questions/{id}` 3개 질문 모두 정상 렌더링 (500 에러 없음)
- [ ] `/notices/{id}` 정상 렌더링
- [ ] 답변이 있는 질문에서 답변 내용 표시
- [ ] `post-body.tsx` 클라이언트 sanitize 정상 동작 유지
- [ ] `npm run build` 성공
- [ ] lint 에러 0개

## 6. 실행 순서
1. `questions/[id]/page.tsx`에서 `sanitizeHtml` import 및 호출 제거
2. `notices/[id]/page.tsx`에서 `sanitizeHtml` import 및 호출 제거
3. 미사용 import 정리 (lint 에러 방지)
4. 빌드 확인
5. 브라우저 QA — 질문 상세 페이지 3개 확인
