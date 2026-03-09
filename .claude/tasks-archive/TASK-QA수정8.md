# TASK-QA수정8.md — Smith님 직접 QA + 서브에이전트 QA 통합 수정

> 작성: 모찌 | 2026-02-27 18:56
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 7bd1126
> Smith님 직접 피드백 (18:42~18:55) + 브라우저 QA 결과 기반
> ⚠️ 사고 모드: high (10000) — 각 항목마다 API 엔드포인트, 백엔드/프론트엔드 영향 범위 신중하게 판단할 것
> ⚠️ Plan 인터뷰 스킵: 질문 없이 바로 Plan 작성 후 실행할 것

---

## 타입
버그 수정 + 기능 추가 + UI 개선

## 제약
- daily_ad_insights 테이블 구조 변경 금지
- npm run build 성공 필수
- Agent Teams delegate로 역할 분배 (프론트/백 병렬)
- **각 수정 전에 관련 API 엔드포인트 + 데이터 흐름 전체를 먼저 파악한 후 수정**

---

## E1. 성과요약 DiagnosticPanel — 참여율 개별 4개 + 합계 (Critical)

**현재:** 성과요약 T3 진단상세에서 참여율 파트에 "참여합계/만노출" 하나만 표시
**기대:** 좋아요/댓글/공유/저장 개별 4개 → 구분선 → 참여합계/만노출

**데이터 흐름:**
```
GET /api/protractor/total-value → calculateT3Score() → diagnostics
  → DiagnosticPanel.tsx (T3DiagnosticView)
```

**확인:**
- `src/lib/diagnosis/metrics.ts` — PART_METRICS 참여율 파트에 5개 지표 정의 확인 (19~23줄)
- `src/lib/diagnosis/engine.ts` — calculateT3Score에서 5개 전부 metricResults에 포함하는지
- `src/app/api/protractor/total-value/route.ts` — computeMetricValues에서 개별 4개(reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k) 값이 계산되는지
- `src/components/protractor/DiagnosticPanel.tsx` — T3DiagnosticView에서 참여율 파트 렌더링 시 개별 4개 + 합계 구조로 변경

**수정:**
- DiagnosticPanel.tsx에서 참여율 파트(part.label === "참여율") 감지
- 개별 4개 지표 먼저 렌더 → `<hr>` 구분선 → 참여합계 렌더
- 기반점수/전환율 파트는 기존대로

---

## E2. 콘텐츠 카드 — 참여합계 + 결제시작율 + 결제→구매율 누락

**현재:** 콘텐츠 카드 벤치마크 비교 그리드에서 참여합계, 결제시작율, 결제→구매율 미표시
**기대:** 진단 엔진(metrics.ts)에 정의된 13개 지표 전부 표시

**데이터 흐름:**
```
POST /api/diagnose → diagnoseAd() → parts[].metrics[]
  → content-ranking.tsx → top5-ad-cards.tsx → 벤치마크 비교 그리드
```

**확인:**
- `src/lib/diagnosis/metrics.ts` — 참여율 파트: reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k, engagement_per_10k (5개)
- `src/lib/diagnosis/metrics.ts` — 전환율 파트: click_to_checkout_rate(결제시작율), checkout_to_purchase_rate(결제→구매율) 포함 확인 (30, 32줄)
- `src/app/(main)/protractor/components/top5-ad-cards.tsx` — 참여율 파트 렌더링에서 개별 4개 + 합계 표시하되, 합계도 빠지면 안 됨
- `src/app/(main)/protractor/components/content-ranking.tsx` — diagnose API 호출 후 metrics 전달 확인

**수정:**
- top5-ad-cards.tsx: 참여율 파트 → 개별 4개 + 구분선 + 합계
- 전환율 파트: 결제시작율/결제→구매율 포함 확인 (빠져있으면 추가)
- 13개 지표 전부 빠짐없이 표시

---

## E3. 콘텐츠 카드 — 광고통계 / 믹스패널 외부 링크

**현재:** 광고통계 버튼 클릭 시 링크 이동 안 됨
**기대:** 각 콘텐츠 카드에 2개 외부 링크

