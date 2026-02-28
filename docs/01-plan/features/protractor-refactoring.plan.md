# 총가치각도기 리팩토링 Plan

## 배경
LP/장바구니 지표 제거, 4파트→3파트 구조 변경, 총가치수준 게이지 신규, 벤치마크 수집 Meta API 직접 호출로 전환.

## 범위
T1~T10 (10개 태스크), 숨은 이슈 H1~H5

## 성공 기준
- npm run build 성공
- lint 에러 0개
- 진단 API 3파트 응답
- 총가치수준 API 정상 동작

## 실행 순서
Phase 1(병렬): T1, T2, T4, T9
Phase 2: T3, T5
Phase 3: T6, T10
Phase 4: T7
Phase 5: T8

## 상세 분석
코드리뷰 보고서 참조 (TASK.md 리뷰 결과 섹션)
