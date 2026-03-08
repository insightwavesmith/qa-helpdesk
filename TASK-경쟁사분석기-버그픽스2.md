# TASK: 경쟁사 분석기 SearchAPI 연동 버그픽스

## 목표
브라우저 QA에서 발견된 2건 버그 수정

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. 영상 모달에서 video 재생 안됨
### 파일
- `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx`
- `src/lib/competitor/meta-ad-library.ts`
### 현재 동작
- 영상 광고 카드 클릭 시 모달 열리지만 `<video>` 태그가 렌더링 안 됨
- 정적 이미지만 표시되거나 fallback 표시
### 기대 동작
- 영상 광고 클릭 → 모달에 `<video controls autoPlay>` 재생
- videoUrl이 null이면 videoPreviewUrl을 이미지로 표시 + "Meta에서 보기" 링크
### 디버깅 포인트
- `ad.displayFormat`이 "VIDEO"로 제대로 들어오는지 확인 (SearchAPI.io 응답의 `display_format` 값)
- `ad.videoUrl`이 null인지 확인 (SearchAPI.io가 `videos` 배열을 안 줄 수도 있음)
- `extractMediaUrls()`에서 `snapshot.videos` 파싱 로직 검증
- 로컬에서 `npm run dev` → 검색 → 콘솔에서 ad 객체 찍어서 실제 값 확인할 것
### 하지 말 것
- API route 변경하지 마라 (프론트엔드만 수정)

## T2. 다운로드 API DOWNLOAD_FAILED 에러
### 파일
- `src/app/api/competitor/download/route.ts`
- `src/lib/competitor/ad-cache.ts`
### 현재 동작
- `/api/competitor/download?ad_id=xxx&type=image` 호출 시 `{"error":"다운로드에 실패했습니다","code":"DOWNLOAD_FAILED"}` 반환
### 기대 동작
- 캐시에서 URL 조회 → fbcdn에서 프록시 다운로드 → 파일 스트림 응답
### 디버깅 포인트
- `getAdFromCache(adId)` 결과가 null인지 확인 (캐시 UPSERT가 안 됐을 가능성)
- `upsertAdCache()`가 search route에서 `.catch()`로 에러 무시 중 → 에러 로그 확인
- `competitor_ad_cache` 테이블에 실제 데이터가 들어갔는지 SQL로 확인
- fbcdn URL fetch 시 403 에러인지 확인 (URL 만료 가능)
- 로컬에서 `npm run dev` → 검색 후 → curl로 download API 호출 → 에러 로그 확인
### 하지 말 것
- 새 테이블이나 새 환경변수 추가하지 마라

## 검증 기준
- 영상 광고 카드 클릭 → 모달에서 video 재생됨 (또는 재생 불가 시 적절한 fallback)
- 이미지 다운로드 → 파일 저장됨
- tsc --noEmit + next lint 통과
