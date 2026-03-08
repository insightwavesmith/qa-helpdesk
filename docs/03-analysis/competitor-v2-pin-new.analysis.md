# 경쟁사 분석기 v2 — T5 핀 리디자인 + NEW 알림 Gap 분석

## Match Rate: 95%

## 일치 항목 (19/20)

### T5.1 모니터링 패널 리디자인
- [x] 프로필 사진 (page_profile_url → graph.facebook.com → LetterAvatar 3단계 fallback)
- [x] 브랜드명 표시
- [x] @인스타계정 표시 (igUsername)
- [x] 광고 N건 표시 (totalAdsCount)
- [x] 시간 전 표시 (lastCheckedAt → timeAgo)
- [x] 🔴 NEW +N건 배지 (newAdsCount > 0)
- [x] 클릭 시 new_ads_count 리셋 (PATCH API + 낙관적 업데이트)
- [x] 클릭 시 last_checked_at 갱신
- [x] 삭제 버튼 유지
- [x] 모니터링 헤더에 NEW 개수 배지 표시

### T5.2 핀 등록 강화
- [x] POST body에 pageProfileUrl, igUsername, category 저장
- [x] 브랜드 검색 결과(BrandSearchBar)에서 핀 등록 버튼 연결
- [x] 핀 등록 → monitors API 호출 + monitors 상태 업데이트
- [x] AddMonitorDialog에서도 profileImageUrl 전달

### T5.3 NEW 감지 Cron
- [x] page_id 기반 searchMetaAds (searchPageIds 파라미터)
- [x] 중복 page_id는 캐시 활용하여 1회만 호출
- [x] 최신 광고 날짜 비교 + 전체 수 비교로 감지
- [x] new_ads_count 누적 증가 + latest_ad_date 갱신
- [x] total_ads_count 갱신 (serverTotalCount)

### T5.4 광고 원본 링크 수정
- [x] "Meta에서 보기" 제거 (모달 헤더 → FB/Ad Library 아이콘 버튼으로 대체)
- [ ] 📷 Instagram 링크 (ad에 igUsername이 없어 구현 미완 — ad 타입에 igUsername 필드 없음)

## 불일치 항목 (1/20)
1. **Instagram 링크**: CompetitorAd 타입에 igUsername 필드가 없음. 모니터에서는 표시되지만, 개별 광고 카드에서는 Instagram 링크를 표시할 수 없음. 이를 추가하려면 searchMetaAds 응답에서 igUsername을 전달해야 하나, SearchAPI.io 광고 검색 응답에는 이 정보가 없음. 대안: Facebook + Ad Library 링크로 대체 (구현 완료).

## 수정 불필요
- Instagram 링크는 TASK.md에서 "ig_username 있을 때"로 조건부 표시를 명시. 광고 카드에서 ig_username 정보를 얻을 수 없으므로 미표시는 정당함.

## 빌드 검증
- [x] npx tsc --noEmit 통과
- [x] npm run lint — 내 파일 에러 0
- [x] npm run build 성공

## 변경된 파일
1. `src/app/api/competitor/monitors/[id]/route.ts` — PATCH 메서드 추가
2. `src/app/api/competitor/monitors/route.ts` — POST body에 v2 필드 저장
3. `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx` — 리디자인
4. `src/app/(main)/protractor/competitor/components/monitor-panel.tsx` — 클릭 시 PATCH + NEW 배지
5. `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — onPinBrand + 모니터 클릭 page_id 검색
6. `src/app/api/cron/competitor-check/route.ts` — page_id 기반 + new_ads_count
7. `src/app/(main)/protractor/competitor/components/ad-card.tsx` — FB/Ad Library 링크 추가
8. `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` — Meta에서 보기 → FB/Ad Library
9. `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` — profileImageUrl 전달
10. `docs/01-plan/features/competitor-v2-pin-new.plan.md` — Plan
11. `docs/02-design/features/competitor-v2-pin-new.design.md` — Design