**링크 형식:**
- 광고통계: `https://adsmanager.facebook.com/adsmanager/manage/ads/insights?act={account_id}&selected_ad_ids={ad_id}&nav_source=no_referrer`
- 믹스패널: `https://mixpanel.com/project/{mixpanel_project_id}/view` (mixpanel_project_id가 있을 때만 표시)

**수정:**
- top5-ad-cards.tsx 또는 content-ranking.tsx에서 각 카드에 링크 버튼 추가
- `<a href={url} target="_blank" rel="noopener noreferrer">`
- ad_id가 NULL이면 링크 비활성 (ad_id 수집 후 활성화)
- account_id는 props로 전달, mixpanel_project_id도 props 확인

---

## E4. 콘텐츠 카드 — 광고비가 전체 합계로 나오는 버그

**현재:** #1 카드에 전체 광고비 합계(1,362,552)가 표시됨 — 개별 광고의 광고비가 아님
**원인:** ad_id가 전부 NULL → getTop5Ads()에서 모든 행이 하나로 합쳐짐

**데이터 흐름:**
```
GET /api/protractor/insights → daily_ad_insights (ad_id NULL)
  → real-dashboard.tsx: setInsights(data)
    → ContentRanking: getTop5Ads(insights)
      → ad_id별 Map 그루핑 → NULL이 전부 같은 키 → 하나로 합산
```

**수정:**
1. collect-daily의 ad_id 매핑이 올바르게 수정됐는지 최종 확인 (이전 커밋에서 수정)
2. getTop5Ads()에서 ad_id가 NULL인 행은 제외하거나 별도 처리
3. **collect-daily 재실행 후에야 실제 데이터가 정상화됨** — 코드 수정만으로는 기존 NULL 데이터 해결 불가

---

## E5. 타겟중복 — 크론 수집 전환 (온디맨드 → DB)

**현재:** Meta overlap API를 사용자가 페이지 볼 때 실시간 호출 → 오류 빈번
**기대:** collect-daily에서 overlap 데이터도 수집 → DB 저장 → 페이지에서 DB 조회만

**백엔드:**
- `daily_overlap_insights` 테이블 신규 생성:
  ```sql
  CREATE TABLE daily_overlap_insights (
    id serial PRIMARY KEY,
    account_id text NOT NULL,
    date date NOT NULL,
    overall_rate numeric DEFAULT 0,
    total_unique_reach bigint DEFAULT 0,
    individual_sum bigint DEFAULT 0,
    pairs jsonb DEFAULT '[]',
    collected_at timestamptz DEFAULT now(),
    UNIQUE(account_id, date)
  );
  ```
- `src/app/api/cron/collect-daily/route.ts`에 overlap 수집 로직 추가:
  - 각 계정별로 Meta Graph API `/act_{id}/delivery_estimate` 호출
  - 결과를 daily_overlap_insights에 INSERT
  - 실패해도 다른 수집에 영향 없게 try/catch 분리

**프론트엔드:**
- `OverlapAnalysis.tsx` — Meta API 직접 호출 제거 → DB 데이터 조회로 변경
- `src/app/api/protractor/overlap/route.ts` — Meta API 호출 → DB SELECT로 변경
- 새로고침 버튼 완전 제거

---

## E6. /admin/protractor — 벤치마크 데이터 표시

**현재:** 날짜만 표시되고 기능 없음
**기대:** BenchmarkAdmin 컴포넌트로 벤치마크 데이터 테이블 표시

**확인:**
- `src/app/(main)/admin/protractor/page.tsx` — 현재 렌더링 내용
- `src/app/(main)/protractor/components/benchmark-admin.tsx` — 이미 만들어진 BenchmarkAdmin 컴포넌트
- 이 컴포넌트를 admin/protractor/page.tsx에서 import해서 사용

**수정:**
- admin/protractor/page.tsx에 BenchmarkAdmin 컴포넌트 렌더
- 권한 체크: admin/lead만 접근 (기존 middleware에서 처리 중인지 확인)

---

## E7. 설정 페이지 — 좌우 너무 넓음

**파일:** `src/app/(main)/settings/page.tsx` 또는 `settings-form.tsx`

**현재:** 화면 전체 너비로 펼쳐짐 (관리자/수강생 둘 다)
**수정:** 컨테이너에 `max-w-3xl mx-auto` 적용

