# TASK — QA 후 버그픽스 (2차)

> 작성: 모찌 | 2026-02-25
> QA 결과 기반 버그 10건 → 정상 2건 제외 = 8건

---

## B1. 벤치마크 수집 크론 중단 (긴급)
- 현상: benchmarks 테이블 최신 데이터 2026-02-02, daily_ad_insights 최신 2026-02-05
- 원인 조사: `/api/cron/collect-benchmarks` + `/api/cron/collect-daily` 크론 실행 로그 확인
- 벤치마크는 Smith님 META_ACCESS_TOKEN으로 전체 접근 계정에서 수집 → 수강생 가입 무관
- 수정: 크론 에러 원인 파악 + 수정 + 수동 1회 실행으로 데이터 복구

## B2. 사이드바 "수강생 성과" 메뉴 누락
- 현상: /admin/performance 페이지 존재하지만 사이드바에 링크 없음
- 수정: app-sidebar.tsx에 "수강생 성과" → `/admin/performance` 메뉴 추가

## B3. /admin/owner-accounts 사이드바 미연결
- 현상: "광고계정 관리"가 /admin/accounts로 연결 (다른 페이지)
- 수정: 사이드바에 "내 광고계정" → `/admin/owner-accounts` 메뉴 추가 또는 기존 링크 수정

## B4. 타겟중복 탭 서버 오류
- 현상: 타겟중복 탭 클릭 시 "서버 오류가 발생했습니다"
- 원인: 광고계정 미연결 상태에서 API 호출 시 에러 핸들링 부재
- 수정: overlap API에서 account_id 없거나 데이터 없을 때 빈 상태 UI 표시 ("광고계정을 연결하면 타겟중복 분석을 사용할 수 있습니다")

## B5. /api/og 미인증 접근 불가
- 현상: 미인증 시 307 → /login 리다이렉트
- 문제: 소셜 공유(카카오, 슬랙 등)에서 OG 이미지를 못 가져옴
- 수정: middleware.ts에서 /api/og 경로를 인증 예외 처리

## B6. 전환 퍼널 "장바구니" 단계 잔존
- 현상: ConversionFunnel 차트에 노출→클릭→장바구니→구매 표시
- 수정: ConversionFunnel.tsx에서 장바구니 단계 제거 → 노출→클릭→결제시작→구매

## B7. 진단 3파트 라벨 미표시
- 현상: 기반점수/참여율/전환율 섹션명이 UI에 없음
- 수정: DiagnosticPanel에서 이슈를 파트별로 그룹핑하여 섹션 헤더 표시

## B8. admin/protractor/status/route.ts daily_lp_metrics 잔류
- 현상: LP 제거했지만 status API에 daily_lp_metrics 쿼리 참조 남아있음
- 수정: 해당 쿼리 제거

---

## 완료 기준
- 빌드 성공
- 벤치마크 데이터 최신 날짜 확인
- 사이드바 메뉴 3개 정상 연결
- 타겟중복 탭 빈 상태 UI 표시
- /api/og 미인증 200 응답
- 전환 퍼널 장바구니 없음
