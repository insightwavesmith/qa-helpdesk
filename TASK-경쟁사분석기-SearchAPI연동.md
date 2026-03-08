# TASK: 경쟁사 분석기 SearchAPI.io 연동

## What
경쟁사 분석기의 광고 검색 API를 기존 Meta Ad Library API → SearchAPI.io로 전환하여 광고 소재 이미지/영상 미리보기 + 다운로드 기능 추가.

## Why
- 기존 Meta API는 `ad_snapshot_url`(render_ad 링크)만 제공 → iframe 차단(X-Frame-Options)으로 소재 미리보기 불가
- SearchAPI.io는 `original_image_url`, `video_hd_url`, `video_preview_image_url` 등 미디어 직접 URL 제공
- 이미지는 즉시 표시 가능, 영상은 fbcdn 직링크로 다운로드 가능 (URL 유효기간 ~4일)
- 광고 소재 미리보기는 경쟁사 분석의 핵심 가치

## 범위

### T1: SearchAPI.io 검색 API 전환
- 파일: `src/lib/competitor/meta-ad-library.ts`
- 기존 `ads_archive` endpoint → SearchAPI.io `meta_ad_library` engine으로 교체
- 환경변수: `SEARCH_API_KEY` (Vercel에도 설정 필요)
- 응답 매핑: SearchAPI.io 응답 → 기존 CompetitorAd 타입으로 변환
- 추가 필드: `image_url`, `video_url`, `video_preview_url` (snapshot에서 추출)
- 검증: 기존 검색 기능 동작 유지 + 이미지/영상 URL 포함

### T2: 광고 카드 UI에 소재 미리보기 추가
- 파일: `src/app/(main)/protractor/competitor/` 하위 컴포넌트들
- 광고 카드에 썸네일 이미지 표시 (이미지 광고: `original_image_url` / 영상 광고: `video_preview_image_url`)
- 영상 광고는 재생 아이콘 오버레이
- 클릭 시 모달로 확대 (이미지: 원본 / 영상: `<video>` 태그 재생)
- fallback: URL 없으면 기존 텍스트 카드 유지

### T3: 소재 다운로드 기능
- 파일: `src/app/api/competitor/download/route.ts` (신규)
- `GET /api/competitor/download?ad_id=xxx&type=image|video`
- Supabase `competitor_ad_cache` 테이블에서 URL 조회 → 만료 시 SearchAPI.io 재호출
- 서버사이드 프록시로 fbcdn에서 파일 다운로드 → 사용자에게 스트림
- Content-Disposition 헤더로 파일명 지정

### T4: 검색 결과 캐싱 (Supabase)
- 테이블: `competitor_ad_cache` (신규 생성 필요)
  - `ad_archive_id` (PK), `page_id`, `page_name`, `ad_text`
  - `image_url`, `video_url`, `video_preview_url`
  - `display_format` (IMAGE/VIDEO/CAROUSEL)
  - `metadata` (jsonb — 전체 snapshot 데이터)
  - `expires_at` (timestamptz — oe 파라미터 기반)
  - `created_at`, `updated_at`
- 검색 시 결과를 UPSERT → URL 갱신
- 다운로드/표시 시 캐시 우선 조회

### T5: 기존 "소재 보기" 링크 교체
- 파일: 광고 카드 컴포넌트
- 기존 `facebook.com/ads/archive/render_ad/` 외부 링크 → 인앱 미리보기 모달로 교체
- 모달 내 "다운로드" 버튼 추가

## 검증 기준
- 키워드 검색 시 광고 카드에 썸네일 표시됨
- 이미지 광고 클릭 → 원본 이미지 모달 표시
- 영상 광고 클릭 → 인라인 재생 가능
- "다운로드" 클릭 → 이미지(jpg)/영상(mp4) 파일 저장
- 기존 모니터링 등록/삭제 기능 정상 유지
- `tsc --noEmit` + `next lint` 통과

## 환경변수
- `SEARCH_API_KEY`: SearchAPI.io API 키
- 기존 `META_AD_LIBRARY_TOKEN` 유지 (pages API용 fallback)

## 참고
- SearchAPI.io 문서: https://www.searchapi.io/docs/meta-ad-library-api
- 영상 URL 유효기간: ~4일 (oe 파라미터 = hex timestamp)
- 이미지 URL은 서버/브라우저 모두 접근 가능, 영상도 fresh URL이면 서버 다운로드 가능
- 무료 100건 중 4건 사용 → 96건 남음 (개발+테스트 충분)
- bscamp 디자인 시스템 준수 (Primary #F75D5D, Radius 0.75rem, Pretendard)
