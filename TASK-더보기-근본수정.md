# TASK: 더보기 페이지네이션 근본 수정

## 이게 뭔지

경쟁사 분석기 "더보기"가 같은 30개를 반복 반환하는 버그. SearchAPI.io 파라미터명 오류 + HTTP 메서드 오류.

## 왜 필요한지

더보기 누르면 기존 30개 아래에 다음 30개가 추가되어야 하는데, 같은 30개만 반복됨. 수강생이 30개 이후 광고를 볼 수 없음.

## 구현 내용

### T1: SearchAPI.io 호출 방식 변경
- **파일**: `src/lib/competitor/meta-ad-library.ts`
- **원인 2가지:**
  1. 파라미터명: `page_token` ❌ → `next_page_token` ✅
  2. HTTP 메서드: GET ❌ → POST ✅ (토큰이 커지면 URL 길이 제한 걸림)
- **수정:**
  - pageToken이 있을 때 → POST 방식으로 변경
  - JSON body: `{ "engine": "meta_ad_library", "q": "검색어", "next_page_token": "토큰값", "country": "KR", "ad_active_status": "active" }`
  - Authorization header: `Bearer {apiKey}`
  - page_id 검색일 때도 동일하게 POST body에 포함
- **검증 완료된 작동 방식:**
  ```
  POST https://www.searchapi.io/api/v1/search
  Authorization: Bearer {API_KEY}
  Content-Type: application/json
  Body: {"engine": "meta_ad_library", "q": "젝시믹스", "next_page_token": "토큰값"}
  ```
  → 다른 30개 광고가 정상 반환됨 (검증 완료)

### T2: 토스트 메시지 수정
- **파일**: `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `toast.success(`광고 ${newAds.length}건 추가 로드`)` → `toast.success(`광고 ${uniqueNew.length}건 추가 로드`)`
- 실제 추가된 건수(dedup 후)를 표시해야 정확함

### T3: 빌드 검증
- `npm run build` 성공 확인

## 하지 말 것
- 첫 검색(pageToken 없을 때)은 기존 GET 방식 유지. pageToken 있을 때만 POST로 변경
- API route(`/api/competitor/search`) 변경 불필요 — 라이브러리 레벨에서 해결
