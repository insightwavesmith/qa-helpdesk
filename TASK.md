# TASK.md — 전체 코드 리뷰
> 2026-02-15 | qa-helpdesk 프로젝트 전체 코드 품질 점검 및 개선

## 목표
프로젝트 전체 코드베이스(219 파일, ~33,700 줄)를 리뷰하여 버그, 보안 취약점, 성능 이슈, 데드코드를 식별하고 수정한다.
- lint 에러 3개 → 0개
- lint 경고 19개 → 최소화
- 보안/성능 이슈 식별 및 수정
- 데드코드/미사용 import 정리

## 레퍼런스
- CLAUDE.md: 프로젝트 규칙, 디자인 시스템, PDCA 워크플로우
- `.claude/skills/`: 프로젝트별 스킬 4개 (nextjs-supabase, design-system, email-parser, webapp-testing)

## 현재 코드

### 알려진 lint 에러 3건
```ts
// 1. setState in useEffect — 무한 렌더 위험
// src/app/(main)/admin/content/[id]/page.tsx:78
useEffect(() => {
  setState(value); // ← error: cascading renders
}, [dep]);

// 2-3. let → const
// src/app/api/admin/email/ai-write/route.ts:148,153
let firstSectionTitle = "..."; // ← error: never reassigned
let contentHtml = "...";       // ← error: never reassigned
```

### 알려진 lint 경고 (주요)
```
# 미사용 변수
src/components/questions/AnswerCard.tsx:1  'Sparkles' is defined but never used
src/lib/diagnosis/engine.ts:15  '_belowAvg' is assigned but never used

# 불필요한 eslint-disable
src/lib/email-template-utils.ts:230  Unused eslint-disable directive

# <img> → <Image> (next/image 권장, 총 4곳)
src/app/(main)/admin/content/page.tsx:49
src/components/posts/post-card.tsx:61
src/components/posts/post-hero.tsx:9
```

### 프로젝트 구조
```
src/
├── app/
│   ├── (auth)/        — 로그인/회원가입
│   ├── (main)/        — 메인 레이아웃 (admin, posts, protractor, settings 등)
│   ├── api/           — API 라우트 (admin, cron, diagnose, protractor 등)
│   └── layout.tsx
├── actions/           — Server Actions (contents.ts 698줄)
├── components/        — UI 컴포넌트
├── hooks/             — Custom hooks
├── lib/               — 유틸리티 (email, supabase, protractor 등)
├── types/             — 타입 정의
└── middleware.ts      — Supabase Auth 세션
```

### 주요 파일 크기
```
3,108줄  src/lib/email-default-template.ts   (Unlayer JSON 템플릿)
1,093줄  src/types/database.ts               (Supabase 타입)
  838줄  src/app/(main)/admin/email/page.tsx  (이메일 관리 페이지)
  698줄  src/actions/contents.ts              (Server Actions)
  499줄  src/components/email/tiptap-editor.tsx (에디터 — MDXEditor로 교체됨, 데드코드 가능성)
  349줄  src/lib/email-templates.ts           (이전 템플릿 — 데드코드 가능성)
  325줄  src/lib/email-template-utils.ts      (현재 사용 파서)
```

### 기술 스택
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + RLS)
- MDXEditor (마크다운 WYSIWYG)
- Unlayer (이메일 에디터)

## 제약
- `npm run build` 성공 상태 유지 (현재 성공)
- `npx tsc --noEmit` 에러 0 유지 (현재 0)
- 기존 기능 깨뜨리지 않기 — 리팩토링은 동작 보존 필수
- UI 텍스트 한국어 유지
- email-default-template.ts는 Unlayer JSON 구조라 대폭 변경 지양
- Supabase RLS 정책 건드리지 않기

## 태스크

### T1. lint 에러 수정 (3건) → code-reviewer
- 파일:
  - `src/app/(main)/admin/content/[id]/page.tsx` (line 78)
  - `src/app/api/admin/email/ai-write/route.ts` (lines 148, 153)
- 의존: 없음
- 완료 기준:
  - [ ] page.tsx: useEffect 안 setState → useEffect 밖 또는 조건부로 이동 (무한 렌더 방지)
  - [ ] ai-write/route.ts: `let firstSectionTitle` → `const firstSectionTitle`
  - [ ] ai-write/route.ts: `let contentHtml` → `const contentHtml`
  - [ ] `npx eslint src/ 2>&1 | grep "error"` → 0건

