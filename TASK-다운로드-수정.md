# TASK: 경쟁사 분석기 — 개별 다운로드 API 수정

## 목표
개별 이미지/영상 다운로드(`/api/competitor/download`)가 항상 500 에러를 반환하는 버그 수정. ZIP 일괄 다운로드는 정상 동작하므로 그 방식을 참고할 것.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## 현상
- `GET /api/competitor/download?ad_id=xxx&type=image` → HTTP 500 `{"error":"다운로드에 실패했습니다","code":"DOWNLOAD_FAILED"}`
- 이미지, 영상 모두 동일하게 실패
- **ZIP 다운로드(`POST /api/competitor/download-zip`)는 정상 동작**

## 원인 분석 (반드시 확인할 것)
ZIP과 개별 다운로드의 차이:
- **ZIP**: 클라이언트가 `imageUrl`을 body에 직접 전달 → 서버가 그 URL로 바로 fetch → 성공
- **개별**: `ad_id`로 `competitor_ad_cache` 테이블 조회 → URL 가져옴 → fetch → 실패

따라서 문제는 3가지 중 하나:
1. `competitor_ad_cache` 테이블에 데이터가 안 들어감 (UPSERT 실패)
2. 캐시에 데이터는 있지만 URL이 잘못됨/만료됨
3. `getAdFromCache()` 또는 `createServiceClient()` 호출 자체 에러

## T1. 원인 파악 + 수정
### 파일
- `src/app/api/competitor/download/route.ts`
- `src/lib/competitor/ad-cache.ts`
- `src/app/api/competitor/search/route.ts` (UPSERT 호출부)
### 디버깅 순서
1. 로컬 `npm run dev` 실행
2. 검색 수행 ("올리브영")
3. `competitor_ad_cache` 테이블에 데이터 있는지 확인 (Supabase 대시보드 또는 curl)
4. 있으면 → `image_url` 값 확인, 직접 curl로 다운로드 시도
5. 없으면 → `upsertAdCache()` 에러 로그 확인, `createServiceClient()` 정상 동작 여부 확인
6. download route에서 console.log로 각 단계 값 출력 → 어디서 500이 나는지 특정
### 기대 동작
- 검색 → 캐시 저장 → 개별 다운로드 시 캐시에서 URL 조회 → fbcdn fetch → 파일 스트림 응답
### 하지 말 것
- ZIP 다운로드 route 수정하지 마라 (정상 동작 중)
- 새 테이블이나 환경변수 추가하지 마라

## T2. fallback 방식 추가 (캐시 실패 시)
### 파일
- `src/app/api/competitor/download/route.ts`
### 현재 동작
- 캐시에 없으면 `page_name`으로 재검색 시도 → 실패 시 404
### 기대 동작
- **캐시 실패 시 클라이언트에서 URL을 쿼리 파라미터로 전달받는 fallback** 추가
- 예: `GET /api/competitor/download?ad_id=xxx&type=image&url=https://scontent...`
- URL 파라미터가 있으면 캐시 조회 스킵하고 바로 fetch (ZIP 방식과 동일)
- URL 파라미터 없으면 기존 캐시 조회 로직 유지
- URL은 `scontent` 또는 `video` fbcdn 도메인만 허용 (보안)
### 하지 말 것
- 기존 캐시 로직 삭제하지 마라 (fallback으로 추가만)

## 검증 기준
- 검색 후 개별 이미지 "다운로드" 클릭 → 파일 다운로드 성공
- 모달 내 "이미지 다운로드"/"영상 다운로드" → 파일 다운로드 성공
- ZIP 다운로드 여전히 정상
- tsc --noEmit + next lint 통과
