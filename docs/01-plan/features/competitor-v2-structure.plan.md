# 경쟁사 분석기 v2 — T1 구조 리팩토링 Plan

## 배경
v2 기능(브랜드 검색, 선택 다운로드, NEW 알림 등)을 수용할 수 있도록 데이터 구조와 API 레이어를 먼저 잡는다.
UI 변경 없이 API, 타입, DB, 유틸만 정리.

## 범위
- T1.1: 타입 정의 확장 (BrandPage, SearchMode, CompetitorMonitor 필드 추가)
- T1.2: SearchAPI.io 클라이언트 확장 (searchBrandPages, searchPageIds 지원)
- T1.3: 브랜드 검색 API 라우트 신규 (`/api/competitor/brands`)
- T1.4: 검색 API 라우트에 page_id 파라미터 추가
- T1.5: DB 마이그레이션 (competitor_monitors 컬럼 추가)

## 성공 기준
- npm run build 성공
- tsc --noEmit 통과
- 기존 경쟁사 분석기 기능 정상 (하위 호환)
- `/api/competitor/brands?q=올리브영` 동작
- `/api/competitor/search?q=올리브영&page_id=xxx` 동작

## 제약
- UI 변경 금지
- 기존 API 응답 포맷 유지
- 새 환경변수 추가 금지

## 수정 대상 파일
1. `src/types/competitor.ts` — 타입 추가 (기존 타입 삭제 없음)
2. `src/lib/competitor/meta-ad-library.ts` — searchBrandPages 추가, SearchParams 확장
3. `src/app/api/competitor/brands/route.ts` — 신규
4. `src/app/api/competitor/search/route.ts` — page_id 파라미터 추가
5. `supabase/migrations/20260308_competitor_monitors_v2.sql` — 신규
6. `docs/.pdca-status.json` — 상태 업데이트
