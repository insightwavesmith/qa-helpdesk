# 블루프린트 커리큘럼 뷰 개선 설계서

## 1. 데이터 모델
- 기존 `contents.category` 필드 사용 (DB 실제 값: `level1_입문`, `level2_실전`, `level3_분석`, `general`)
- TypeScript `ContentCategory` 타입은 deprecated이므로, category를 string으로 처리

## 2. API 설계
- 변경 없음. getCurriculumContents()가 `select("*")`로 category 포함 반환

## 3. 컴포넌트 구조

### 변경 대상: `curriculum-view.tsx`

#### T1: parseLevelFromCategory 함수
```typescript
// 기존 parseLevel(title: string) 제거
// 새 함수: category 기반 레벨 결정
function parseLevelFromCategory(category: string | null | undefined): string {
  if (category === "level1_입문") return "입문";
  if (category === "level2_실전") return "실전";
  if (category === "level3_분석") return "분석";
  return "기타";
}
```

#### T2: groupByLevel 수정
- order 배열: `["입문", "실전", "분석", "기타"]`
- 각 그룹 내 items를 `title` 가나다순(localeCompare) 정렬
- LEVEL_ICONS 맵 업데이트: 입문(green), 실전(blue), 분석(red), 기타(gray)
- levelLabel 로직 수정: "기타" 그룹 라벨은 "기타"

## 4. 에러 처리
- category가 null/undefined/빈값일 경우 "기타" 그룹으로 fallback

## 5. 구현 순서
1. parseLevel -> parseLevelFromCategory 교체
2. LEVEL_ICONS 키 업데이트
3. groupByLevel 내 order 배열 + 정렬 로직 수정
4. JSX에서 levelLabel 로직 수정
