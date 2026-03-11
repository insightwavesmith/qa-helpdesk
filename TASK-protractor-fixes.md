# TASK: 총가치각도기 3가지 수정

## 1. 진단 메시지 제거
- 총가치각도기 하단에 표시되는 "🔴 영상을 먼저 바꿔야 해요. 3초 훅이 약해요." 같은 진단 메시지를 삭제
- 관련 코드 전체 제거 (조건부 메시지 로직)

## 2. 상단 카테고리 바 색상 로직 수정
- 현재 문제: 기반점수/참여율/전환율 상단 바가 개별 지표 중 하나만 빨강이어도 전체가 빨강으로 표시됨
- 수정: 카테고리별 종합 점수(개별 지표의 실제값/기준값 비율 평균)로 판정
  - 비율 ≥ 1.0 → 🟢 초록 (기준치 이상)
  - 0.75 ≤ 비율 < 1.0 → 🟡 노랑 (근접)
  - 비율 < 0.75 → 🔴 빨강 (미달)
- 개별 지표의 색상 로직은 현재 정상 — 건드리지 말 것

## 3. 벤치마크 관리자 페이지 — 최신 데이터 표시
- `/protractor` 관리자 페이지(benchmark-admin.tsx)에서 벤치마크 데이터가 과거 데이터만 보임
- 재수집한 최신 벤치마크(2026-03-09, creative_type별 VIDEO/IMAGE/CATALOG 포함)가 표시돼야 함
- API(`/api/protractor/benchmarks`)가 최신 날짜 데이터를 반환하는지 확인
- 프론트엔드가 creative_type별 탭으로 올바르게 필터링하는지 확인

## 참조 파일
- 총가치각도기 UI: `src/app/(main)/protractor/` 하위 컴포넌트들
- 벤치마크 관리자: `src/app/(main)/protractor/components/benchmark-admin.tsx`
- 벤치마크 API: `src/app/api/protractor/benchmarks/route.ts`
- 진단 API: `src/app/api/diagnose/route.ts`

## 빌드 검증
- `npm run build` 통과 확인
- TypeScript 타입 에러 없음

## 커밋 + 푸시
- 커밋 메시지: `fix: 총가치각도기 — 진단메시지 제거, 카테고리 색상 로직 수정, 벤치마크 최신 데이터 표시`
- main 브랜치에 푸시
