# TASK: 경쟁사 분석기 v2 — 핫픽스 (Smith님 피드백 반영)

## 목표
실제 테스트에서 발견된 6건 버그+UX 수정

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

## F1. 브랜드 검색 안됨 (CRITICAL)
### 파일
- `src/lib/competitor/meta-ad-library.ts`
### 현재 동작
- searchBrandPages()에서 `json.pages ?? json.data ?? []`로 파싱 → SearchAPI.io 실제 응답 키는 `page_results` → 빈 배열 반환
### 기대 동작
- `json.page_results`로 파싱
- 한글("올리브영"), 영어("oliveyoung"), 인스타("oliveyoung_official") 전부 결과 반환
### 하지 말 것
- 기존 searchMetaAds() 건드리지 마

## F2. 더보기 안됨 (페이지네이션)
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/api/competitor/search/route.ts`
### 현재 동작
- "더보기 (30/2,096)" 표시되지만 클릭 시 동작 안 함
### 기대 동작
- 더보기 클릭 → next_page_token으로 다음 30건 로드 → 기존 결과에 append
- 로딩 스피너 표시
### 확인 사항
- search API 응답에 nextPageToken이 실제로 포함되는지 확인
- 프론트에서 page_token 파라미터를 제대로 보내는지 확인

## F3. 정렬 안됨
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
### 현재 동작
- 최신순/운영기간순 토글은 보이지만 실제 정렬 안 됨
### 기대 동작
- 최신순: start_date 내림차순 (기본)
- 운영기간순: durationDays 내림차순 (클라이언트 정렬)
- 토글 클릭 시 즉시 정렬 반영

## F4. 불필요한 필터 제거
### 파일
- `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
### 현재 동작
- 게재중 / Facebook / Instagram 필터가 존재
### 기대 동작
- 게재중 필터 삭제 — 검색 시 기본으로 게재중(active)만 불러오면 됨
- Facebook / Instagram 필터 삭제
- 남길 필터: 이미지 / 슬라이드 / 영상 (소재 유형만)

## F5. 카드 버튼 정리
### 파일
- `src/app/(main)/protractor/competitor/components/ad-card.tsx`
### 현재 동작
- 소재보기, 다운로드, 랜딩페이지, Facebook, Ad Library 5개 버튼
### 기대 동작
- **소재보기** — 유지 (이미지/영상 모달)
- **다운로드** — 유지 (클라이언트 직접 다운로드)
- **브랜드 등록** — 신규: 클릭 시 해당 광고의 page_id로 바로 모니터링 등록 (핀 꽂기)
- 랜딩페이지, Facebook, Ad Library 버튼 **삭제**
### 주의
- 브랜드 등록 버튼은 이미 등록된 브랜드면 비활성화 또는 "등록됨" 표시

## F6. 검색 기본값 = 게재중만
### 파일
- `src/lib/competitor/meta-ad-library.ts`
- `src/app/api/competitor/search/route.ts`
### 현재 동작
- 검색 시 active_status 파라미터 확인 필요
### 기대 동작
- SearchAPI.io 호출 시 `ad_active_status=active` 기본 설정
- 게재중이 아닌 광고는 검색 결과에 안 나옴

## 하지 말 것
- 모니터링 패널 UI 건드리지 마
- 검색 모드 토글(브랜드/키워드) 건드리지 마
- 선택 다운로드(체크박스+ZIP) 건드리지 마

## 검증 기준
- 브랜드 검색 "올리브영" → 드롭다운에 결과 표시 (page_results 파싱)
- 더보기 → 다음 30건 로드
- 최신순/운영기간순 → 실제 순서 변경
- 게재중/Facebook/Instagram 필터 칩 사라짐
- 카드에 소재보기 + 다운로드 + 브랜드등록 3개 버튼만
- 검색 결과 = 게재중 광고만
