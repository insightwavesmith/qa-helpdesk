# 큐레이션 v2 코드 리뷰 이슈 수정 Plan

## 배경
코드 리뷰(`docs/03-analysis/curation-v2-p0p1-review.md`)에서 발견된 P0/P1 이슈 4건 수정.

## 범위

### T1: Supabase 타입 안전성 복원
- `auth-utils.ts`의 `requireStaff()`/`requireAdmin()` 반환 타입에 `Database` 제네릭 추가
- `curation.ts`의 `(supabase as any)` 15개 + `eslint-disable` 주석 전부 제거
- supabase gen types는 불필요 (database.ts 이미 최신)

### T2: 백필 빈 본문 가드
- `backfillAiSummary()`: body_md null/빈문자열/공백 → skip (failed++)
- `backfillImportanceScore()`: 동일 가드 (blueprint/lecture 고정 5점은 본문 불필요이므로 AI 분기에서만)

### T3: 백필 API/서버액션 인증 강화
- API 라우트: `req.json()` try-catch 추가
- 서버 액션 내부: `backfillAiSummary()`, `backfillImportanceScore()`에 `requireAdmin()` 호출 추가
  - `createServiceClient()` 직접 호출 → `requireAdmin()` (auth-utils.ts) 경유로 변경

### T4: 커리큘럼 발행 상태 표시
- 상태 3종: 발행됨 / 다음 발행 / 잠금
- 판정 로직: curation_status="published" → 발행됨, 첫 번째 비발행 → 다음 발행, 나머지 → 잠금
- 아이콘/색상: 체크(녹색) / 화살표(주황) / 자물쇠(회색)

## Out of Scope
- key_topics 백필 (Phase 2)
- sequence_order DB 컬럼 (Phase 2)
- 중복 콘텐츠 감지 (Phase 2+)
- getPipelineStats() DB 집계 전환 (성능 개선 — 별도 태스크)

## 성공 기준
- `npx tsc --noEmit` 에러 0
- `npm run build` 성공
- `(supabase as any)` 0개 (curation.ts)
- 빈 본문 백필 시 skip 동작
- 커리큘럼 발행 상태 3종 표시
