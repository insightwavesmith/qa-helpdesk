# C3. 베스트 후기 — 설계서

> 작성: 2026-03-02
> 참조: reviews-enhancement.design.md

## 1. 데이터 모델

### 1-1. reviews 테이블 컬럼 추가

```sql
-- 마이그레이션
ALTER TABLE reviews
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reviews
  ADD COLUMN featured_order INTEGER DEFAULT NULL;

-- 인덱스 (베스트 후기 조회 최적화)
CREATE INDEX idx_reviews_featured ON reviews (is_featured, featured_order)
  WHERE is_featured = true;

-- 코멘트
COMMENT ON COLUMN reviews.is_featured IS '베스트 후기 선정 여부';
COMMENT ON COLUMN reviews.featured_order IS '베스트 후기 표시 순서 (1=최상단, NULL=미선정)';
```

### 1-2. RLS 정책
- 기존 reviews RLS 정책 유지
- is_featured, featured_order는 SELECT에서 모든 사용자 읽기 가능 (기존 정책)
- UPDATE는 admin 역할만 (기존 정책)

### 1-3. TypeScript 타입

**파일**: `src/types/database.ts`

reviews Row 타입에 추가:
```typescript
reviews: {
  Row: {
    // ... 기존 필드
    is_featured: boolean          // 베스트 후기 여부
    featured_order: number | null // 표시 순서 (1~5, null=미선정)
  }
  Insert: {
    // ... 기존 필드
    is_featured?: boolean
    featured_order?: number | null
  }
  Update: {
    // ... 기존 필드
    is_featured?: boolean
    featured_order?: number | null
  }
}
```

## 2. API 설계 (Server Actions)

### 2-1. toggleFeaturedReview (신규)

**파일**: `src/actions/reviews.ts`

```typescript
export async function toggleFeaturedReview(reviewId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();

  // 1. 현재 상태 조회
  const { data: review } = await supabase
    .from("reviews")
    .select("is_featured")
    .eq("id", reviewId)
    .single();

  if (!review) return { success: false, error: "후기를 찾을 수 없습니다." };

  if (review.is_featured) {
    // 해제: is_featured=false, featured_order=null
    await supabase
      .from("reviews")
      .update({ is_featured: false, featured_order: null })
      .eq("id", reviewId);

    // 나머지 베스트 후기 순서 재정렬
    await reorderFeaturedReviews(supabase);
  } else {
    // 선정: 최대 5개 확인
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("is_featured", true);

    if ((count ?? 0) >= 5) {
      return { success: false, error: "베스트 후기는 최대 5개까지 선정할 수 있습니다." };
    }

    // 다음 순서 번호 결정
    const { data: maxOrder } = await supabase
      .from("reviews")
      .select("featured_order")
      .eq("is_featured", true)
      .order("featured_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.featured_order ?? 0) + 1;

    await supabase
      .from("reviews")
      .update({ is_featured: true, featured_order: nextOrder })
      .eq("id", reviewId);
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { success: true };
}
```

### 2-2. reorderFeaturedReviews (내부 헬퍼)

```typescript
async function reorderFeaturedReviews(supabase: SupabaseClient) {
  const { data: featured } = await supabase
    .from("reviews")
    .select("id, featured_order")
    .eq("is_featured", true)
    .order("featured_order", { ascending: true });

  if (!featured) return;

  // 순서 재정렬 (1, 2, 3, ...)
  for (let i = 0; i < featured.length; i++) {
    if (featured[i].featured_order !== i + 1) {
      await supabase
        .from("reviews")
        .update({ featured_order: i + 1 })
        .eq("id", featured[i].id);
    }
  }
}
```

### 2-3. getReviews 정렬 수정

**파일**: `src/actions/reviews.ts`

현재 정렬: `is_pinned DESC → sortBy(latest/rating)`

수정 후 정렬: `is_featured DESC → featured_order ASC → is_pinned DESC → sortBy(latest/rating)`

```typescript
// Before
query = query
  .order("is_pinned", { ascending: false })
  .order("created_at", { ascending: false });

// After
query = query
  .order("is_featured", { ascending: false })
  .order("featured_order", { ascending: true, nullsFirst: false })
  .order("is_pinned", { ascending: false })
  .order("created_at", { ascending: false });
```

## 3. 컴포넌트 구조

### 3-1. 관리자 베스트 토글 버튼

**파일**: `src/app/(main)/admin/reviews/page.tsx`

기존 고정(Pin) 토글 버튼 옆에 베스트(Featured) 토글 버튼 추가:

```tsx
// 테이블 헤더에 "베스트" 컬럼 추가
<th>베스트</th>

// 테이블 행에 토글 버튼 추가
<td>
  <button
    onClick={() => handleToggleFeatured(review.id)}
    className={`
      px-2 py-1 rounded text-xs font-medium
      ${review.is_featured
        ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
        : "bg-gray-50 text-gray-400 border border-gray-200"
      }
    `}
    title={review.is_featured ? "베스트 해제" : "베스트 선정"}
  >
    {review.is_featured ? `⭐ ${review.featured_order}` : "선정"}
  </button>
</td>
```

