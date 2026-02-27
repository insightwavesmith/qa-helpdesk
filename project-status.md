# BS CAMP QA Helpdesk — PDCA 프로젝트 현황

> 최종 업데이트: 2026-02-27 18:12 KST
> 프로젝트: https://bscamp.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk

---

## Phase: Act (반복 개선)

## 완료된 작업

### 총가치각도기 v2 — Phase 1~4 (완료)
- Phase 1: LP/장바구니 제거 + DB 타입 재작성 → `b92d3f0`
- Phase 2: collect-benchmarks GCP 방식 재작성 → `de8bc30`
- Phase 3: 진단 엔진 3파트 + 벤치마크 API → `4e16647`
- Phase 4: UI v2 (탭 2개, 콘텐츠 1~5, 벤치마크 관리) → `4e16647`

### UI 수정 T1~T9 (완료)
- 탭 4→2 (성과요약/콘텐츠) → `471d517`
- 타겟중복 성과요약 안으로 이동
- 콘텐츠 전부 펼침 + 벤치마크 비교 그리드 → `5bc373f`
- 광고계정 삭제 버튼 → `6986843`
- video_p3s_rate 계산 버그 수정 (video_play_actions → video_view)
- mixpanel 매출 속성 $amount → value → `3f43467`

### 버그 수정 B1~B7 + A1~A4 (완료)
- account_name ID 저장 버그 4곳 수정 → `9304b34`
- roleLabels에 assistant 추가
- per_10k 지표 재계산 로직
- 타겟중복/overlap 7일 제한 제거

### 인프라
- Vercel 중복 프로젝트 삭제 (qa-helpdesk → bscamp만)
- NEXT_PUBLIC_SITE_URL 환경변수 추가
- 벤치마크 수집 크론 실행 완료 (33행)
- 믹스패널 수집 크론 실행 (value 속성 수정 후 재수집 필요)

---

## 현재 진행 중

### TASK-QA수정7.md — Smith님 직접 QA 피드백 (에이전트팀 작업 중)
- D1: 광고계정 삭제 실제 작동 + 새로고침
- D2: 광고계정/믹스패널 추가 기능
- D3: 5개 필드 세트 통일 (광고계정ID, 광고계정명, 믹스패널프로젝트ID, 믹스패널시크릿키, 믹스패널보드ID)
- D4: 타겟중복 새로고침 버튼 삭제 + 데이터 표시 + 상위 1,2,3등 세트 쌍 노출
- D5: 참여율 진단상세 좋아요/댓글/공유/저장 개별 4개 + 합계
- D6: collect-daily ad_id NULL 버그 (콘텐츠 #1만 나오는 근본 원인)

### 미커밋 수정 (TASK-QA수정6.md, 에이전트팀 완료 → 커밋 대기)
- collect-daily ad_id 매핑 수정
- 레거시 필드 제거
- 진단 API HTML 에러 핸들링
- overlap 7일 제한 제거

---

## 대기 (다음 작업)

### 자사몰매출 탭 (Smith님 지시 2026-02-27)
- 수강생 성과 페이지에 "자사몰매출" 탭 추가
- daily_mixpanel_insights → 기간별 total_revenue/purchase_count

### 백로그
1. 초대코드 만료 로직 — 기간 지났는데 활성화 상태
2. 노션 피드백반 임베딩 업데이트 — projects/active/notion-sprint-pipeline/TASK.md 1,2번
3. collect-mixpanel 재수집 (value 속성 수정 후)
4. collect-benchmarks 재수집 (video_p3s_rate 수정 후)
5. 메타 배지 개발 (보류)
6. QA 임베딩 파이프라인

---

## 핵심 지표
- 배포: https://bscamp.vercel.app (READY)
- 최신 커밋: 9304b34 + 미커밋 6파일
- 빌드: 성공 (tsc 0에러)
- DB: benchmarks 33행, ad_insights_classified 활성, daily_mixpanel_insights 1행
- 크론: collect-daily 12:00 KST / collect-benchmarks 월 11:00 KST / collect-mixpanel 12:30 KST
