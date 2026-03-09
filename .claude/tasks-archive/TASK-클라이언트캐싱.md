# TASK: 클라이언트 데이터 캐싱 — 페이지 전환 시 재로딩 제거

## 목표
사이드바에서 페이지 전환 후 돌아왔을 때 데이터를 다시 로딩하지 않도록 클라이언트 캐싱 적용. 사용자가 체감하는 로딩 대기 시간을 없앤다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

## 현황
- 전체 페이지가 `useEffect` + `fetch` 패턴 → 마운트 시마다 API 호출 → 로딩 스피너
- SWR/React Query 미사용
- 예시: 총가치각도기 → 경쟁사분석 → 총가치각도기 돌아오면 또 로딩

## T1. SWR 도입 + 전체 페이지 전환
### 파일
- `package.json` (SWR 추가)
- `src/app/(main)/protractor/real-dashboard.tsx` (총가치각도기)
- `src/app/(main)/dashboard/v0-dashboard.tsx` (대시보드)
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` (경쟁사분석)
- `src/app/(main)/protractor/components/benchmark-admin.tsx` (벤치마크)
- `src/app/(main)/protractor/components/content-ranking.tsx` (콘텐츠랭킹)
- `src/app/(main)/admin/content/page.tsx` (큐레이션)
- `src/app/(main)/admin/accounts/accounts-client.tsx` (회원관리)
- `src/app/(main)/admin/knowledge/page.tsx` (정보공유)
- `src/app/(main)/posts/[id]/PostDetailClient.tsx` (게시글 상세)
- 기타 `useEffect` + `fetch` 패턴 사용하는 모든 페이지
### 현재 동작
- 페이지 마운트 시 `useEffect`에서 `fetch()` → `setState()` → 매번 로딩 스피너
### 기대 동작
- SWR의 `staleTime`/`dedupingInterval` 활용해서 이미 가져온 데이터는 즉시 표시
- 백그라운드에서 revalidation (stale-while-revalidate 패턴)
- 페이지 전환 후 돌아와도 캐시된 데이터 즉시 렌더링 → 로딩 없음
### 하지 말 것
- 기존 API route 변경하지 마라 (클라이언트만 수정)
- 전역 상태 관리 라이브러리(Redux, Zustand) 추가하지 마라
- 데이터 무결성 이슈: 관리자가 데이터 변경한 경우 적절히 revalidate 되어야 함

## 검증 기준
- 총가치각도기 → 경쟁사분석 → 총가치각도기: 돌아왔을 때 로딩 없이 즉시 표시
- 모든 사이드바 메뉴 전환 시 이전 데이터 캐시 유지
- 데이터 변경 후(예: 콘텐츠 발행) 해당 페이지 재방문 시 업데이트 반영
- tsc --noEmit + next lint 통과
