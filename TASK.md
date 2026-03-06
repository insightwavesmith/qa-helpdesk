# TASK: 큐레이션 v2 코드 리뷰 이슈 수정 (4건)

## 타입
버그수정 + 개선

## 배경
코드 리뷰(`docs/03-analysis/curation-v2-p0p1-review.md`)에서 발견된 이슈 4건을 수정한다.

## 요구사항

### T1: Supabase 타입 재생성
- `npx supabase gen types typescript --project-id symvlrsmkjlztoopbnht > src/lib/database.types.ts` 실행
- `src/actions/curation.ts`의 `(supabase as any)` 15개를 정상 타입 호출로 교체
- eslint-disable 주석도 제거
- **주의**: 기존 database.types.ts가 있으면 백업 후 교체

### T2: 백필 빈 본문 가드
- `src/actions/curation.ts`의 `backfillAiSummary()`:
  - `body_md`가 null/빈문자열/공백만 있으면 skip (failed++ 처리)
- `backfillImportanceScore()`:
  - 동일하게 빈 본문 가드 추가

### T3: 백필 API 인증 체크
- `src/app/api/admin/curation/backfill/route.ts` 확인
- admin 미들웨어로 이미 보호되는지 확인 → 안 되면 세션 체크 + role="admin" 검증 추가
- 미인증 시 401 반환

### T4: 커리큘럼 발행 상태 표시
- `src/components/curation/curriculum-view.tsx`에 발행 상태 추가
- 상태: `발행됨` (ai_summary 있음 + curation_status="published") / `다음 발행` (순서상 다음) / `잠금` (나머지)
- 각 상태에 맞는 아이콘/색상 표시
- 참고: `docs/proposals/curation-v2-spec.md` 섹션 3.1

## 관련 파일
- src/actions/curation.ts (T1, T2)
- src/app/api/admin/curation/backfill/route.ts (T3)
- src/components/curation/curriculum-view.tsx (T4)
- src/lib/database.types.ts (T1)
- src/middleware.ts (T3 — 기존 admin 보호 확인)
- docs/03-analysis/curation-v2-p0p1-review.md (리뷰 결과 참고)
- docs/proposals/curation-v2-spec.md (T4 — 스펙 참고)

## 완료 기준
- [ ] `npx tsc --noEmit` 에러 0
- [ ] `npx next lint --quiet` 에러 0
- [ ] `npm run build` 성공
- [ ] `(supabase as any)` 0개 (curation.ts에서)
- [ ] 빈 본문 백필 시 skip 확인
- [ ] 백필 API 미인증 호출 시 401 반환
- [ ] 커리큘럼 발행 상태 3종 표시