**핸들러**:
```tsx
async function handleToggleFeatured(reviewId: string) {
  const result = await toggleFeaturedReview(reviewId);
  if (!result.success) {
    alert(result.error); // 또는 toast
  }
}
```

### 3-2. 후기 목록 하이라이트

**파일**: `src/app/(main)/reviews/review-list-client.tsx`

베스트 후기 카드에 하이라이트 스타일 + 뱃지 추가:

```tsx
// 카드 래퍼
<div className={`
  rounded-xl border p-4 transition
  ${review.is_featured
    ? "border-yellow-300 bg-yellow-50/50 ring-1 ring-yellow-200"
    : "border-gray-100 bg-white"
  }
`}>
  {/* 베스트 뱃지 */}
  {review.is_featured && (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 mb-2">
      ⭐ 베스트 후기
    </span>
  )}

  {/* 기존 카드 내용 */}
  {review.is_pinned && (
    <span className="...">📌 고정</span>
  )}
  {/* ... title, content, cohort, rating 등 */}
</div>
```

**정렬 반영**: 서버에서 `is_featured DESC, featured_order ASC` 정렬이 이미 적용되므로, 클라이언트에서 추가 정렬 불필요. 베스트 후기가 자연스럽게 최상단에 위치.

### 3-3. 베스트 후기 섹션 분리 (선택)

베스트 후기를 일반 후기와 시각적으로 더 강하게 구분하고 싶다면:

```tsx
{/* 베스트 후기 섹션 */}
{featuredReviews.length > 0 && (
  <section className="mb-8">
    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
      ⭐ 베스트 후기
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {featuredReviews.map(review => <ReviewCard key={review.id} review={review} />)}
    </div>
  </section>
)}

{/* 전체 후기 */}
<section>
  <h2 className="text-lg font-bold text-gray-900 mb-4">전체 후기</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {allReviews.map(review => <ReviewCard key={review.id} review={review} />)}
  </div>
</section>
```

> 이 분리 방식은 선택 사항. 기본 구현은 하이라이트 카드 방식 (3-2) 사용.

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| 베스트 6개째 선정 시도 | `toggleFeaturedReview` → `{ success: false, error: "최대 5개" }` → alert |
| 후기 ID 없음 | `{ success: false, error: "후기를 찾을 수 없습니다" }` |
| DB 에러 | `{ success: false, error: "처리 중 오류가 발생했습니다" }` |
| featured_order 동기화 깨짐 | `reorderFeaturedReviews`로 자동 복구 |

## 5. 구현 순서
- [ ] Supabase 마이그레이션 — `is_featured` boolean + `featured_order` integer + 인덱스 추가
- [ ] `src/types/database.ts` — reviews 타입에 is_featured, featured_order 추가
- [ ] `src/actions/reviews.ts` — `toggleFeaturedReview` 액션 + `reorderFeaturedReviews` 헬퍼 추가
- [ ] `src/actions/reviews.ts` — `getReviews` 정렬 로직에 is_featured 우선 정렬 추가
- [ ] `src/app/(main)/admin/reviews/page.tsx` — 베스트 토글 버튼 + 컬럼 추가
- [ ] `src/app/(main)/reviews/review-list-client.tsx` — 베스트 카드 하이라이트 + 뱃지 추가
- [ ] `npm run build` 성공 확인

## 6. 정렬 우선순위 (최종)

```
1. is_featured DESC       (베스트 먼저)
2. featured_order ASC     (베스트 간 순서)
3. is_pinned DESC         (고정 먼저)
4. sortBy:
   - latest: created_at DESC
   - rating: rating DESC NULLS LAST, created_at DESC
```

## 7. is_pinned vs is_featured 구분

| 구분 | is_pinned (기존) | is_featured (신규) |
|------|-----------------|-------------------|
| 용도 | 관리자 임의 고정 | 베스트 후기 선정 |
| 최대 개수 | 제한 없음 | 5개 |
| UI 표현 | 📌 고정 뱃지 | ⭐ 베스트 뱃지 + 하이라이트 배경 |
| 순서 관리 | 없음 | featured_order |
| 정렬 우선 | 3순위 | 1순위 (최상단) |

## 8. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| DB 마이그레이션 | 컬럼 추가 (기존 데이터 영향 없음) | 낮음 |
| `src/types/database.ts` | 타입 필드 추가 | 낮음 |
| `src/actions/reviews.ts` | 액션 추가 + 정렬 수정 | 중간 |
| `src/app/(main)/admin/reviews/page.tsx` | 토글 버튼 + 컬럼 추가 | 낮음 |
| `src/app/(main)/reviews/review-list-client.tsx` | 하이라이트 UI 추가 | 낮음 |

- 기존 후기 데이터: is_featured=false, featured_order=null (기본값)
- 후기 작성 폼: 변경 없음
- is_pinned 기능: 독립적 작동 유지
