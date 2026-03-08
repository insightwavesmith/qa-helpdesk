# 수정사항 2차 (0308) Plan

## 배경
1차 수정(9512b1c)에서 T5(더보기)/T6(핀)은 console.log + stopPropagation만 추가하고 실제 버그를 수정하지 않음.

## T1: 개인정보처리방침 — 광고 데이터 수집 내용 추가
- **파일**: `src/app/privacy/page.tsx`
- **작업**: 섹션 3 "이용 데이터"에 자사몰/광고 데이터 항목 추가

## T2: 경쟁사 분석기 "더보기" 수정
- **파일**: `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- **원인 분석**: 코드 로직은 정상이나, 사용자 피드백(toast) 부재로 성공/실패 확인 불가. API 에러 시 에러 배너가 페이지 상단에만 표시되어 스크롤 위치에서 보이지 않음.
- **수정**: toast 피드백 추가, 결과 0건 시 안내, 에러 가시성 개선

## T3: 경쟁사 분석기 "핀" 수정
- **파일**: `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`, `ad-card.tsx`
- **원인 분석**: handlePinBrand 로직은 정상이나 성공 시 피드백(toast) 없음. API 실패 시 에러가 페이지 상단 배너에만 표시.
- **수정**: 등록 성공/실패 toast, isPinned 상태 즉시 반영

## 성공 기준
- /privacy 에 광고 데이터 수집 내용 표시
- 더보기 클릭 → 추가 광고 카드 로드 (또는 결과 없음 toast)
- 핀 클릭 → 모니터링 패널에 등록 + 성공 toast
- npm run build 성공
