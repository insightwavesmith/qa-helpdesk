# C3. 베스트 후기 — Plan

> 작성: 2026-03-02
> 선행 작업: reviews-enhancement (implementing) — B1~B4 구현 완료 상태
> 의존성: C2(후기 기수 자동 입력)와 독립적 — 병렬 가능

## 1. 개요
- **기능**: 관리자가 베스트 후기를 선정하고 후기 목록 상단에 하이라이트 노출
- **해결하려는 문제**: 모든 후기가 동일하게 표시되어 우수 후기를 강조할 수 없음
- **참고**: 기존 `is_pinned` 필드와 별도 기능. is_pinned=고정(상단 배치), is_featured=베스트(하이라이트 표시).

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **DB 컬럼 추가** — reviews 테이블에 `is_featured` boolean (default false) + `featured_order` integer 컬럼 추가
- FR-02: **관리자 베스트 토글** — 관리자 후기 관리 페이지에서 베스트 선정/해제 토글 버튼
- FR-03: **베스트 후기 상단 하이라이트** — 후기 목록 페이지에서 베스트 후기를 상단에 하이라이트 표시 (뱃지 또는 배경색 구분)
- FR-04: **최대 5개 제한** — 베스트 후기는 최대 5개까지만 선정 가능
- FR-05: **순서 관리** — featured_order로 베스트 후기 간 표시 순서 관리

### 비기능적 요구사항
- 기존 후기 데이터 변경 없음
- 후기 작성 폼 변경 없음 (C2와 별개)
- is_pinned 기능과 독립적으로 작동

## 3. 범위

### 포함
- DB 마이그레이션 (is_featured, featured_order 컬럼 추가)
- `src/types/database.ts` 타입 업데이트
- `src/actions/reviews.ts` — 베스트 토글 액션, 목록 조회 시 베스트 우선 정렬
- `src/app/(main)/admin/reviews/page.tsx` — 베스트 토글 버튼 추가
- `src/app/(main)/reviews/review-list-client.tsx` — 베스트 후기 하이라이트 UI

### 제외
- 기존 후기 데이터 변경
- 후기 작성 폼 변경
- is_pinned 기능 변경

## 4. 성공 기준
- [ ] reviews 테이블에 is_featured, featured_order 컬럼 존재
- [ ] 관리자가 베스트 토글 버튼으로 후기를 베스트 선정/해제 가능
- [ ] 베스트 5개 초과 선정 시 경고/차단
- [ ] 후기 목록에서 베스트 후기가 상단에 하이라이트 표시
- [ ] 베스트 후기에 뱃지 또는 배경색 구분이 있음
- [ ] featured_order 순서대로 베스트 후기 정렬
- [ ] 기존 후기/is_pinned 기능 정상 작동
- [ ] `npm run build` 성공

## 5. 실행 순서
1. DB 마이그레이션 — is_featured, featured_order 컬럼 추가
2. `database.ts` 타입 업데이트
3. `reviews.ts` — toggleFeaturedReview 액션 추가 + getReviews 정렬 로직 수정
4. `admin/reviews/page.tsx` — 베스트 토글 버튼 추가
5. `review-list-client.tsx` — 베스트 후기 하이라이트 UI 추가
6. 빌드 확인
