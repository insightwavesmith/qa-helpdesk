# TASK: 경쟁사 분석기 v2 — T5 핀 리디자인 + NEW 알림

## 전제
- T1(구조) + T2(검색UI) 완료 후 실행
- competitor_monitors 테이블에 v2 컬럼 추가 완료
- `/api/competitor/brands` API 동작

## 목표
모니터링 패널을 프로필 사진 + 인스타 + NEW 배지로 리디자인. Cron으로 새 광고 자동 감지.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

## T5.1 모니터링 패널 리디자인
### 파일
- `src/app/(main)/protractor/competitor/components/monitor-panel.tsx`
- `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx`
### 할 것
- 브랜드 카드에 표시:
  - 프로필 사진 (page_profile_url, 32px 원형)
  - 브랜드명
  - @인스타계정 · 광고 N건 · 시간 전 확인
  - 🔴 NEW +N건 배지 (new_ads_count > 0일 때)
- 클릭 시: last_checked_at 갱신 + new_ads_count 0으로 리셋 + 광고 검색
- 삭제 버튼 유지

## T5.2 핀 등록 강화
### 파일
- `src/app/api/competitor/monitors/route.ts`
- `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx`
### 할 것
- 등록 시 page_profile_url, ig_username, category, total_ads_count 저장
- 브랜드 검색 결과(BrandPage)에서 핀 등록 버튼으로 바로 등록 가능
- 등록 API: POST body에 BrandPage 정보 포함

## T5.3 NEW 감지 Cron
### 파일
- `src/app/api/cron/competitor-check/route.ts` (수정)
### 할 것
- 등록된 모니터 목록 조회
- 중복 page_id는 1회만 호출 (크레딧 절약)
- 각 page_id로 searchMetaAds({ searchPageIds: page_id, limit: 1 }) → 최신 광고 날짜 확인
- start_date > latest_ad_date → new_ads_count 증가 + latest_ad_date 갱신
- total_ads_count도 갱신 (totalCount)

## T5.4 광고 원본 링크 수정
### 파일
- `src/app/(main)/protractor/competitor/components/ad-card.tsx`
- `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx`
### 할 것
- "Meta에서 보기" 링크 제거 (동작 안 함)
- 대신:
  - 📷 Instagram 링크: `instagram.com/{ig_username}` (ig_username 있을 때)
  - 📘 Facebook 링크: `facebook.com/{page_id}`
  - 🔍 Ad Library 링크: `facebook.com/ads/library/?active_status=all&ad_type=all&country=KR&view_all_page_id={page_id}`

## 하지 말 것
- 검색/필터/다운로드 UI 변경하지 마라
- 기존 모니터 데이터 삭제하지 마라

## 검증 기준
- 모니터링 패널: 프로필 사진 + 인스타 + 좋아요수 표시
- 핀 등록: 브랜드 검색에서 바로 등록 가능
- NEW 배지: Cron 실행 후 new_ads_count > 0이면 🔴 NEW 표시
- 브랜드 클릭 시 NEW 해제
- 인스타/페북 링크 정상 동작
