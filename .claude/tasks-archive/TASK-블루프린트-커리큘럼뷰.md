# TASK: 블루프린트 커리큘럼 뷰 개선

## 목표
커리큘럼 뷰에서 블루프린트 68건이 레벨별(입문/실전/분석)로 정확히 그룹핑되어 표시되도록 수정

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. parseLevel을 category 기반으로 변경
### 파일
`src/components/curation/curriculum-view.tsx`
### 현재 동작
`parseLevel(title)`이 제목에서 "초급/고급" 키워드를 regex로 찾아서 그룹핑 → 63건이 "전체 시퀀스"에 몰림
### 기대 동작
DB의 `category` 필드를 기준으로 그룹핑. category 값:
- `level1_입문` → "입문" 그룹
- `level2_실전` → "실전" 그룹
- `level3_분석` → "분석" 그룹
- `general` (기존 미분류) → "기타" 그룹
### 하지 말 것
title regex 매칭을 완전히 제거하되, category가 null/빈값인 경우 fallback으로 "기타" 처리

## T2. 그룹 정렬 순서
### 파일
`src/components/curation/curriculum-view.tsx`
### 현재 동작
["초급", "중급", "고급", "전체"] 순서
### 기대 동작
["입문", "실전", "분석", "기타"] 순서. 각 그룹 내에서는 title 가나다순 정렬.
### 하지 말 것
하드코딩 외 복잡한 정렬 로직 불필요
