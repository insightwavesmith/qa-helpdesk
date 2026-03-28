# 클라이언트 캐싱 — 페이지 전환 시 재로딩 제거

## 요구사항
사이드바에서 페이지 전환 후 돌아왔을 때 데이터를 다시 로딩하지 않도록 클라이언트 캐싱 적용. 사용자 체감 로딩 대기 시간 제거.

## 배경/맥락
- 현재 모든 페이지가 `useEffect` + `fetch` 패턴 → 마운트 시마다 API 호출 → 로딩 스피너
- SWR/React Query 미사용 상태
- 예시: 총가치각도기 → 경쟁사분석 → 총가치각도기 돌아오면 매번 로딩
- 일부 파일(admin/content/page.tsx)은 모듈 레벨 `_contentsCache` 변수로 임시 캐싱하고 있으나, 이는 비표준이고 revalidation 로직 없음

## 범위

### SWR 전환 대상 (15개 파일, useEffect+fetch 데이터 로딩)

| # | 파일 | 현재 패턴 | 데이터 소스 | fetch 횟수 |
|---|------|-----------|-------------|-----------|
| 1 | `src/app/(main)/protractor/real-dashboard.tsx` | useEffect×4 (accounts, insights, total-value, overlap) | fetch API 4개 | 4 |
| 2 | `src/app/(main)/dashboard/v0-dashboard.tsx` | useEffect×1 (전체 계정 insights 집계) | fetch API 2개 (accounts + insights×N) | 1+N |
| 3 | `src/app/(main)/admin/content/page.tsx` | useEffect+useCallback (contents + curation count) | Server Action (`getContents`, `getCurationCount`) | 2 |
| 4 | `src/app/(main)/admin/knowledge/page.tsx` | useEffect+useCallback (monitoring data) | fetch `/api/admin/knowledge/stats` | 1 |
| 5 | `src/app/(main)/admin/accounts/accounts-client.tsx` | useEffect+useCallback (accounts + students) | fetch `/api/admin/accounts` | 1 |
| 6 | `src/app/(main)/admin/reviews/page.tsx` | useEffect (reviews list) | Server Action `getReviewsAdmin()` | 1 |
| 7 | `src/app/(main)/protractor/components/benchmark-admin.tsx` | useEffect (benchmarks) | fetch `/api/protractor/benchmarks` | 1 |
| 8 | `src/app/(main)/protractor/competitor/components/monitor-panel.tsx` | useEffect+useCallback (monitors) | fetch `/api/competitor/monitors` | 1 |
| 9 | `src/components/curation/pipeline-sidebar.tsx` | useEffect (pipeline stats + summary stats) | Server Action `getPipelineStats`, `getCurationSummaryStats` | 2 |
| 10 | `src/components/curation/deleted-section.tsx` | useEffect (deleted contents) | Server Action `getDeletedContents` | 1 |
| 11 | `src/components/curation/curriculum-view.tsx` | useEffect+useCallback (curriculum contents) | Server Action `getCurriculumContents` | 1 |
| 12 | `src/components/curation/curation-view.tsx` | useEffect+useCallback (curation contents + status counts) | Server Action `getCurationContents`, `getCurationStatusCounts` | 2 |
| 13 | `src/components/dashboard/SalesSummary.tsx` | useEffect (sales summary) | fetch `/api/sales-summary` | 1 |
| 14 | `src/components/qa-chatbot/QaReportList.tsx` | useEffect+useCallback (QA reports) | Server Action `getQaReports` | 1 |
| 15 | `src/components/admin/SubscriberTab.tsx` | useEffect+useCallback (subscribers, pagination) | Server Action `getSubscribers` | 1 |

### SWR 전환 대상이 아닌 파일 (useEffect이지만 데이터 로딩이 아님)

| 파일 | 이유 |
|------|------|
| `PostDetailClient.tsx` | Auto-save debounce (쓰기 작업) |
| `onboarding/page.tsx` | Auth flow (일회성 액션) |
| `pending/page.tsx` | Auth state listener |
| `reset-password/page.tsx` | Auth code exchange |
| `post-body.tsx` | DOM 조작 (Unsplash 이미지) |
| `HomeSearchBar.tsx` | localStorage + click-outside |
| `new-question-form.tsx` | Blob URL cleanup |
| `answer-form.tsx` | Blob URL cleanup |
| `use-mobile.tsx` | Media query listener |
| `sidebar.tsx` | Cookie state |
| `generate-preview-modal.tsx` | Streaming AI 생성 (캐싱 불가) |
| `add-monitor-dialog.tsx` | 사용자 트리거 debounce 검색 |

## 성공 기준
1. **즉시 렌더링**: 총가치각도기 → 경쟁사분석 → 총가치각도기 돌아왔을 때 로딩 스피너 없이 즉시 데이터 표시
2. **모든 사이드바 메뉴 전환 시** 이전 데이터가 캐시에서 즉시 표시
3. **백그라운드 revalidation**: stale 데이터 표시 후 백그라운드에서 최신 데이터 갱신
4. **데이터 무결성**: 관리자가 데이터 변경(콘텐츠 발행, 답변 승인 등) 후 해당 페이지 재방문 시 업데이트 반영
5. **기존 API route 변경 없음** (클라이언트만 수정)
6. **tsc --noEmit + next lint + npm run build 통과**

## 제약사항
- 기존 API route 변경 금지
- 전역 상태 관리 라이브러리(Redux, Zustand) 추가 금지
- SWR만 사용 (React Query 아님)

## 의존성
- SWR 패키지 설치 필요 (`swr`)
- 기존 코드 구조 변경 최소화 (fetch 로직은 SWR fetcher로 래핑)
