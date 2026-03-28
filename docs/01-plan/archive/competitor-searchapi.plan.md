# 경쟁사 분석기 SearchAPI.io 연동 Plan

> 작성일: 2026-03-08
> 선행 기능: competitor-analyzer (completed), competitor-brand-registration (completed), competitor-full-review (completed)

---

## 배경

현재 경쟁사 분석기는 Meta Ad Library API(v19.0)를 직접 호출하여 `ad_snapshot_url`(iframe 링크)만 제공한다. 하지만 이 URL은 X-Frame-Options 보안 헤더로 인해 iframe 미리보기가 대부분 차단되어, 광고 소재를 확인할 수 없는 상태이다.

SearchAPI.io의 Meta Ad Library 엔진은 `original_image_url`, `video_hd_url`, `video_preview_image_url` 등 미디어 직접 URL을 제공하므로, 소재 이미지/영상 미리보기 + 다운로드가 가능해진다. 이는 경쟁사 분석의 핵심 가치(어떤 소재를 쓰는지 바로 확인)를 실현한다.

## 현재 상태

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 검색 API | Meta Graph API v19.0 직접 호출 | SearchAPI.io `meta_ad_library` 엔진 |
| 환경변수 | `META_AD_LIBRARY_TOKEN` | `SEARCH_API_KEY` (+ 기존 토큰 fallback 유지) |
| 소재 미리보기 | iframe (`ad_snapshot_url`) → 대부분 차단됨 | `<img>` / `<video>` 태그로 직접 렌더링 |
| 다운로드 | 불가 | 서버 프록시 스트림 다운로드 |
| 캐싱 | 없음 (매 검색 API 호출) | `competitor_ad_cache` 테이블 (URL 만료 관리) |

## 범위

| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| **T1** | SearchAPI.io 검색 API 전환 — `meta-ad-library.ts` 교체 | 없음 |
| **T2** | 광고 카드 UI에 소재 미리보기 추가 (이미지/영상 썸네일 + 모달) | T1 |
| **T3** | 소재 다운로드 기능 — 서버 프록시 API Route | T1, T4 |
| **T4** | 검색 결과 캐싱 — `competitor_ad_cache` 테이블 + UPSERT | T1 |
| **T5** | 기존 "소재 보기" 외부 링크 → 인앱 미리보기 모달 교체 | T2 |

## 성공 기준

- [ ] `npm run build` 성공 (`SEARCH_API_KEY` 없어도 빌드 가능)
- [ ] `tsc --noEmit` + `next lint` 에러 0개
- [ ] T1: 기존 키워드 검색 기능 정상 동작 (응답에 image_url/video_url 포함)
- [ ] T2: 이미지 광고 → 카드에 썸네일 표시, 클릭 → 모달로 원본 이미지
- [ ] T2: 영상 광고 → 카드에 프리뷰 이미지 + 재생 아이콘, 클릭 → `<video>` 재생
- [ ] T3: "다운로드" 클릭 → 이미지(jpg)/영상(mp4) 파일 저장
- [ ] T4: 검색 결과 `competitor_ad_cache`에 UPSERT, 다운로드 시 캐시 우선 조회
- [ ] T5: "소재 보기" 외부 링크 → 인앱 모달 전환
- [ ] 기존 모니터링 등록/삭제/Cron 기능 정상 유지
- [ ] bscamp 디자인 시스템 적용

## 실행 순서

```
Phase 1: T1 (SearchAPI 전환) + T4 (캐싱 테이블) — 병렬 가능
Phase 2: T2 (미리보기 UI) + T3 (다운로드 API) — T1 완료 후, 병렬 가능
Phase 3: T5 (외부 링크 교체) — T2 완료 후
```

## 위험 요소

| 위험 | 영향 | 완화 |
|------|------|------|
| SearchAPI.io 무료 100건 중 96건 남음 | 개발+테스트 시 API 쿼터 소진 | 캐싱(T4) 우선 구현, 중복 호출 방지 |
| 영상 URL 유효기간 ~4일 (oe 파라미터) | 캐시된 URL 만료 시 재생 불가 | `expires_at` 기반 만료 관리 + 만료 시 재호출 |
| fbcdn 영상 CORS 제한 | 브라우저에서 직접 다운로드 불가 | 서버 프록시로 우회 (T3) |
| SearchAPI.io 응답 구조 변경 | 타입 불일치 → 런타임 에러 | 방어적 파싱 (optional chaining + fallback) |
| 기존 Cron `competitor-check`와의 호환성 | 모니터링 Cron도 SearchAPI로 전환 필요 | Cron은 기존 Meta API 유지 가능 (page_id 기반), 선택적 전환 |

## T1 상세: SearchAPI.io 검색 API 전환

### 이게 뭔지
`meta-ad-library.ts`의 API 호출 대상을 Meta Graph API → SearchAPI.io로 교체

