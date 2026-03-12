# 전체 탭 전환 속도 개선 Plan

## 목표
모든 탭(홈, Q&A, 정보공유, 수강후기, 총가치각도기) 전환 시 체감 속도 1초 미만으로 개선

## 범위
- T1: next/link prefetch 확인 및 적용
- T2: Next.js Router Cache (staleTimes) 설정
- T3: 정보공유 이미지 최적화 (next/image sizes 속성)
- T4: /questions, /posts loading.tsx 추가

## 성공 기준
- 탭 전환 시 즉시 Skeleton UI 표시
- 이미 방문한 페이지 재방문 시 캐시에서 즉시 로드
- 이미지 목록 페이지에서 적절한 크기로 로드

## 하지 말 것
- API 로직 변경 금지
- 에디터 관련 변경 금지
- 관리자 페이지 변경 금지
