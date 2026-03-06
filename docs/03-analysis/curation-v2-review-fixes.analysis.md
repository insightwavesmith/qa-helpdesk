# 큐레이션 v2 코드 리뷰 이슈 수정 — Gap 분석

## Match Rate: 100%

## 일치 항목

| # | 설계 항목 | 구현 상태 | 비고 |
|---|----------|-----------|------|
| T1-1 | auth-utils.ts 반환 타입 `SupabaseClient<Database>` | O | requireAdmin + requireStaff 모두 수정 |
| T1-2 | curation.ts `(supabase as any)` 15개 제거 | O | 0개 확인 (grep 검증) |
| T1-3 | curation.ts `eslint-disable` 주석 제거 | O | 0개 확인 (grep 검증) |
| T1-4 | 타입 변경으로 노출된 nullability 오류 수정 | O | answers-review-client, members-client, member-detail-modal, SubscriberTab 4개 파일 |
| T2-1 | backfillAiSummary() 빈 본문 가드 | O | `!text.trim()` → failed++ + skip |
| T2-2 | backfillImportanceScore() 빈 본문 가드 | O | AI 분기 내부에 동일 가드 (blueprint/lecture 고정 5는 본문 불필요) |
| T3-1 | 서버 액션 내부 requireAdmin() 호출 | O | createServiceClient() → requireAdmin() 교체 |
| T3-2 | API route.ts req.json() try-catch | O | 파싱 실패 시 400 반환 |
| T4-1 | 발행 상태 3종 (발행됨/다음 발행/잠금) | O | getPublishStatuses() + PUBLISH_BADGE 상수 |
| T4-2 | 발행 상태 아이콘/색상 | O | CheckCircle(녹)/ArrowRight(주황)/Lock(회) |
| T4-3 | 그룹별 발행 카운트 | O | `(X/Y 발행)` 표시 |
| T4-4 | aria-expanded 접근성 | O | CurriculumItem button에 추가 |

## 불일치 항목
없음.

## 수정 필요
없음.

## 빌드 검증
- `npx tsc --noEmit`: 에러 0
- `npm run build`: 성공
- `npx eslint` (변경 파일): 에러 0

## 변경 파일 목록
| 파일 | 변경 내용 |
|------|----------|
| `src/lib/auth-utils.ts` | 반환 타입 `SupabaseClient<Database>` 추가 |
| `src/actions/curation.ts` | `as any` 15개 + eslint-disable 제거, 빈 본문 가드, requireAdmin 적용 |
| `src/app/api/admin/curation/backfill/route.ts` | req.json() try-catch |
| `src/components/curation/curriculum-view.tsx` | 발행 상태 3종 UI + 접근성 |
| `src/app/(main)/admin/answers/answers-review-client.tsx` | is_ai/is_approved/created_at nullable |
| `src/app/(main)/admin/members/members-client.tsx` | created_at/active nullable |
| `src/app/(main)/admin/members/member-detail-modal.tsx` | MemberProfile.created_at + AdAccount.active nullable |
| `src/components/admin/SubscriberTab.tsx` | Subscriber.created_at nullable |