### 왜 필요한지
Meta 직접 API는 `ad_snapshot_url`(iframe)만 제공 → iframe 차단으로 소재 미리보기 불가. SearchAPI.io는 이미지/영상 직접 URL 제공.

### 구현 내용
- `META_API_BASE` → `https://www.searchapi.io/api/v1/search` (engine=meta_ad_library)
- 인증: `api_key` 파라미터 또는 `Authorization: Bearer` 헤더
- 환경변수: `SEARCH_API_KEY`
- 응답 매핑: SearchAPI.io 응답 → 기존 `CompetitorAd` 타입 + 새 필드 (`imageUrl`, `videoUrl`, `videoPreviewUrl`, `displayFormat`)
- 기존 `searchMetaAds()` 시그니처 유지 (하위 호환)

## T2 상세: 광고 카드 소재 미리보기

### 이게 뭔지
광고 카드 UI에 실제 소재 이미지/영상 썸네일 표시 + 클릭 시 모달 확대

### 왜 필요한지
현재 iframe 기반 미리보기가 차단되어 "소재 미리보기를 불러올 수 없습니다" fallback만 표시됨

### 구현 내용
- `ad-card.tsx`의 iframe → `<img>` 또는 영상 프리뷰 이미지로 교체
- 영상 광고: `videoPreviewUrl` + 재생 아이콘 오버레이
- 클릭 → 모달: 이미지는 `<img>` 원본, 영상은 `<video>` 태그 인라인 재생
- fallback: URL 없으면 기존 텍스트 카드 유지 (아이콘 + "소재 없음")
- 모달 컴포넌트: `ad-media-modal.tsx` (신규)

## T3 상세: 소재 다운로드

### 이게 뭔지
서버사이드 프록시로 fbcdn에서 이미지/영상을 받아 사용자에게 스트림

### 왜 필요한지
fbcdn URL은 CORS 제한으로 브라우저에서 직접 다운로드 불가. 서버 프록시로 우회 필요.

### 구현 내용
- API Route: `GET /api/competitor/download?ad_id=xxx&type=image|video`
- `competitor_ad_cache`에서 URL 조회 → 만료 확인 → 만료 시 SearchAPI.io 재호출
- `fetch()`로 fbcdn에서 스트림 → `Content-Disposition: attachment` 응답
- 파일명: `{page_name}_{ad_id}.{jpg|mp4}`

## T4 상세: 검색 결과 캐싱

### 이게 뭔지
검색 결과의 미디어 URL을 DB에 캐시하여 API 쿼터 절약 + 만료 관리

### 왜 필요한지
SearchAPI.io 무료 96건 남음. 영상 URL은 ~4일 후 만료. 캐시로 중복 호출 방지 + 만료 시점 추적.

### 구현 내용
- 테이블: `competitor_ad_cache` (신규)
- 검색 시 결과를 UPSERT (ad_archive_id 기준)
- 다운로드/표시 시 캐시 우선 조회 → 만료 확인 → 필요 시 재호출
- `expires_at`: 영상 URL의 `oe` 파라미터(hex timestamp)에서 추출

## T5 상세: "소재 보기" 링크 교체

### 이게 뭔지
기존 `facebook.com/ads/archive/render_ad/` 외부 링크 → 인앱 미리보기 모달

### 왜 필요한지
외부 링크 클릭 시 새 탭 + Meta 로그인 필요 → UX 단절. 인앱 모달로 즉시 확인 가능.

### 구현 내용
- "소재 보기" 버튼 → `onClick` → `ad-media-modal.tsx` 오픈
- 모달 내 "다운로드" 버튼 추가
- 외부 링크(ad_snapshot_url)는 모달 내 "Meta에서 보기" 보조 링크로 유지

## 환경변수

| 변수 | 용도 | 필수 | 비고 |
|------|------|------|------|
| `SEARCH_API_KEY` | SearchAPI.io API 키 | Y (런타임) | 빌드 시 불필요 |
| `META_AD_LIBRARY_TOKEN` | 기존 Meta API 토큰 | N | Cron/pages API fallback용 유지 |

## 관련 파일 (수정 대상)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/competitor/meta-ad-library.ts` | SearchAPI.io 엔드포인트 + 응답 매핑 전환 |
| `src/types/competitor.ts` | CompetitorAd에 imageUrl/videoUrl/videoPreviewUrl/displayFormat 추가 |
| `src/app/api/competitor/search/route.ts` | 캐시 UPSERT 호출 추가 |
| `src/app/(main)/protractor/competitor/components/ad-card.tsx` | iframe → img/video 미리보기 |
| `src/app/api/competitor/download/route.ts` | 신규: 다운로드 프록시 |
| `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` | 신규: 소재 확대 모달 |
| `supabase/migrations/YYYYMMDD_competitor_ad_cache.sql` | 신규: 캐시 테이블 |
