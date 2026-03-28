# C2. 후기 기수 자동 입력 — Plan

> 작성: 2026-03-02
> 선행 작업: reviews-enhancement (implementing) — B1(기수/카테고리/별점 추가) 완료 상태

## 1. 개요
- **기능**: 수강생이 후기 작성 시 기수를 자동으로 채워주기
- **해결하려는 문제**: 현재 기수 드롭다운에서 수동 선택만 가능하며 1기~5기 하드코딩. profiles 테이블에 cohort 필드가 있으나 후기 작성 폼에서 활용하지 않음.
- **수정 대상**: `src/app/(main)/reviews/new/new-review-form.tsx`

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **자동 기수 세팅** — 후기 작성 폼 진입 시 현재 로그인 수강생의 `profiles.cohort` 값을 기수 드롭다운 기본값으로 자동 세팅
- FR-02: **수동 변경 가능** — 자동 세팅 후에도 수강생이 직접 다른 기수로 변경 가능
- FR-03: **드롭다운 확장** — 1기~5기 → 1기~10기로 확장

### 비기능적 요구사항
- 후기 작성 폼 레이아웃 변경 금지
- reviews 테이블 구조 변경 금지
- 기존 후기 데이터 영향 없음

## 3. 범위

### 포함
- `src/app/(main)/reviews/new/new-review-form.tsx` — 드롭다운 확장 + cohort 자동 세팅
- 사용자 프로필 cohort 값 전달 (서버 → 클라이언트)

### 제외
- 후기 작성 폼 레이아웃 변경
- reviews 테이블 구조 변경
- 다른 후기 관련 컴포넌트 변경

## 4. 성공 기준
- [ ] 후기 작성 폼 진입 시 로그인 수강생의 profiles.cohort 값이 기수 드롭다운에 자동 선택됨
- [ ] profiles.cohort가 null인 경우 "선택 안함"이 기본값
- [ ] 수동으로 다른 기수 선택 가능
- [ ] 드롭다운에 1기~10기 표시
- [ ] 폼 레이아웃 변경 없음
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `new-review-form.tsx`의 COHORT_OPTIONS 확장 (1기~10기)
2. 부모 컴포넌트/페이지에서 사용자 profile cohort 값을 prop으로 전달
3. `new-review-form.tsx`에서 초기 cohort 값을 prop으로 받아 기본값 설정
4. 빌드 확인
