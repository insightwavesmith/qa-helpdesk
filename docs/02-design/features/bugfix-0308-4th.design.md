# 수정사항 4차 — Design

## T1. 더보기 페이지네이션

### 근본 원인 (end-to-end 추적)
1. 프론트 → `/api/competitor/search?page_token=X&page_id=Y`
2. API route → `searchMetaAds({ pageToken: X, searchPageIds: Y })`
3. `searchMetaAds()` → SearchAPI.io로 `page_token=X&page_id=Y` 동시 전송
4. **SearchAPI.io는 page_token에 전체 쿼리 컨텍스트가 이미 인코딩됨**
5. page_id를 같이 보내면 새 쿼리로 해석 → 첫 페이지 반환
6. 프론트에서 중복 제거 → deduped=0 → 토스트만 표시

### 수정 설계
- `searchMetaAds()`: pageToken이 있으면 engine, api_key, page_token만 전송
- 프론트: deduped=0일 때 자동 재시도 (최대 3회)

## T2. 초대코드 사용량

### 근본 원인 (end-to-end 추적)
1. signup → `consumeInviteCode()` 호출
2. `useInviteCode()` 내 updateBuilder에 `.eq()`/`.is()` 조건 추가
3. PostgREST 쿼리빌더의 반환값을 변수에 재할당하지 않아 조건이 적용되지 않을 수 있음
4. 반환된 `{ error }` 값을 signup에서 확인하지 않음

### 수정 설계
- update 로직 단순화: let query로 변수 재할당
- signup에서 consumeInviteCode 반환값 로깅

## T3. 믹스패널 필드 필수화

### 수정 설계
- StepAdAccount 컴포넌트에서 3개 필드 라벨에 * 추가
- 3개 필드 모두 입력해야 버튼 활성화
- 에러 표시 (touched/submitted 패턴)

## T4. 키워드 검색 강화

### 수정 설계

#### 4-1. 브랜드 사전
- `src/lib/competitor/brand-dictionary.ts` 신규 파일
- 한글→영문 매핑 30개 (젝시미스, 올리브영, 무신사 등)
- `lookupBrand(query)` 함수

#### 4-2. 폴백 검색
- `searchBrandPages()` 결과 0건 → `searchMetaAds({ searchTerms: query })` 호출
- API route `/api/competitor/brands/route.ts`에 폴백 로직 추가

#### 4-3. 자동 영문 변환
- Google Suggest API: `http://suggestqueries.google.com/complete/search?client=firefox&q=${query}`
- 한글 입력 → 영문 후보 추출 → page_search 재시도

## 에러 처리
- T1: 재시도 실패 시 "더 이상 새로운 광고가 없습니다" 표시
- T2: 사용량 차감 실패 시 console.error 로그
- T3: 미입력 시 "필수 항목입니다" 에러 메시지
- T4: 사전/폴백 모두 실패 시 기존 0건 결과 유지

## 구현 순서
1. T2 (초대코드) — 단순 버그, 영향범위 좁음
2. T3 (믹스패널) — UI 변경만
3. T1 (더보기) — API + 프론트 수정
4. T4 (키워드) — 신규 파일 + API 수정
