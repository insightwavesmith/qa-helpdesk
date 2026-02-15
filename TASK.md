# TASK: P1a 핫픽스 — AI 답변 타임아웃 수정

## 목표
knowledge.ts의 Opus 4.6 API 타임아웃이 30초로 설정되어 AI 답변 생성이 실패함.
타임아웃 증가 + Vercel maxDuration 설정으로 안정성 확보.

## 제약
- Vercel Pro 함수 실행 최대: 60초
- 기존 fire-and-forget 패턴 유지 (waitUntil은 P2에서 검토)
- gemini.ts는 수정하지 않음

## 현재 코드

### src/lib/knowledge.ts (L155-157)
```ts
const MODEL = "claude-opus-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;
```

### src/lib/knowledge.ts (L211-214)
```ts
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 응답 시간 초과 (30초)");
    }
```

### src/actions/questions.ts (L1-6)
```ts
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAIAnswerForQuestion } from "@/lib/rag";
import { revalidatePath } from "next/cache";
```

## 태스크

### T1. TIMEOUT_MS 증가
**파일**: `src/lib/knowledge.ts`
- L157: `const TIMEOUT_MS = 30_000;` → `const TIMEOUT_MS = 55_000;`
- L213: `throw new Error("AI 응답 시간 초과 (30초)");` → `throw new Error("AI 응답 시간 초과 (55초)");`

### T2. maxDuration export 추가
**파일**: `src/actions/questions.ts`
- import 블록 아래(L6 뒤)에 추가:
```ts
// Vercel Pro: 최대 60초 함수 실행 허용
export const maxDuration = 60;
```

## 체크리스트
- [ ] TIMEOUT_MS 30_000 → 55_000
- [ ] 에러 메시지 "(30초)" → "(55초)"
- [ ] questions.ts에 maxDuration = 60 export 추가
- [ ] tsc 에러 0
- [ ] ESLint 에러 0
- [ ] git commit + push

## 엣지 케이스

| 시나리오 | 입력 | 기대 결과 |
|---------|------|----------|
| Anthropic 55초 초과 | 대형 RAG 컨텍스트 | AbortError → 에러 로깅 → null 반환 |
| Vercel 60초 강제종료 | maxDuration 도달 | 함수 종료, 로그 남음 |
| fire-and-forget 조기종료 | 응답 후 함수 kill | 타임아웃 전 종료 가능 → P2에서 waitUntil 검토 |
| maxDuration Server Action 미지원 | Next.js < 13.4 | 현재 14.x 사용중, 지원됨 |

## 검증
- `npx tsc --noEmit` 에러 0
- `npx eslint src/lib/knowledge.ts src/actions/questions.ts` 에러 0
- git push → Vercel 자동 배포 → 라이브 테스트

## 리뷰 보고서
핫픽스 — 상수값 2개 + export 1줄. 리뷰 범위 최소.
리뷰 보고서 파일: `docs/review/2026-02-16-p1a-hotfix-review.html`
