# 경쟁사 분석기 v2 — T3 필터·정렬·페이지네이션 설계서

## 1. 데이터 모델

### FilterState 확장
```ts
export interface FilterState {
  activeOnly: boolean;
  minDays: number;
  platform: string;
  mediaType: "all" | "image" | "carousel" | "video";  // carousel 추가
  sortBy: "latest" | "duration";  // 신규
}
```

## 2. API 설계
- 변경 없음 (클라이언트 정렬/필터만)

## 3. 컴포넌트 구조

### filter-chips.tsx
- FilterState에 `carousel` mediaType + `sortBy` 추가
- CHIPS 배열에 "📑 슬라이드" 추가 (CAROUSEL 전용)
- "🖼️ 이미지" → IMAGE만 (CAROUSEL 제외)
- 정렬 칩: 구분선(|) 후 "최신순" / "운영기간순"
- 칩 순서: 30일+ / 게재중 / Facebook / Instagram │ 이미지 / 슬라이드 / 영상 │ 최신순 / 운영기간순

### competitor-dashboard.tsx
- FilterState 초기값에 `sortBy: "latest"` 추가
- filteredAds useMemo에 정렬 로직 추가:
  - `latest`: 기본 순서 유지 (API 반환 순서 = start_date DESC)
  - `duration`: durationDays DESC
- mediaType === "image" 필터: displayFormat === "IMAGE"만 (CAROUSEL 제거)
- mediaType === "carousel" 필터: displayFormat === "CAROUSEL"만

### ad-card-list.tsx
- 변경 없음 (더보기 페이지네이션 이미 구현됨)

## 4. 에러 처리
- 추가 에러 없음 (클라이언트 로직만)

## 5. 구현 순서
1. [ ] filter-chips.tsx — FilterState 타입 확장 + 칩 추가
2. [ ] competitor-dashboard.tsx — 초기값 + 필터 + 정렬 로직
3. [ ] 검증 — tsc + lint + build