---

## E8. 네비게이션 바 중간 정렬

**파일:** `src/components/navigation/` 또는 `src/app/(main)/layout.tsx`

**현재:** 메뉴(홈/Q&A/정보공유/수강후기/총가치각도기)가 가운데 정렬 안 맞음
**수정:** flex justify-center 또는 적절한 정렬 클래스

---

## E9. 자사몰매출 탭 — 수강생 성과 페이지

**현재:** 수강생 성과(/admin/performance)에 광고매출(Meta purchase_value)만 표시
**기대:** "자사몰매출" 탭 추가 → daily_mixpanel_insights.total_revenue 기간별 표시

**데이터 흐름:**
```
daily_mixpanel_insights (collect-mixpanel 크론으로 수집)
  → 수강생별 mixpanel_project_id 매핑 (ad_accounts 테이블)
    → 기간별 SUM(total_revenue), SUM(purchase_count) 조회
      → 성과 테이블에 "자사몰매출" 컬럼 추가
```

**백엔드:**
- `src/actions/performance.ts` — getStudentPerformance에 mixpanel 매출 조회 추가
- daily_mixpanel_insights JOIN ad_accounts ON mixpanel_project_id

**프론트엔드:**
- 성과 페이지에 "자사몰매출" 탭 또는 컬럼 추가

---

## QA 서브에이전트 발견 추가 이슈

### F1. 광고계정 삭제 실패 (QA #2.3.4 FAIL)
- 삭제 confirm → alert "삭제되었습니다" → 실제 DB에서 삭제 안 됨
- handleDeleteAccount 함수에서 DELETE API 호출 에러 무시 가능성
- **API 엔드포인트 + 응답 코드 + 에러 핸들링 전부 확인**

### F2. 광고계정 추가 폼에 시크릿키 필드 누락 (QA #2.3.5 FAIL)
- 추가 폼에 광고계정ID + 광고계정명 + 믹스패널프로젝트ID + 믹스패널보드ID만 4개
- 시크릿키 필드 누락

### F3. 콘텐츠 API 에러 — 어제 기간 (QA #3.6.1 FAIL)
- 어제 기간 콘텐츠 탭에서 "데이터를 불러오는 중 오류가 발생했습니다" 에러
- diagnose API가 HTML 반환하는 문제 가능성

### F4. 타겟중복 "Meta API 오류" (QA #3.5.3 FAIL)
- "Meta API 오류가 발생했습니다. 잠시 후 다시 시도해주세요." → E5에서 해결 예정

### F5. 수강생 콘텐츠 탭 데이터 없음 (QA #4.3 SKIP)
- student 계정에 광고 데이터 없어서 콘텐츠 탭 미확인

---

## 완료 기준
- [ ] E1: 성과요약 참여율 개별 4개 + 합계
- [ ] E2: 콘텐츠 13개 지표 전부 표시
- [ ] E3: 광고통계/믹스패널 외부 링크 작동
- [ ] E4: 광고비 개별 광고별 표시 (ad_id NULL 후속)
- [ ] E5: 타겟중복 크론 수집 + DB 조회
- [ ] E6: /admin/protractor 벤치마크 데이터
- [ ] E7: 설정 페이지 max-width
- [ ] E8: 네비게이션 중간 정렬
- [ ] E9: 자사몰매출 탭
- [ ] F1: 광고계정 삭제 실제 작동
- [ ] F2: 추가 폼 시크릿키 필드
- [ ] F3: 콘텐츠 API 에러 수정
- [ ] npm run build 성공
- [ ] tsc --noEmit 0에러

---

## 리뷰 결과
리뷰어: 백엔드 에이전트 자체 검토
현재: 각 태스크 구현 완료, 빌드 검증 중
변경: E1(t3-engine), F1(onboarding), E5(overlap-utils/collect-daily/overlap-route), E9(performance), F3(diagnose)

## T1. 백엔드 구현 (E1, F1, E5, E9, F3)
현재: t3-engine engagement 1개 지표, removeAdAccount 에러 체크 없음, overlap 크론 미수집
변경: engagement 5개 지표, 에러 체크 추가, overlap 크론 수집 + DB 전환, mixpanel 매출 조회
