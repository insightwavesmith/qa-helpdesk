# C2. 후기 기수 자동 입력 — 설계서

> 작성: 2026-03-02
> 참조: reviews-enhancement.design.md

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)
- 기존 활용: `profiles.cohort` (string | null, 예: "3기")
- 기존 활용: `reviews.cohort` (string | null)

## 2. API 설계
- 해당 없음 (API 변경 없음)
- 기존 활용: 사용자 프로필 데이터는 서버 컴포넌트에서 Supabase `auth.getUser()` + profiles 조회로 이미 사용 중

## 3. 컴포넌트 구조

### 3-1. 드롭다운 옵션 확장

**파일**: `src/app/(main)/reviews/new/new-review-form.tsx`

**현재**:
```tsx
const COHORT_OPTIONS = ["선택 안함", "1기", "2기", "3기", "4기", "5기"];
```

**수정 후**:
```tsx
const COHORT_OPTIONS = ["선택 안함", "1기", "2기", "3기", "4기", "5기", "6기", "7기", "8기", "9기", "10기"];
```

### 3-2. 사용자 cohort 전달 방식

**방안**: 서버 컴포넌트 → 클라이언트 컴포넌트 prop 전달

**파일**: `src/app/(main)/reviews/new/page.tsx` (서버 컴포넌트)

현재 이 페이지에서 사용자 인증 확인 후 `NewReviewForm`을 렌더링. 여기서 profiles.cohort를 조회하여 prop으로 전달.

```tsx
// page.tsx (서버 컴포넌트)
import { createClient } from "@/lib/supabase/server";
import NewReviewForm from "./new-review-form";

export default async function NewReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // redirect to login (기존 로직)
  }

  // 프로필에서 cohort 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("cohort")
    .eq("id", user.id)
    .single();

  const userCohort = profile?.cohort ?? null; // "3기" | null

  return <NewReviewForm defaultCohort={userCohort} />;
}
```

### 3-3. NewReviewForm prop 추가

**파일**: `src/app/(main)/reviews/new/new-review-form.tsx`

**현재 Props**:
```tsx
// props 없음 또는 최소 props
export default function NewReviewForm() {
  const [cohort, setCohort] = useState("선택 안함");
  // ...
}
```

**수정 후**:
```tsx
interface NewReviewFormProps {
  defaultCohort?: string | null; // "3기" 등 profiles.cohort 값
}

export default function NewReviewForm({ defaultCohort }: NewReviewFormProps) {
  // 초기값: defaultCohort가 COHORT_OPTIONS에 포함되면 해당 값, 아니면 "선택 안함"
  const initialCohort = defaultCohort && COHORT_OPTIONS.includes(defaultCohort)
    ? defaultCohort
    : "선택 안함";

  const [cohort, setCohort] = useState(initialCohort);
  // ...
}
```

**동작 흐름**:
1. 서버 컴포넌트에서 `profiles.cohort` 조회 → `"3기"` 또는 `null`
2. `NewReviewForm`에 `defaultCohort="3기"` 전달
3. `useState("3기")` 로 초기화 → 드롭다운에 "3기" 자동 선택
4. 사용자가 수동으로 변경 가능 (`setCohort` 호출)
5. `profiles.cohort`가 null인 경우 → `"선택 안함"` 기본값

### 3-4. review-list-client.tsx 필터 옵션 확장

**파일**: `src/app/(main)/reviews/review-list-client.tsx`

**현재**:
```tsx
const COHORT_FILTER_OPTIONS = ["전체", "1기", "2기", "3기", "4기", "5기"];
```

**수정 후**:
```tsx
const COHORT_FILTER_OPTIONS = ["전체", "1기", "2기", "3기", "4기", "5기", "6기", "7기", "8기", "9기", "10기"];
```

### 3-5. admin/reviews 필터 옵션 확장

**파일**: `src/app/(main)/admin/reviews/page.tsx`

관리자 후기 관리 페이지의 기수 필터 옵션도 동일하게 확장:

```tsx
// Before
const COHORT_FILTER_OPTIONS = ["전체", "1기", "2기", "3기", "4기", "5기"];

// After
const COHORT_FILTER_OPTIONS = ["전체", "1기", "2기", "3기", "4기", "5기", "6기", "7기", "8기", "9기", "10기"];
```

## 4. 에러 처리
- `profiles.cohort`가 null → `"선택 안함"` 기본값 (기존 동작과 동일)
- `profiles.cohort` 값이 COHORT_OPTIONS에 없는 경우 (예: "11기") → `"선택 안함"` 기본값
- 프로필 조회 실패 → `defaultCohort` null 전달 → `"선택 안함"` 기본값

## 5. 구현 순서
- [ ] `new-review-form.tsx` — COHORT_OPTIONS 1기~10기로 확장
- [ ] `new-review-form.tsx` — `defaultCohort` prop 추가 + `useState(initialCohort)` 변경
- [ ] `page.tsx` (서버 컴포넌트) — profiles.cohort 조회 + prop 전달
- [ ] `review-list-client.tsx` — COHORT_FILTER_OPTIONS 확장
- [ ] `admin/reviews/page.tsx` — 기수 필터 옵션 확장
- [ ] `npm run build` 성공 확인

## 6. 변경 요약

| 파일 | 변경 내용 |
|------|----------|
| `new-review-form.tsx` | COHORT_OPTIONS 확장 + defaultCohort prop + useState 초기값 |
| `reviews/new/page.tsx` | profiles.cohort 조회 + prop 전달 |
| `review-list-client.tsx` | COHORT_FILTER_OPTIONS 확장 |
| `admin/reviews/page.tsx` | 기수 필터 옵션 확장 |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/app/(main)/reviews/new/new-review-form.tsx` | prop 추가 + 상수 변경 | 낮음 |
| `src/app/(main)/reviews/new/page.tsx` | DB 조회 1줄 추가 + prop 전달 | 낮음 |
| `src/app/(main)/reviews/review-list-client.tsx` | 상수 확장 | 매우 낮음 |
| `src/app/(main)/admin/reviews/page.tsx` | 상수 확장 | 매우 낮음 |

- reviews 테이블 구조: 변경 없음
- 기존 후기 데이터: 영향 없음
- 폼 레이아웃: 변경 없음
