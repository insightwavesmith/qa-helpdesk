# 경쟁사 분석기 v2 — T5 핀 리디자인 + NEW 알림

## 요구사항
- T5.1: 모니터링 패널 카드 리디자인 (프로필 사진 + IG + NEW 배지)
- T5.2: 핀 등록 시 BrandPage 정보 저장 강화
- T5.3: NEW 감지 Cron (page_id 기반, 중복 1회만 호출)
- T5.4: 광고 원본 링크 수정 (Meta에서 보기 → IG/FB/Ad Library)

## 범위
### In-scope
- monitor-brand-card.tsx 리디자인 (프로필사진, @IG, 광고 N건, 시간 전, NEW 배지)
- monitor-panel.tsx 클릭 시 new_ads_count 리셋
- monitors/route.ts POST body에 BrandPage 필드 추가
- brand-search-bar.tsx에서 핀 등록 → monitors API 호출 (dashboard에서 연결)
- cron/competitor-check/route.ts page_id 기반 검색 + new_ads_count/latest_ad_date 갱신
- ad-card.tsx, ad-media-modal.tsx "Meta에서 보기" → IG/FB/Ad Library 링크

### Out-of-scope
- 검색/필터/다운로드 UI 변경
- 기존 모니터 데이터 삭제

## 성공 기준
- 모니터링 카드에 프로필 사진 + @IG계정 + 광고건수 + 시간 표시
- NEW 배지 (new_ads_count > 0)
- 클릭 시 NEW 해제 (new_ads_count = 0, last_checked_at 갱신)
- 핀 등록 시 page_profile_url, ig_username, category, total_ads_count 저장
- Cron: page_id 기반 검색, 중복 page_id 1회만 호출, new_ads_count 증가
- 인스타/페북/Ad Library 링크 정상 동작
- tsc + lint + build 통과

## 의존성
- T1~T4 완료 (구조, 검색UI, 필터, 다운로드)
- competitor_monitors 테이블 v2 컬럼 이미 존재
