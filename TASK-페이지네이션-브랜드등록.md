# TASK: 경쟁사 분석기 — 페이지네이션, 브랜드 등록 개선

## 목표
경쟁사 분석기의 검색 결과 건수 제한(30건)을 해제하고, 브랜드 등록 방식을 개선한다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## 1. 페이지네이션

### 현재 상태
- SearchAPI.io 기본 30건 제한, 더보기 버튼 없음
- 필터 시 30건 내에서만 필터링 → 결과 부족

### 기대 동작
- 검색 시 30건 + "더보기" 버튼 표시
- 더보기 클릭 시 다음 30건 로드 (next_page_token)
- 전체 건수 표시 (total_results)
- 30일+ 필터 사용 시 자동으로 추가 로드

### 1.1 API 변경
- `src/app/api/competitor/search/route.ts`
- 요청: `GET /api/competitor/search?q=xxx&page_token=xxx`
- 응답:
```json
{
  ads: [...],          // 광고 목록 (최대 30건)
  totalCount: 1785,    // 전체 건수
  nextPageToken: "AQH..."  // 다음 페이지 토큰 (마지막 페이지 null)
}
```
- SearchAPI.io 문서 참고: https://www.searchapi.io/docs/meta-ad-library-api
- Rate Limit 주의: 429 에러 핸들링

### 1.2 UI 변경
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- 검색 결과 하단에 "더보기" 버튼 (Primary 컬러)
- 로딩 시 스피너 표시
- 더이상 결과 없으면 버튼 숨김
- totalCount 표시 (예: "총 1,785건")

## 2. 브랜드 등록 개선

### 현재 상태
- 키워드 검색 → 모니터링 등록 (키워드 기반)
- 정확도 떨어짐 + 오탐 가능성

### 기대 동작
- 2가지 방식:
  1. 키워드 검색 → 페이지 선택 → page_id 등록 (유지)
  2. 직접 등록: Facebook 페이지 URL/이름 입력 → page_id 확인 → 등록 (신규)
- 등록된 브랜드 = page_id 기반 → 정확도 향상

### 2.1 Meta Graph API 연동 (페이지 ID 획득)
- Facebook 페이지 URL/이름 입력 → Meta Graph API 호출 → page_id 획득
- 신규 API 엔드포인트: `src/app/api/facebook/page-info/route.ts` (예시)
- Meta App + 토큰 필요 (기존 META_ACCESS_TOKEN 재활용?)
- Meta Graph API Explorer: https://developers.facebook.com/tools/explorer
- Page API: https://developers.facebook.com/docs/graph-api/reference/page/

### 2.2 UI 변경
- `src/app/(main)/protractor/competitor/components/monitor-panel.tsx`
- 모니터링 등록 모달에 "URL로 등록" 탭 추가
- URL 입력 필드 + page_id 표시
- 에러 핸들링: 유효하지 않은 URL, API 호출 실패

### 2.3 DB 변경
- `competitor_monitors` 테이블에 `page_id` 필드 필수
- 기존 키워드 기반 모니터링은 마이그레이션 필요 (수동 or 스크립트)

## 3. (선택) 서버사이드 필터
- media_type, active_status 필터 서버에서 처리 (SearchAPI.io 파라미터 활용)

## 검증 기준
- [페이지네이션] 검색 시 30건 + 더보기 버튼, 클릭 시 다음 페이지 로드, 전체 건수 표시
- [브랜드 등록] 키워드/URL 등록 모두 정상 동작, page_id 기반 모니터링
- [필터] (선택) 서버사이드 필터 정상 동작
- tsc --noEmit + next lint 통과
