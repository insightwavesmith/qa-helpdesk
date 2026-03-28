# 수강후기 탭 강화 설계서

> 작성: 2026-03-01

## 1. 데이터 모델

### reviews 테이블 변경 (ALTER)
```sql
ALTER TABLE reviews ADD COLUMN cohort TEXT;           -- '1기', '2기', ...
ALTER TABLE reviews ADD COLUMN category TEXT NOT NULL DEFAULT 'general';  -- 'general' | 'graduation' | 'weekly'
ALTER TABLE reviews ADD COLUMN rating INT CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE reviews ADD COLUMN youtube_url TEXT;
ALTER TABLE reviews ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
```
- 기존 데이터: cohort=null, category='general', rating=null, youtube_url=null, is_pinned=false

### TypeScript 타입 (database.ts 업데이트)
```typescript
// reviews Row에 추가
cohort: string | null
category: string        // 'general' | 'graduation' | 'weekly'
rating: number | null
youtube_url: string | null
is_pinned: boolean
```

## 2. API 설계 (Server Actions)

### reviews.ts 수정
- `getReviews(page, pageSize, filters?)`: 필터 파라미터 추가
  - `filters: { cohort?: string, category?: string, sortBy?: 'latest' | 'rating' }`
  - is_pinned=true 항목 최상단 고정
  - sortBy='rating': rating DESC NULLS LAST, created_at DESC
- `createReview(data)`: cohort, category, rating 필드 추가
- `createAdminReview(data)`: 관리자 전용 — youtube_url, cohort, category 포함
- `togglePinReview(id)`: is_pinned 토글 (관리자 전용)
- `deleteReview(id)`: 기존 유지

## 3. 컴포넌트 구조

### B1: 작성폼 수정
- **파일**: `src/app/(main)/reviews/new/new-review-form.tsx`
- 추가 필드:
  - 기수 Select: "선택안함", "1기"~"5기" + 직접입력 옵션
  - 카테고리 RadioGroup: 일반후기 / 졸업후기 / 주차별 후기
  - 별점 StarRating: 클릭으로 1~5 별 선택 (선택사항)

### B2: 필터 UI
- **파일**: `src/app/(main)/reviews/review-list-client.tsx` 수정
- 상단 필터바:
  - 기수 Select (전체 / 1기 / 2기 / ...)
  - 카테고리 Select (전체 / 일반 / 졸업 / 주차별)
  - 정렬 Select (최신순 / 별점 높은순)
- 후기 카드에 기수 배지 + 별점 표시
- 영상 후기 카드에 🎬 아이콘

### B3: 유튜브 임베드
- **파일**: `src/app/(main)/reviews/[id]/ReviewDetailClient.tsx` 수정
- youtube_url이 있으면 상단에 반응형 iframe (16:9, max-width 100%)
- URL 파싱: youtube.com/watch?v=ID 또는 youtu.be/ID → embed URL 변환

### B4: 관리자 페이지
- **파일**: `src/app/(main)/admin/reviews/page.tsx` (신규)
- 테이블: 제목, 작성자, 기수, 카테고리, 별점, 날짜, 고정여부, 액션
- 유튜브 후기 등록 모달: 제목, 유튜브 URL, 기수, 카테고리
- 고정/해제 토글 버튼
- 삭제 버튼 (confirm)

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| 유효하지 않은 유튜브 URL | 클라이언트 검증 (정규식) + 에러 메시지 |
| 별점 범위 초과 | DB CHECK 제약 + 클라이언트 검증 |
| 비관리자 유튜브 후기 등록 시도 | role 체크 → 403 |
| 필터 적용 결과 없음 | "해당 조건의 후기가 없습니다" 빈 상태 표시 |

## 5. 구현 순서
1. [x] SQL 마이그레이션 (ALTER TABLE)
2. [x] database.ts 타입 업데이트
3. [x] reviews.ts 서버 액션 수정/추가
4. [x] new-review-form.tsx 필드 추가 (기수/카테고리/별점)
5. [x] review-list-client.tsx 필터 + 카드 UI 업데이트
6. [x] ReviewDetailClient.tsx 유튜브 임베드 + 기수/별점 표시
7. [x] /admin/reviews 페이지 신규
8. [x] Sidebar에 관리자 메뉴 추가
