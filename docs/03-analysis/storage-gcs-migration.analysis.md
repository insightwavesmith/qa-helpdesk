# Storage → GCS 이관 Gap 분석

> 분석일: 2026-03-24
> 설계서: `docs/02-design/features/storage-gcs-migration.design.md`

## Match Rate: 100%

## 일치 항목 ✅

### A. 서버 사이드 (4/4 완료)
- [x] A1: `src/actions/contents.ts` — resolveImagePlaceholders() 듀얼라이트 적용
- [x] A2: `src/app/api/admin/email/upload/route.ts` — 듀얼라이트 적용
- [x] A3: `src/lib/lp-media-downloader.ts` — uploadBufferToStorage() 듀얼라이트 적용
- [x] A4: `src/app/api/cron/crawl-lps/route.ts` — uploadToStorage()+uploadHtmlToStorage() 듀얼라이트 적용

### B. 클라이언트 사이드 (10/10 완료)
- [x] B1: `questions/new/new-question-form.tsx` — uploadFile() 교체
- [x] B2: `questions/[id]/follow-up-form.tsx` — uploadFile() 교체
- [x] B3: `questions/[id]/answer-form.tsx` — uploadFile() 교체
- [x] B4: `questions/[id]/answer-edit-button.tsx` — uploadFile() 교체
- [x] B5: `admin/answers/answers-review-client.tsx` — uploadFile() 교체
- [x] B6: `qa-chatbot/QaChatPanel.tsx` — uploadFile() 교체
- [x] B7: `content/detail-sidebar.tsx` — uploadFile() + deleteFile() 교체
- [x] B8: `content/mdx-editor-wrapper.tsx` — uploadFile() 교체
- [x] B9: `reviews/new/new-review-form.tsx` — uploadFile() 교체
- [x] B10: `signup/page.tsx` — uploadFile() 교체

### C. 하드코딩 URL (3/3 완료)
- [x] C1: `newsletter-row-templates.ts` — BANNER_BASE_URL 듀얼 상수 + 인라인 URL 상수화
- [x] C2: `email-template-utils.ts` — BANNER_BASE_URL 듀얼 상수
- [x] C3: `email-default-template.ts` — BANNER_BASE 상수 + resolveUrls() 래퍼

### 인프라
- [x] `/api/upload` route 신규 생성 (POST+DELETE)
- [x] `upload-client.ts` 유틸리티 신규 생성

### 빌드 검증
- [x] `npx tsc --noEmit` — 에러 0
- [x] `npm run build` — 성공
- [x] ESLint — 기존 에러 3건만 (collect-daily, 변경분 아님)

## 불일치/보류 항목

없음. 모든 인프라 사전조건 확인 완료:
- ✅ GCS 버킷 `bscamp-storage` allUsers:objectViewer 설정됨
- ✅ newsletter-banners 파일 GCS에 이미 복사됨 (배너, 로고, 프로필 등)
- ℹ️ `useGcsStorage()` 함수명 → 서버 사이드에서 `process.env.USE_CLOUD_SQL === "true"` 직접 비교로 우회

## 변경 파일 수
- 신규: 2파일 (`api/upload/route.ts`, `upload-client.ts`)
- 수정: 15파일 (서버 4 + 클라이언트 10 + URL 3, 일부 중복)
- Plan + Design: 2파일
- 분석: 1파일
- **총: 20파일**
