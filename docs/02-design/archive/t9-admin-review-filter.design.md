# T9. 관리자 후기 목록 필터 UI 누락 — Design

> 최종 갱신: 2026-03-01

## 1. 데이터 모델

변경 없음. 기존 `getReviewsAdmin()`이 반환하는 전체 데이터를 클라이언트에서 필터링.

### 기존 getReviewsAdmin 응답 구조
```typescript
interface Review {
  id: string;
  title: string;
  content: string;
  created_at: string | null;
  cohort: string | null;        // ← 필터 대상
  category: string;             // ← 필터 대상
  rating: number | null;
  youtube_url: string | null;
  is_pinned: boolean;
  author: { name: string } | null;
}
```

## 2. API 설계

**변경 없음**. 기존 `getReviewsAdmin()` 서버 액션을 그대로 사용.

- TASK.md 지침: "API 엔드포인트 추가 금지 — 기존 데이터에서 클라이언트 필터링"
- `getReviewsAdmin()`은 전체 리뷰를 `is_pinned DESC, created_at DESC`로 반환
- 클라이언트 상태로 필터링만 추가

## 3. 컴포넌트 구조

### 수정 대상: `AdminReviewsPage` 컴포넌트

**파일**: `src/app/(main)/admin/reviews/page.tsx`

#### 3-1. 필터 상태 추가

```typescript
const [cohortFilter, setCohortFilter] = useState("");       // "" = 전체
const [categoryFilter, setCategoryFilter] = useState("");   // "" = 전체
```

#### 3-2. 필터링 로직

```typescript
import { useMemo } from "react";

const filteredReviews = useMemo(() => {
  return reviews.filter((review) => {
    if (cohortFilter && review.cohort !== cohortFilter) return false;
    if (categoryFilter && review.category !== categoryFilter) return false;
    return true;
  });
}, [reviews, cohortFilter, categoryFilter]);
```

- `filteredReviews`를 테이블 렌더링에 사용 (기존 `reviews` 대체)
- 고정(pin) 순서는 `getReviewsAdmin()`에서 이미 정렬됨 → 필터링만 하면 순서 유지

#### 3-3. 필터 바 UI

테이블 상단, 헤더와 테이블 사이에 배치:

```
┌──────────────────────────────────────────────────────────┐
│  수강후기 관리                            [+ 후기 등록]   │
├──────────────────────────────────────────────────────────┤
│  [기수 전체 ▼]  [카테고리 전체 ▼]          총 N개의 후기  │
├──────────────────────────────────────────────────────────┤
│  제목 | 작성자 | 기수 | 카테고리 | 별점 | 날짜 | 고정 | 삭제│
│  ...                                                     │
└──────────────────────────────────────────────────────────┘
```

```tsx
{/* 필터 바 — 테이블 바로 위 */}
<div className="flex flex-wrap items-center gap-3 mb-4">
  <select
    value={cohortFilter}
    onChange={(e) => setCohortFilter(e.target.value)}
    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700
               focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
  >
    <option value="">기수 전체</option>
    {["1기", "2기", "3기", "4기", "5기"].map((opt) => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
  </select>

  <select
    value={categoryFilter}
    onChange={(e) => setCategoryFilter(e.target.value)}
    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700
               focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
  >
    <option value="">카테고리 전체</option>
    <option value="general">일반후기</option>
    <option value="graduation">졸업후기</option>
    <option value="weekly">주차별 후기</option>
  </select>

  <span className="text-sm text-gray-500 ml-auto">
    총 {filteredReviews.length}개의 후기
  </span>
</div>
```

**스타일 참고**: 수강생 페이지 `review-list-client.tsx`의 select 스타일과 동일:
- `rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm`
- focus: `ring-[#F75D5D]/30 border-[#F75D5D]`

#### 3-4. 테이블 렌더링 변경

```diff
- {reviews.map((review) => (
+ {filteredReviews.map((review) => (
    <tr key={review.id} ...>
```

#### 3-5. 빈 상태 변경

```diff
- {reviews.length === 0 && (
+ {filteredReviews.length === 0 && (
    <tr>
      <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
-       등록된 후기가 없습니다.
+       {reviews.length === 0
+         ? "등록된 후기가 없습니다."
+         : "해당 조건의 후기가 없습니다."}
      </td>
    </tr>
  )}
```

- `reviews.length === 0`: 전체 데이터 없음 → "등록된 후기가 없습니다."
- `filteredReviews.length === 0 && reviews.length > 0`: 필터 결과 없음 → "해당 조건의 후기가 없습니다."

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| 필터 결과 0건 | "해당 조건의 후기가 없습니다." 빈 상태 표시 |
| 전체 데이터 0건 | 기존 "등록된 후기가 없습니다." 유지 |
| 고정/삭제 후 필터 유지 | `fetchReviews()` → reviews 갱신 → filteredReviews 자동 재계산 (useMemo) |

## 5. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/app/(main)/admin/reviews/page.tsx` | 필터 상태 + 필터 UI + filteredReviews 로직 추가 |

- 서버 액션 변경 없음
- 다른 페이지 영향 없음
- import 추가: `useMemo` (react에서)

## 6. 구현 순서

1. [ ] `page.tsx` — import에 `useMemo` 추가
2. [ ] `page.tsx` — `cohortFilter`, `categoryFilter` useState 추가
3. [ ] `page.tsx` — `filteredReviews` useMemo 추가
4. [ ] `page.tsx` — 필터 바 UI 추가 (헤더와 테이블 사이)
5. [ ] `page.tsx` — 테이블 렌더링에 `filteredReviews` 사용
6. [ ] `page.tsx` — 빈 상태 메시지 분기 처리
7. [ ] 빌드 확인 (`npm run build`)
