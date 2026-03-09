# TASK: 큐레이션 v2 코드 리뷰 이슈 수정 (4건)

## 타입
버그수정 + 개선

## 배경
큐레이션 v2 Phase 0+1 코드 리뷰(`docs/03-analysis/curation-v2-p0p1-review.md`)에서 이슈 4건 발견.
Match Rate 82% — 누락 기능 + 타입 안전성 + 보안 이슈.

---

### T1: Supabase 타입 재생성
**이게 뭔지**: DB 스키마에 맞는 TypeScript 타입 파일을 재생성하는 것
**왜 필요한지**: ai_summary, importance_score, curation_status 등 새 컬럼 추가 후 타입이 안 맞아서 `(supabase as any)`를 15군데 사용 중. 타입 안전성이 없어 런타임 에러 가능성 있음
**구현 내용**:
- `npx supabase gen types typescript --project-id symvlrsmkjlztoopbnht > src/lib/database.types.ts` 실행
- `src/actions/curation.ts`의 `(supabase as any)` 15개를 정상 타입 호출로 교체
- eslint-disable 주석도 같이 제거

### T2: 백필 빈 본문 가드
**이게 뭔지**: AI 요약/중요도 백필 시 본문이 비어있는 콘텐츠를 건너뛰는 것
**왜 필요한지**: `body_md`가 null이거나 빈 문자열인 콘텐츠에 AI 요약을 요청하면 의미 없는 결과가 나오고 API 비용만 낭비됨
**구현 내용**:
- `backfillAiSummary()`: `if (!record.body_md?.trim()) { failed++; continue; }` 가드 추가
- `backfillImportanceScore()`: 동일하게 빈 본문 가드 추가

### T3: 백필 API 인증 체크
**이게 뭔지**: `/api/admin/curation/backfill` 엔드포인트에 admin 권한 검증을 추가하는 것
**왜 필요한지**: 현재 이 API는 URL만 알면 누구나 호출 가능. 악의적 호출 시 대량 AI API 호출로 비용 발생 위험
**구현 내용**:
- `src/middleware.ts`에서 `/api/admin/` 경로가 이미 보호되는지 확인
- 안 되면 route.ts에 세션 체크 + role="admin" 검증 추가
- 미인증 시 401 반환

### T4: 커리큘럼 발행 상태 표시
**이게 뭔지**: 커리큘럼 목록에서 각 콘텐츠의 발행 상태를 시각적으로 보여주는 것
**왜 필요한지**: 코드 리뷰에서 스펙 Gap 발견 — `curation-v2-spec.md` 섹션 3.1에 "발행됨/다음 발행/잠금" 상태 표시가 핵심 기능으로 명시되어 있으나 누락됨
**구현 내용**:
- `curriculum-view.tsx`에 발행 상태 로직 추가:
  - `발행됨`: ai_summary 있음 + curation_status="published"
  - `다음 발행`: 순서상 다음 (발행 안 된 첫 번째)
  - `잠금`: 나머지
- 각 상태에 아이콘/색상 표시 (✅/🔜/🔒)

---

## 관련 파일
- src/actions/curation.ts (T1, T2)
- src/app/api/admin/curation/backfill/route.ts (T3)
- src/components/curation/curriculum-view.tsx (T4)
- src/lib/database.types.ts (T1)
- src/middleware.ts (T3)
- docs/03-analysis/curation-v2-p0p1-review.md (리뷰 결과)
- docs/proposals/curation-v2-spec.md (T4 스펙)

## 완료 기준
- [ ] `npx tsc --noEmit` 에러 0
- [ ] `npx next lint --quiet` 에러 0
- [ ] `npm run build` 성공
- [ ] `(supabase as any)` 0개 (curation.ts)
- [ ] 빈 본문 백필 시 skip 확인
- [ ] 백필 API 미인증 호출 시 401
- [ ] 커리큘럼 발행 상태 3종 표시
