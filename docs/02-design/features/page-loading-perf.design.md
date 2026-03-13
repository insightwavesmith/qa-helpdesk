# 페이지 로딩 성능 개선 (P0) — 설계서

## 1. 데이터 모델
변경 없음 (DB 스키마 수정 없음)

## 2. API 설계

### T5: Cache-Control 헤더
- **`/api/posts` GET**: `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` 추가
- **총가치각도기 API**: 변경 없음 (데이터 유출 이력으로 private, no-store 유지)
- **`/api/unsplash/search` GET**: 이미 ISR 24시간 적용됨 → 변경 없음

## 3. 컴포넌트 구조

### T1: next.config 이미지 최적화
**변경 파일**: `next.config.ts`
```typescript
images: {
  formats: ["image/avif", "image/webp"],  // ← 추가
  remotePatterns: [/* 기존 유지 */],
}
```

### T2: raw img → next/image 교체

| 파일 | 위치 | 이미지 소스 | 변환 방식 |
|------|------|------------|----------|
| `src/components/questions/ImageLightbox.tsx` | 76-83줄 | Supabase URL | `<Image>` fill + sizes + unoptimized (전체화면 원본) |
| `src/components/qa-chatbot/QaReportList.tsx` | 124-128줄 | Supabase URL | `<Image>` width={80} height={80} |
| `src/components/qa-chatbot/QaChatPanel.tsx` | 382-388줄 | Supabase URL | `<Image>` width={64} height={64} |
| `src/components/qa-chatbot/QaChatPanel.tsx` | 476-480줄 | Blob URL | 유지 (blob URL은 next/image 미지원) |
| `src/app/(main)/questions/new/new-question-form.tsx` | 373-377줄 | Blob URL | 유지 (blob URL) |
| `src/app/(main)/questions/new/new-question-form.tsx` | 399-403줄 | Blob URL | 유지 (blob URL) |
| `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` | 148, 191, 260줄 | Meta API URL | `<Image>` unoptimized (외부 URL) + onError 유지 |
| `src/app/(main)/protractor/competitor/components/ad-card.tsx` | 84, 108줄 | Meta API URL | `<Image>` fill + unoptimized + onError 유지 |

**변환 규칙**:
- Supabase URL → `<Image>` + sizes 속성 (CDN 최적화 활용)
- Meta API URL → `<Image>` + `unoptimized` (외부 이미지, 최적화 불필요)
- Blob URL → `<img>` 유지 (next/image 미지원)
- `onError` 핸들러 → next/image는 native onError 지원
- 기존 className 유지 (object-cover, rounded 등)
- next.config remotePatterns에 Meta CDN 도메인 추가 필요 없음 (unoptimized 사용)

### T6: Q&A/정보공유 쿼리 병렬화

**`/questions` 페이지 (src/app/(main)/questions/page.tsx)**:
```
현재 (순차):
1. supabase.auth.getUser()
2. svc.profiles.select("role")  // user 의존
3. getCategories()
4. getQuestions()  // categories 의존 (categoryId 해석)

개선 (부분 병렬):
1. supabase.auth.getUser()
2. Promise.all([
     svc.profiles.select("role"),   // user 의존
     getCategories(),                // 독립
   ])
3. getQuestions()  // categories 결과로 categoryId 해석 후
```
예상 효과: -100ms (getCategories 병렬화)

**`/posts` 페이지 (src/app/(main)/posts/page.tsx)**:
```
현재 (순차):
1. supabase.auth.getUser()
2. svc.profiles.select("role")  // user 의존
3. getPosts()                    // user 무관

개선 (병렬):
1. supabase.auth.getUser()
2. Promise.all([
     svc.profiles.select("role"),   // user 의존
     getPosts({ ... }),             // 독립! userId 불필요
   ])
```
예상 효과: -200~400ms (getPosts 병렬화, DB 쿼리 400ms 절약)

### T7: 정보공유 이미지 사전 확정

**Phase 1: post-body.tsx 리팩터링**
- `data-unsplash-query` 이미지 → 이미 Storage URL로 교체된 본문은 그대로 렌더링
- Unsplash 클라이언트 호출 useEffect 제거 (Storage URL이면 직접 표시)
- IMAGE_PLACEHOLDER가 남아있는 글만 폴백 처리 (기존 로직 유지)

**Phase 2: 글 생성/수정 시 이미지 사전 확정**
- 글 작성 시 body_md에 `![alt](IMAGE_PLACEHOLDER)` 패턴 감지
- 서버에서 Unsplash 검색 → 이미지 다운로드 → Supabase Storage 업로드
- body_md의 IMAGE_PLACEHOLDER를 Storage URL로 교체 후 저장
- **처리 위치**: Server Action (contents.ts의 createContent/updateContent)

**Phase 3: 기존 글 마이그레이션**
- 스크립트: `scripts/migrate-post-images.ts`
- 대상: body_md에 `IMAGE_PLACEHOLDER` 또는 `[이미지:` 패턴이 있는 contents
- 동작: Unsplash 검색 → Storage 업로드 → body_md 업데이트
- 안전장치: 원본 body_md를 별도 컬럼/백업 저장
- 본문 텍스트 절대 변경 금지 → 이미지 관련 마크업만 src 교체

## 4. 에러 처리
- T2: next/image 로드 실패 시 기존 onError 핸들러 유지
- T6: Promise.all 중 하나 실패 → 기존 에러 핸들링과 동일 (페이지 에러)
- T7: Unsplash API 실패 시 IMAGE_PLACEHOLDER 유지 (기존 폴백 동작)
- T7: Storage 업로드 실패 시 원본 body_md 유지

## 5. 구현 순서
1. [frontend-dev] T1: next.config 이미지 formats 추가
2. [frontend-dev] T2: raw img → next/image 교체 (Supabase URL 우선)
3. [frontend-dev] T6: questions/posts 페이지 쿼리 병렬화
4. [backend-dev] T5: /api/posts GET에 Cache-Control 헤더 추가
5. [backend-dev] T7-Phase2: 글 생성 시 이미지 사전 확정 로직
6. [backend-dev] T7-Phase3: 기존 글 마이그레이션 스크립트
7. [frontend-dev] T7-Phase1: post-body.tsx 리팩터링
8. [qa-engineer] 전체 빌드 검증 + 기능 테스트
