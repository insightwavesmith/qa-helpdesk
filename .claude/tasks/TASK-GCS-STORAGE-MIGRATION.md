---
team: unassigned
created: 2026-03-28
status: completed
owner: leader
---
# TASK: 미디어 Storage를 GCS(Google Cloud Storage)로 이관

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
현재 이미지/영상/스크린샷 등 대용량 미디어가 Supabase Storage에 저장됨.
GCP로 인프라 이관 중이므로, 미디어 Storage도 GCS로 옮긴다.
DB(PostgreSQL)와 Auth는 Supabase에 유지.

## GCP 정보
- 프로젝트: modified-shape-477110-h8
- 리전: asia-northeast3
- 계정: smith.kim@inwv.co
- GCS 버킷 이름: `bscamp-media` (신규 생성)

## 이관 대상 (대용량 미디어만)
- 소재 이미지/영상 (creative_media.storage_url)
- 소재 썸네일 (creative_media.thumbnail_url)
- 소재 saliency 히트맵 (creative_media.saliency_url)
- LP 스크린샷 (landing_pages.screenshot_url, cta_screenshot_url)
- LP 미디어 (landing_pages.media_assets → GIF→WebP, 영상, 이미지)

## Supabase에 남기는 것
- DB (PostgreSQL, RLS, Auth)
- HTML 파일 (소용량)

## 구현 순서

### 1. GCS 버킷 생성 + 서비스 계정
```bash
gsutil mb -l asia-northeast3 gs://bscamp-media
# 공개 읽기 설정 (이미지 표시용)
gsutil iam ch allUsers:objectViewer gs://bscamp-media
```

### 2. Storage 래퍼 함수 (`src/lib/storage.ts`)
- `uploadMedia(path, buffer, contentType)` → GCS에 업로드
- `getPublicUrl(path)` → `https://storage.googleapis.com/bscamp-media/{path}`
- 기존 Supabase `supabase.storage.upload()` 호출을 이 래퍼로 교체
- `@google-cloud/storage` 패키지 추가
- Cloud Run에서는 기본 서비스 계정으로 인증 (키 파일 불필요)

### 3. 크론 코드 수정 — 신규 수집분부터 GCS
수정할 파일들:
- `src/app/api/cron/collect-daily/route.ts` — 소재 이미지/영상 업로드
- `src/app/api/cron/crawl-lps/route.ts` — LP 스크린샷 + 미디어
- `src/app/api/cron/creative-saliency/route.ts` — 히트맵 이미지
- `src/lib/lp-media-downloader.ts` — LP 미디어 다운로드
- `src/lib/image-embedder.ts` — 이미지 읽기 URL

### 4. 기존 파일 마이그레이션 스크립트
- `scripts/migrate-storage-to-gcs.mjs` 신규
- Supabase Storage에서 파일 목록 조회 → GCS로 복사
- DB의 storage_url/screenshot_url 등을 GCS URL로 업데이트
- 배치로 실행 (한번에 다 안 해도 됨)

### 5. GCS 경로 구조
```
gs://bscamp-media/
  creatives/{creative_id}/{hash}.{ext}     — 소재 원본
  creatives/{creative_id}/thumbnail.jpg     — 썸네일
  creatives/{creative_id}/saliency.jpg      — 히트맵
  lp/{account_id}/{lp_id}/screenshot.jpg    — LP 스크린샷
  lp/{account_id}/{lp_id}/cta.jpg           — CTA 스크린샷
  lp/{account_id}/{lp_id}/media/{hash}.webp — LP 미디어
```

## 계정 종속 체크
- [x] LP: `lp/{account_id}/` 경로 분리
- [x] 소재: creative_id 기반
- [x] 공개 URL: allUsers objectViewer

## 주의사항
- Cloud Run에서 GCS 접근: 기본 서비스 계정 권한 확인
- 프론트 이미지 표시: URL 형식만 바뀜 (DB 업데이트로 해결)
- 마이그레이션 중 다운타임 없음 (구 URL도 당분간 유지)