### T2. lint 경고 정리 → code-reviewer
- 파일:
  - `src/components/questions/AnswerCard.tsx` (미사용 import)
  - `src/lib/diagnosis/engine.ts` (미사용 변수)
  - `src/lib/email-template-utils.ts` (불필요 eslint-disable)
  - `src/app/(main)/admin/content/page.tsx` (img → Image)
  - `src/components/posts/post-card.tsx` (img → Image)
  - `src/components/posts/post-hero.tsx` (img → Image)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 미사용 import/변수 제거
  - [ ] 불필요 eslint-disable 제거
  - [ ] `<img>` → `next/image` `<Image>` 교체 (외부 URL이면 next.config에 domains 추가)
  - [ ] lint 경고 수 19 → 10 이하

### T3. 데드코드 탐색 및 제거 → code-reviewer
- 파일 (의심 대상):
  - `src/components/email/tiptap-editor.tsx` (499줄 — MDXEditor로 교체됨)
  - `src/lib/email-templates.ts` (349줄 — email-default-template.ts로 교체 가능)
  - 전체 `src/` 내 미사용 export/함수
- 의존: T2 완료 후
- 완료 기준:
  - [ ] tiptap-editor.tsx가 어디서도 import되지 않으면 삭제
  - [ ] email-templates.ts가 어디서도 import되지 않으면 삭제
  - [ ] `grep -r "from.*tiptap-editor" src/` → 0건이면 삭제 확정
  - [ ] `grep -r "from.*email-templates" src/` → 0건이면 삭제 확정
  - [ ] 삭제한 파일 목록 기록

### T4. 보안 점검 → code-reviewer
- 파일: 전체 `src/app/api/` + `src/actions/` + `src/middleware.ts`
- 의존: 없음 (T1~T3과 병렬 가능)
- 완료 기준:
  - [ ] 모든 admin API에 `requireAdmin()` 또는 동등한 인증 체크 있음
  - [ ] 사용자 입력이 SQL/HTML에 들어가는 곳에 이스케이프 처리 확인
  - [ ] 환경변수가 클라이언트에 노출되지 않음 확인 (`NEXT_PUBLIC_` 외)
  - [ ] RLS가 우회되는 곳 없음 확인 (service role 사용처 검토)
  - [ ] 발견된 이슈 + 수정 내용 주석으로 기록

### T5. 코드 품질 리뷰 보고서 → code-reviewer
- 파일: `docs/04-report/code-review-2026-02-15.report.md` (신규 생성)
- 의존: T1~T4 완료 후
- 완료 기준:
  - [ ] 수정 항목 요약 (파일, 변경 내용, 이유)
  - [ ] 남은 경고/이슈 목록 (수정 불가 또는 추후 대응)
  - [ ] 아키텍처 개선 제안 (있다면)
  - [ ] 성능 우려 사항 (큰 파일, 비효율 패턴 등)

## 엣지 케이스

| 상황 | 기대 동작 |
|------|-----------|
| tiptap-editor.tsx가 동적 import로 사용 중 | 삭제하지 않고 보고서에 기록 |
| `<img>`가 외부 URL(supabase storage 등)을 참조 | next.config.ts images.remotePatterns에 도메인 추가 후 `<Image>` 교체 |
| useEffect setState 수정 시 기존 동작 변경 | 기존 동작 유지하면서 lint 에러만 해결 (예: 별도 변수 + 조건부 업데이트) |
| admin API에 인증 누락 발견 | 즉시 수정 (requireAdmin 추가) + 보고서에 기록 |
| server action에 escapeHtml 중복 정의 | 공통 유틸로 추출 (email-template-utils.ts와 contents.ts 모두 escapeHtml 있음) |

## 검증
☐ 터미널에서 `npx tsc --noEmit` 실행 → 에러 출력 0줄
☐ 터미널에서 `npx eslint src/ 2>&1 | grep "error"` 실행 → 0건 출력
☐ 터미널에서 `npm run build` 실행 → "✓ Compiled successfully" 메시지 확인
☐ `cat docs/04-report/code-review-2026-02-15.report.md` 실행 → 파일 내용 출력 (수정 요약 + 남은 이슈 + 제안 포함 확인)
☐ `npx eslint src/ 2>&1 | grep "warning" | wc -l` 실행 → 10 이하 확인
☐ `grep -r "from.*tiptap-editor" src/ | wc -l` 실행 → 0이면 `ls src/components/email/tiptap-editor.tsx` 에서 "No such file" 확인
