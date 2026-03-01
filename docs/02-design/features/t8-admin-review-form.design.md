# T8. 관리자 후기 등록 폼 필드 누락 — Design

> 최종 갱신: 2026-03-01

## 1. 데이터 모델

### reviews 테이블 (변경 없음)
| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | uuid | PK |
| title | text | 제목 (필수) |
| content | text | 내용 (필수) |
| author_id | uuid | 작성자 FK → profiles.id |
| category | text | 카테고리 (general / graduation / weekly) |
| cohort | text | 기수 (nullable) |
| rating | int | 별점 1~5 (nullable, CHECK 제약) |
| youtube_url | text | 유튜브 URL (nullable) |
| is_pinned | boolean | 고정 여부 |

- DB 스키마 변경 없음. rating, content 컬럼은 이미 존재.
- `createAdminReview` 서버 액션에서 이 필드들을 전달하기만 하면 됨.

## 2. API 설계 (Server Action 수정)

### `createAdminReview` 수정 — `src/actions/reviews.ts`

**Before**:
```typescript
export async function createAdminReview(data: {
  title: string;
  content?: string;
  youtubeUrl: string;      // 필수
  cohort?: string | null;
  category?: string;
}) {
  // ...
  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: user.id,
      title: data.title,
      content: data.content || "",
      youtube_url: data.youtubeUrl,
      cohort: data.cohort || null,
      category: data.category || "general",
    })
```

**After**:
```typescript
export async function createAdminReview(data: {
  title: string;
  content: string;          // 필수로 변경
  youtubeUrl?: string;      // 선택으로 변경
  cohort?: string | null;
  category?: string;
  rating?: number | null;   // 추가
}) {
  // ...
  // rating 범위 검증
  if (data.rating != null && (data.rating < 1 || data.rating > 5)) {
    return { error: "별점은 1~5 사이여야 합니다." };
  }

  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: user.id,
      title: data.title,
      content: data.content,
      youtube_url: data.youtubeUrl || null,   // 선택
      cohort: data.cohort || null,
      category: data.category || "general",
      rating: data.rating || null,            // 추가
    })
```

**변경 요약**:
| 파라미터 | Before | After |
|----------|--------|-------|
| content | optional (기본값 "") | **필수** |
| youtubeUrl | **필수** | optional |
| rating | 없음 | **추가** (optional, 1~5) |

## 3. 컴포넌트 구조

### 수정 대상: `YouTubeReviewModal` → `AdminReviewModal`로 역할 확대

**파일**: `src/app/(main)/admin/reviews/page.tsx` 내 `YouTubeReviewModal` 함수

#### 3-1. 폼 필드 구성 (변경 후)

```
┌──────────────────────────────────┐
│  후기 등록                   [X] │
├──────────────────────────────────┤
│  제목 *                          │
│  [________________________]      │
│                                  │
│  내용 *                          │
│  [________________________]      │
│  [________________________]      │
│  [________________________]      │
│                                  │
│  별점                            │
│  ★ ★ ★ ☆ ☆                      │
│                                  │
│  유튜브 URL (선택)               │
│  [________________________]      │
│                                  │
│  기수                            │
│  [선택 안함 ▼]                   │
│                                  │
│  카테고리                        │
│  [일반후기 ▼]                    │
│                                  │
│  [취소]          [등록]          │
└──────────────────────────────────┘
```

#### 3-2. 상태 추가

```typescript
// 기존
const [title, setTitle] = useState("");
const [youtubeUrl, setYoutubeUrl] = useState("");
const [cohort, setCohort] = useState("");
const [category, setCategory] = useState("general");

// 추가
const [content, setContent] = useState("");
const [rating, setRating] = useState<number>(0);  // 0 = 미선택
```

#### 3-3. 내용 textarea

```tsx
<div className="space-y-1.5">
  <label className="block text-sm font-medium text-gray-700">
    내용 <span className="text-red-500">*</span>
  </label>
  <textarea
    placeholder="후기 내용을 입력해주세요"
    value={content}
    onChange={(e) => setContent(e.target.value)}
    required
    rows={4}
    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm
               focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]
               resize-y min-h-[80px]"
  />
</div>
```

