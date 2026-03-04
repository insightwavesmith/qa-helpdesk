# F3. 정보공유 placeholder 이미지 제거 — 설계서

> 작성: 2026-03-04
> 참조: TASK.md F3

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계

### 2-1. `/api/unsplash/search` 변경

현재 Unsplash 검색 실패/미찾음 시 placehold.co URL을 반환. null로 변경.

**Before:**
```json
{ "url": "https://placehold.co/800x400?text=query" }
```

**After:**
```json
{ "url": null }
```

적용 위치: `src/app/api/unsplash/search/route.ts`의 4개 placehold.co 폴백 지점

## 3. 컴포넌트 구조

### 3-1. 파일별 변경 상세

#### 파일 1: `src/app/api/admin/curation/generate/route.ts`

**변경 목적**: AI가 이미지 마크다운 태그 자체를 생성하지 않도록 프롬프트 수정

**현재 (L108, L134):**
```
   - `![이미지 설명](IMAGE_PLACEHOLDER)` 1개 (섹션 주제를 시각화하는 이미지)
   ...
- 각 h2 섹션마다 `![이미지 설명](IMAGE_PLACEHOLDER)` 최소 1개 필수
```

**수정 후:**
```
   - 이미지 태그(![...](URL)) 삽입 금지. 텍스트만으로 작성.
   ...
- 이미지 마크다운 태그 사용 금지. placehold.co, IMAGE_PLACEHOLDER URL 절대 금지.
```

**추가 수정 — `## 마크다운 이스케이프 규칙` 섹션 (L187-191):**

현재:
```
- 이미지 위치는 [이미지: 설명] 형식으로 표시
```

수정 후:
```
- 이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성.
```

#### 파일 2: `src/app/api/unsplash/search/route.ts`

**변경 목적**: placehold.co 폴백 제거 → null 반환

4개 폴백 지점 수정:

**L14-17 (UNSPLASH_ACCESS_KEY 없을 때):**
```tsx
// Before
return NextResponse.json({
  url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
});

// After
return NextResponse.json({ url: null });
```

**L30-32 (API 응답 실패):**
```tsx
// Before
return NextResponse.json({
  url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
});

// After
return NextResponse.json({ url: null });
```

**L39-41 (검색 결과 0건):**
```tsx
// Before
return NextResponse.json({
  url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
});

// After
return NextResponse.json({ url: null });
```

**L51-53 (catch 블록):**
```tsx
// Before
return NextResponse.json({
  url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
});

// After
return NextResponse.json({ url: null });
```

#### 파일 3: `src/components/posts/post-body.tsx`

**변경 목적**: Unsplash 검색 실패 시 placehold.co 대신 이미지 figure 요소 제거

**현재 (L156-175, useEffect 내부):**
```tsx
imgs.forEach(async (img) => {
  const query = img.dataset.unsplashQuery;
  if (!query) return;
  try {
    const res = await fetch(`/api/unsplash/search?query=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.url) {
      img.src = data.url;
    } else {
      img.src = `https://placehold.co/800x400/F5F5F5/999999?text=Image`;
    }
  } catch {
    img.src = `https://placehold.co/800x400/F5F5F5/999999?text=Image`;
  }
});
```

**수정 후:**
```tsx
imgs.forEach(async (img) => {
  const query = img.dataset.unsplashQuery;
  if (!query) return;
  try {
    const res = await fetch(`/api/unsplash/search?query=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.url) {
      img.src = data.url;
    } else {
      // 이미지 못 찾으면 figure 요소 자체 제거
      img.closest("figure")?.remove();
    }
  } catch {
    // 에러 시 figure 요소 자체 제거
    img.closest("figure")?.remove();
  }
});
```

**참고**: `img` 태그는 `<figure class="post-image-figure">` 안에 들어있으므로 (L38-39), `img.closest("figure")?.remove()`로 figure 전체를 제거.

### 3-2. 변경하지 않는 영역

| 영역 | 이유 |
|------|------|
| `post-body.tsx` L36-47 (markdownToHtml) | IMAGE_PLACEHOLDER → figure 변환 로직은 기존 글 호환을 위해 유지 |
| `route.ts` L311-335 (thumbnailUrl) | 커버 이미지 Unsplash 검색은 유지 (정상 동작) |
| `knowledge.ts` | QA 답변 프롬프트 — 이미지 관련 규칙은 유지 (참고자료 이미지 포함 지시) |
| 기존 정보공유 글 | DB에 저장된 body_md 수정 안 함 |
| `post-body.css` | CSS 변경 없음 |

## 4. 에러 처리

| 시나리오 | 현재 동작 | 수정 후 동작 |
|----------|----------|-------------|
| Unsplash 키 없음 | placehold.co 반환 | null 반환 → figure 제거 |
| Unsplash API 실패 | placehold.co 반환 | null 반환 → figure 제거 |
| 검색 결과 0건 | placehold.co 반환 | null 반환 → figure 제거 |
| fetch 자체 에러 | placehold.co 이미지 | figure 제거 |
| 기존 글에 placehold.co URL | 그대로 표시 | 그대로 표시 (기존 글 미변경) |
| 기존 글에 IMAGE_PLACEHOLDER | figure 생성 → Unsplash 검색 | figure 생성 → 검색 → 실패 시 figure 제거 |

## 5. 구현 순서

- [ ] `src/app/api/admin/curation/generate/route.ts` — systemPrompt에서 IMAGE_PLACEHOLDER 지시 제거, 이미지 태그 생성 금지 규칙 추가
- [ ] `src/app/api/unsplash/search/route.ts` — 4개 placehold.co 폴백을 `{ url: null }`로 변경
- [ ] `src/components/posts/post-body.tsx` — useEffect 내 placehold.co 폴백을 `figure.remove()`로 변경
- [ ] 기존 정보공유 글 렌더링 정상 확인 (기존 글에 영향 없는지)
- [ ] `npm run build` 성공 확인

## 6. 변경 요약

| 항목 | Before | After |
|------|--------|-------|
| AI 프롬프트 이미지 지시 | "각 섹션 IMAGE_PLACEHOLDER 필수" | "이미지 태그 생성 금지" |
| Unsplash 검색 실패 폴백 | placehold.co URL | null |
| post-body 이미지 실패 | placehold.co 이미지 표시 | figure 요소 제거 |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/app/api/admin/curation/generate/route.ts` | systemPrompt 텍스트 수정 | 낮음 |
| `src/app/api/unsplash/search/route.ts` | 폴백 응답 변경 | 낮음 |
| `src/components/posts/post-body.tsx` | useEffect 내 폴백 로직 | 중간 (기존 글 호환 확인 필요) |

- 변경 파일: 3개
- DB 변경: 없음
- 기존 글: 영향 없음 (새 글 생성에만 적용)
- 커버 이미지: 영향 없음 (thumbnailUrl 로직 유지)
