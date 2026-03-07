# 블루프린트 커리큘럼 뷰 개선 Plan

## 요구사항
커리큘럼 뷰에서 블루프린트 68건이 레벨별(입문/실전/분석)로 정확히 그룹핑되어 표시되도록 수정

## 범위
- `src/components/curation/curriculum-view.tsx` 1개 파일만 수정

## 성공 기준
1. parseLevel이 title regex 대신 category 필드 기반으로 그룹핑
2. category: level1_입문 -> "입문", level2_실전 -> "실전", level3_분석 -> "분석", general/null -> "기타"
3. 그룹 정렬 순서: 입문 -> 실전 -> 분석 -> 기타
4. 각 그룹 내 title 가나다순 정렬
5. tsc + lint + build 성공

## 태스크
- T1: parseLevel을 category 기반으로 변경
- T2: 그룹 정렬 순서 수정 (입문/실전/분석/기타)