#### 3-4. 별점 StarSelector

수강생 폼(`new-review-form.tsx`)의 별 선택 패턴을 참고:

```tsx
<div className="space-y-1.5">
  <label className="block text-sm font-medium text-gray-700">별점</label>
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => setRating(rating === star ? 0 : star)}
        className="p-0.5"
      >
        <Star
          className={`h-6 w-6 cursor-pointer transition-colors ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300 hover:text-yellow-300"
          }`}
        />
      </button>
    ))}
    {rating > 0 && (
      <span className="ml-2 text-sm text-gray-500">{rating}점</span>
    )}
  </div>
</div>
```

- 별 클릭 시 해당 점수 선택, 같은 별 재클릭 시 해제 (0으로)
- 미선택(0)이면 DB에 null로 저장

#### 3-5. 유튜브 URL 필드 변경

```tsx
<div className="space-y-1.5">
  <label className="block text-sm font-medium text-gray-700">유튜브 URL (선택)</label>
  <Input
    placeholder="https://www.youtube.com/watch?v=..."
    value={youtubeUrl}
    onChange={(e) => setYoutubeUrl(e.target.value)}
    // required 제거
  />
</div>
```

#### 3-6. 폼 검증 변경

**Before**:
```typescript
if (!title.trim() || !youtubeUrl.trim()) {
  toast.error("제목과 유튜브 URL을 입력해주세요.");
  return;
}
if (!isValidYouTubeUrl(youtubeUrl)) {
  toast.error("유효한 유튜브 URL을 입력해주세요.");
  return;
}
```

**After**:
```typescript
if (!title.trim()) {
  toast.error("제목을 입력해주세요.");
  return;
}
if (!content.trim()) {
  toast.error("내용을 입력해주세요.");
  return;
}
if (youtubeUrl.trim() && !isValidYouTubeUrl(youtubeUrl)) {
  toast.error("유효한 유튜브 URL을 입력해주세요.");
  return;
}
```

#### 3-7. submit 호출 변경

```typescript
const result = await createAdminReview({
  title: title.trim(),
  content: content.trim(),
  youtubeUrl: youtubeUrl.trim() || undefined,
  cohort: cohort || null,
  category,
  rating: rating > 0 ? rating : null,
});
```

#### 3-8. 버튼/텍스트 변경

| 위치 | Before | After |
|------|--------|-------|
| 헤더 버튼 | `유튜브 후기 등록` | `후기 등록` |
| 모달 제목 | `유튜브 후기 등록` | `후기 등록` |
| 성공 토스트 | `유튜브 후기가 등록되었습니다.` | `후기가 등록되었습니다.` |

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| 제목 미입력 | 클라이언트 검증 → toast("제목을 입력해주세요.") |
| 내용 미입력 | 클라이언트 검증 → toast("내용을 입력해주세요.") |
| 유튜브 URL 입력했으나 형식 무효 | 클라이언트 검증 → toast("유효한 유튜브 URL을 입력해주세요.") |
| 별점 범위 초과 | 서버 검증 → return { error: "별점은 1~5 사이여야 합니다." } |
| 비관리자 접근 | 기존 role 체크 유지 → return { error: "관리자만 후기를 등록할 수 있습니다." } |
| DB insert 실패 | 기존 에러 핸들링 유지 |

## 5. 구현 순서

1. [ ] `src/actions/reviews.ts` — `createAdminReview` 파라미터 수정 (content 필수, youtubeUrl 선택, rating 추가)
2. [ ] `src/app/(main)/admin/reviews/page.tsx` — content textarea 추가
3. [ ] `src/app/(main)/admin/reviews/page.tsx` — rating StarSelector 추가
4. [ ] `src/app/(main)/admin/reviews/page.tsx` — youtubeUrl 선택 입력으로 변경 + 검증 수정
5. [ ] `src/app/(main)/admin/reviews/page.tsx` — 모달 제목/버튼/토스트 텍스트 변경
6. [ ] 빌드 확인 (`npm run build`)
