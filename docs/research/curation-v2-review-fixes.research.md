# Research: 큐레이션 v2 코드 리뷰 이슈 수정 (4건)

> 작성일: 2026-03-06
> 참조: TASK.md, docs/03-analysis/curation-v2-p0p1-review.md

## 수정 대상 파일 목록

| 파일 | 관련 태스크 | 현재 상태 |
|------|------------|-----------|
| `src/actions/curation.ts` | T1, T2 | `(supabase as any)` 15회, eslint-disable 15회, 빈 본문 가드 없음 |
| `src/app/api/admin/curation/backfill/route.ts` | T3 | `requireAdmin()` 이미 호출 중 (정상) |
| `src/components/curation/curriculum-view.tsx` | T4 | 발행 상태 미표시 (ai_summary 유무만 표시) |
| `src/lib/auth-utils.ts` | T1 | `requireStaff()` 반환 타입이 `SupabaseClient` (Database 제네릭 없음) |
| `src/types/database.ts` | T1 | contents 테이블에 ai_summary, importance_score, curation_status 컬럼 이미 존재 |

## 현재 동작 요약

### T1: `as any` 원인 분석
- `src/lib/auth-utils.ts`의 `requireStaff()`가 `Promise<SupabaseClient>` 반환 (제네릭 없음)
- 내부에서 `createServiceClient()` 호출 → 이건 `SupabaseClient<Database>` 반환
- 하지만 함수 시그니처가 bare `SupabaseClient`이라 타입 정보 소실
- `requireAdmin()`도 동일 문제
- **해결**: 반환 타입을 `SupabaseClient<Database>`로 변경하면 `as any` 전부 제거 가능
- `src/types/database.ts`에 `contents` 테이블 타입은 이미 최신 (ai_summary, importance_score, curation_status, key_topics 등 존재)
- **supabase gen types 불필요** — 이미 최신 상태

### T2: 빈 본문 가드 필요 위치
- `backfillAiSummary()` L387-390: `row.body_md`를 3000자 슬라이스 후 프롬프트에 전달. 빈 문자열이면 의미 없는 요약 생성
- `backfillImportanceScore()` L471: 동일. `body_md`가 빈 문자열이면 AI 판단 불가
- **해결**: 루프 시작부에 `if (!row.body_md || !row.body_md.trim())` 가드 추가, `failed++` 처리

### T3: 백필 API 인증 현황
- `route.ts` L8: `const auth = await requireAdmin();` → 이미 `_shared.ts`의 `requireAdmin()` 호출
- `_shared.ts` `requireAdmin()`: 세션 확인 + profiles.role="admin" 검증 + 미인증 시 401/403 반환
- **결론**: API 라우트 자체는 이미 보호됨
- **추가 보안**: 서버 액션(`backfillAiSummary`, `backfillImportanceScore`)도 `requireAdmin()` 호출 추가 필요 (리뷰 P0 이슈)
- `req.json()` try-catch도 추가

### T4: 커리큘럼 발행 상태
- 스펙 3.1: "발행됨 (curation_status=published) / 다음 발행 / 잠금"
- 현재 `CurriculumItem`은 `ai_summary` 유무만 뱃지 표시 ("요약완료" / "미처리")
- Content 타입에 `curation_status: 'new' | 'selected' | 'dismissed' | 'published'` 존재
- **해결**: 아이템 순회 시 첫 번째 미발행 아이템을 "다음 발행"으로 마킹, 이전 발행 아이템은 "발행됨", 나머지는 "잠금"

## 의존성 그래프

```
auth-utils.ts (T1: 반환 타입 수정)
    └── curation.ts (T1: as any 제거, T2: 빈 본문 가드)
        └── backfill/route.ts (T3: req.json try-catch + 서버액션 내부 권한체크)

curriculum-view.tsx (T4: 발행 상태 UI) — 독립
```

## 수정 영향 범위

- `auth-utils.ts` 반환 타입 변경 → `requireStaff()`/`requireAdmin()` 호출하는 모든 서버 액션에 영향
  - 하지만 넓은 타입 → 좁은 타입이라 기존 코드에 breaking change 없음
- `curation.ts` — 타입 제거 + 가드 추가 = 동작 변경 없음
- `curriculum-view.tsx` — UI 추가 = 기존 동작 보존
