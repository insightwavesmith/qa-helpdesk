# F3. 정보공유 placeholder 이미지 제거 — Plan

> 작성: 2026-03-04
> 참조: TASK.md F3

## 1. 개요
- **기능**: 정보공유 글 생성 시 placehold.co 이미지 대신 이미지 없이 생성
- **해결하려는 문제**: AI가 생성한 정보공유 글에 `placehold.co` placeholder 이미지가 포함됨
  - 섹션 1, 3에 placeholder 이미지
  - 섹션 4, 5에 Unsplash 실제 이미지
  - Unsplash 검색이 한국어 키워드로 실패할 때 `placehold.co`로 대체됨
- **수정 대상**: 2개 파일

## 2. 문제 흐름 분석

### placeholder 이미지 발생 경로

**경로 1: AI 프롬프트에서 IMAGE_PLACEHOLDER 지시**
```
route.ts systemPrompt
  → "각 h2 섹션마다 ![이미지 설명](IMAGE_PLACEHOLDER) 최소 1개 필수"
  → AI가 ![설명](IMAGE_PLACEHOLDER) 생성
  → post-body.tsx에서 IMAGE_PLACEHOLDER → Unsplash 검색
  → 검색 실패 시 → placehold.co 폴백
```

**경로 2: Unsplash API 폴백**
```
src/app/api/unsplash/search/route.ts
  → Unsplash 키 없음 → placehold.co
  → API 호출 실패 → placehold.co
  → 검색 결과 0건 → placehold.co
```

### 관련 파일 맵

| 파일 | 역할 | placeholder 관련 |
|------|------|-----------------|
| `route.ts` (curation/generate) | 정보공유 생성 프롬프트 | `IMAGE_PLACEHOLDER` 지시 (L108, L134) |
| `post-body.tsx` | 콘텐츠 렌더링 | IMAGE_PLACEHOLDER → Unsplash 검색 (L36-41), 실패 시 placehold.co (L170, L173) |
| `unsplash/search/route.ts` | Unsplash 프록시 | 실패 시 placehold.co 폴백 (L16, L31, L40, L52) |

## 3. 핵심 요구사항

### 기능적 요구사항
- FR-01: **프롬프트에서 이미지 생성 지시 제거** — `IMAGE_PLACEHOLDER` 관련 규칙을 "이미지 태그 생성 금지"로 변경
- FR-02: **Unsplash 폴백에서 placehold.co 제거** — 이미지를 못 찾으면 null 반환 (placehold.co URL 대신)
- FR-03: **post-body.tsx 폴백에서 placehold.co 제거** — 이미지 로드 실패 시 이미지 요소 자체 제거
- FR-04: 기존 정보공유 글에는 영향 없음 (새 글 생성에만 적용)

### 비기능적 요구사항
- 기존 정보공유 글 수정 금지
- 정보공유 CSS 변경 금지
- QA 답변 프롬프트 변경 금지 (`knowledge.ts`)
- 커버 이미지 (thumbnailUrl) 로직은 유지 (Unsplash 검색 성공 시 사용)

## 4. 범위

### 포함
- `src/app/api/admin/curation/generate/route.ts` — systemPrompt 내 이미지 관련 지시 변경
- `src/app/api/unsplash/search/route.ts` — placehold.co 폴백을 null 반환으로 변경
- `src/components/posts/post-body.tsx` — 이미지 로드 실패 시 placehold.co 대신 요소 제거

### 제외
- 기존 정보공유 글 (DB에 이미 저장된 콘텐츠)
- 정보공유 CSS/레이아웃
- `src/lib/knowledge.ts` (QA 답변 프롬프트)
- 커버 이미지 (thumbnailUrl) 로직 — route.ts 하단의 Unsplash 검색

## 5. 성공 기준
- [ ] 새로 생성되는 정보공유 글에 `placehold.co` URL이 포함되지 않음
- [ ] AI가 `IMAGE_PLACEHOLDER` 또는 이미지 태그를 생성하지 않음
- [ ] Unsplash 검색 실패 시 placehold.co 대신 null/빈 값 반환
- [ ] post-body.tsx에서 이미지 로드 실패 시 빈 placeholder가 아닌 요소 제거
- [ ] 기존 정보공유 글 정상 표시 유지
- [ ] `npm run build` 성공

## 6. 실행 순서
1. `route.ts` systemPrompt에서 `IMAGE_PLACEHOLDER` 관련 지시 변경
2. `unsplash/search/route.ts`에서 placehold.co 폴백 → null 반환
3. `post-body.tsx`에서 이미지 실패 시 placehold.co → 요소 제거
4. 빌드 확인
5. 기존 정보공유 글 렌더링 정상 확인
6. (선택) 새 정보공유 생성 테스트
