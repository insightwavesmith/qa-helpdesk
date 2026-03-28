# 수정사항 4차 (4건) — Plan

## 배경
서비스 오픈(3/9) 전 마지막 수정. 반복 실패 건(T1, T2) 포함.

## 범위
- T1: 경쟁사 분석기 "더보기" 페이지네이션 수정
- T2: 초대코드 사용량 차감 버그 수정
- T3: 온보딩 믹스패널 필드 필수화
- T4: 키워드 검색 강화 (브랜드사전 + 폴백 + 자동영문변환)

## 성공 기준
- T1: 더보기 클릭 시 추가 광고 로드
- T2: 초대코드 가입 시 used_count +1
- T3: 믹스패널 3개 필드 미입력 시 버튼 비활성화
- T4: "젝시미스" 검색 시 결과 표시
- npm run build 성공

## 수정 파일
- `src/lib/competitor/meta-ad-library.ts`
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/actions/invites.ts`
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/onboarding/page.tsx`
- `src/app/api/competitor/search/route.ts`
