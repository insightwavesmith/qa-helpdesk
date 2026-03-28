# 경쟁사 분석기 v2 — T3 필터·정렬·페이지네이션 Plan

## 배경
T1(구조), T2(검색UI) 완료. 소재 유형 필터가 이미지+슬라이드를 합치고 있어 분리 필요.
정렬 옵션(최신순/운영기간순)과 더보기 페이지네이션이 미구현.

## 범위
- T3.1: 슬라이드(CAROUSEL) 필터 분리 — 기존 "이미지" 필터에서 CAROUSEL 제외, "슬라이드" 칩 추가
- T3.2: 정렬 옵션 — 최신순(기본) / 운영기간순 칩 추가, 클라이언트 정렬
- T3.3: 더보기 페이지네이션 — 이미 구현됨 (검증만)

## 성공 기준
- "이미지" 필터 → IMAGE만 / "슬라이드" → CAROUSEL만 / "영상" → VIDEO만
- 운영기간순 정렬 → durationDays DESC
- 더보기 → 다음 페이지 로드 + append + 전체 건수 표시
- npm run build 성공, tsc 통과

## 제약
- 검색바/다운로드 UI 변경 금지
- API 라우트 변경 금지

## 수정 대상 파일
1. `src/app/(main)/protractor/competitor/components/filter-chips.tsx` — FilterState 확장, 칩 추가
2. `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 정렬 로직, 필터 로직 수정
