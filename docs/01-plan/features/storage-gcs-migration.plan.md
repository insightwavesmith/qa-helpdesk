# Storage → GCS 이관 Plan

## 배경
Supabase 의존도 제거 Phase 1. 현재 Supabase Storage를 사용하는 업로드/다운로드를 전부 GCS(Google Cloud Storage)로 교체한다.
- `gcs-storage.ts` 모듈 이미 준비됨 (uploadToGcs, deleteFromGcs, getGcsPublicUrl)
- `process-media` 크론은 이미 GCS로 이관 완료 (참조 패턴)
- `USE_CLOUD_SQL=true` 환경에서 GCS 활성화

## 범위

### A. 서버 사이드 업로드 (4파일) — uploadToGcs() 직접 사용
| # | 파일 | 버킷 | 작업 |
|:-:|------|------|------|
| A1 | `src/actions/contents.ts` | content-images | resolveImagePlaceholders() 내 upload+getPublicUrl 교체 |
| A2 | `src/app/api/admin/email/upload/route.ts` | email-attachments | svc.storage → uploadToGcs 교체 |
| A3 | `src/lib/lp-media-downloader.ts` | creatives | uploadBufferToStorage() 내부 교체 |
| A4 | `src/app/api/cron/crawl-lps/route.ts` | creatives | uploadToStorage()+uploadHtmlToStorage() 교체 |

### B. 클라이언트 사이드 업로드 (10파일) — /api/upload 프록시 경유
| # | 파일 | 버킷 | 작업 |
|:-:|------|------|------|
| B1 | `src/app/(main)/questions/new/new-question-form.tsx` | question-images | 업로드 로직 → /api/upload 호출 |
| B2 | `src/app/(main)/questions/[id]/follow-up-form.tsx` | question-images | 동일 |
| B3 | `src/app/(main)/questions/[id]/answer-form.tsx` | qa-images | 동일 |
| B4 | `src/app/(main)/questions/[id]/answer-edit-button.tsx` | qa-images | 동일 |
| B5 | `src/app/(main)/admin/answers/answers-review-client.tsx` | question-images | 동일 |
| B6 | `src/components/qa-chatbot/QaChatPanel.tsx` | question-images | 동일 |
| B7 | `src/components/content/detail-sidebar.tsx` | content-images | upload + remove 교체 |
| B8 | `src/components/content/mdx-editor-wrapper.tsx` | content-images | 동일 |
| B9 | `src/app/(main)/reviews/new/new-review-form.tsx` | review-images | 동일 |
| B10 | `src/app/(auth)/signup/page.tsx` | documents | 동일 |

### C. 하드코딩 URL 교체 (3파일 — src/ 내 실코드만)
| # | 파일 | 내용 |
|:-:|------|------|
| C1 | `src/lib/newsletter-row-templates.ts` | BANNER_BASE_URL 상수 교체 |
| C2 | `src/lib/email-template-utils.ts` | BANNER_BASE_URL 상수 교체 |
| C3 | `src/lib/email-default-template.ts` | 하드코딩 URL 다수 교체 |

### D. 기존 파일을 GCS로 복사 (사전 작업)
- newsletter-banners 이미지를 GCS에 미리 업로드해야 URL 교체 후에도 이미지가 표시됨
- `gsutil rsync` 또는 스크립트로 Supabase → GCS 복사

## 구현 순서 (Wave 패턴)

### Wave 0: 사전 준비
- [ ] GCS 버킷 public 읽기 설정 확인
- [ ] newsletter-banners 파일을 GCS에 복사
- [ ] gcs-storage.ts에 `deleteFromGcs` 이미 있음 확인 ✅

### Wave 1: 서버 사이드 (A1~A4) — backend-dev
- [ ] A1: contents.ts resolveImagePlaceholders
- [ ] A2: email upload route
- [ ] A3: lp-media-downloader.ts
- [ ] A4: crawl-lps route

### Wave 2: 업로드 API + 클라이언트 (B1~B10) — backend-dev + frontend-dev
- [ ] /api/upload route 생성 (FormData → GCS)
- [ ] B1~B10 클라이언트 컴포넌트 업로드 로직 교체

### Wave 3: URL 교체 (C1~C3) — backend-dev
- [ ] C1~C3 BANNER_BASE_URL + 하드코딩 URL 교체

### Wave 4: 빌드 + QA
- [ ] tsc + lint + build 통과
- [ ] Gap 분석

## 성공 기준
- Supabase Storage import 0건 (src/ 내 `.storage.from(` 0건)
- 하드코딩 Supabase URL 0건 (src/ 내)
- `npm run build` 성공
- 기존 업로드 기능 동작 유지 (듀얼 라이트: USE_CLOUD_SQL=true → GCS, false → Supabase)

## 참조
- ADR-001: 계정 종속 구조 (Storage 경로에 {account_id} 필수)
- `src/lib/gcs-storage.ts`: GCS 헬퍼 모듈
- `src/app/api/cron/process-media/route.ts`: GCS 이관 완료 참조 패턴
