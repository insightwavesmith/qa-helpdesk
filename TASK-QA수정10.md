# TASK-QA수정10.md — 노출당구매확률 표시 + CTR 위치 통일 (재수정)

> 작성: 모찌 | 2026-02-28 08:50
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 1c2a439
> ⚠️ Plan 인터뷰 스킵: 질문 없이 바로 개발 실행

---

## 타입
버그 수정 / UI 통일

## 제약
- npm run build 성공 필수
- DB 컬럼명(reach_to_purchase_rate) 변경하지 말 것

---

## 핵심 문제: 지표 그룹핑이 3곳에 분산되어 불일치

현재 지표 그룹핑 정의가 3곳에 있고 동기화가 안 됨:
1. `src/lib/protractor/t3-engine.ts` → T3_PARTS (점수 계산)
2. `src/app/(main)/protractor/components/content-ranking.tsx` → BENCH_METRICS (카드 렌더링)
3. `src/app/(main)/protractor/components/benchmark-compare.tsx` → VIDEO/ENGAGEMENT/CONVERSION_METRICS

**이 3곳의 지표 그룹핑을 하나의 공통 상수로 통일할 것.**
예: `src/lib/protractor/metric-groups.ts`에 정의하고 3곳에서 import.

---

## Part 1. 노출당 구매확률 표시

### 라벨
"노출당 구매확률" (도달당구매율 X — 이전 TASK 라벨 오류)

### 키
`reach_to_purchase_rate` (DB 컬럼명 유지, 변경 금지)

### 계산
purchases / impressions × 100 (분모가 impressions임에 주의)

### 수정 위치
- 성과요약 탭(benchmark-compare.tsx): 전환 지표 섹션에 5번째로 추가
- 콘텐츠 탭(content-ranking.tsx): 전환 섹션에 추가
- t3-engine.ts T3_PARTS conversion: 포함 확인

---

## Part 2. CTR 위치 통일 (콘텐츠 카드)

### 현상
- 1등 카드: diagnosis.parts가 있으면 DiagnosisDetail 렌더링
- 2~5등 카드: BenchmarkCompareGrid 렌더링
- 두 렌더링 경로에서 CTR 배치가 다름

### 근본 해결
**1~5등 모두 동일한 지표 그룹핑을 사용하도록 통일.**
DiagnosisDetail이든 BenchmarkCompareGrid이든 동일한 공통 상수에서 그룹 정의를 가져올 것.

### 지표 그룹핑 (13개)
```
영상(3): 3초재생률(video_p3s_rate), 끝까지시청률(thruplay_rate), 이탈률(retention_rate)
참여(5): 좋아요(reactions_per_10k), 댓글(comments_per_10k), 공유(shares_per_10k), 저장(saves_per_10k), 참여합계(engagement_per_10k) /만노출
전환(5): CTR(ctr), 결제시작율(click_to_checkout_rate), 구매전환율(click_to_purchase_rate), 결제→구매율(checkout_to_purchase_rate), 노출당구매확률(reach_to_purchase_rate)
```

---

## 리뷰 결과
코드리뷰 완료 — 타입 에러 0, lint 통과

## 검증
1. npm run build 성공
2. /protractor?account=1112351559994391 성과요약: 전환 지표 5개 (CTR, 결제시작율, 구매전환율, 결제→구매율, **노출당구매확률**)
3. 콘텐츠 탭: 1~5등 카드 전부 동일한 섹션 구조 (영상3 + 참여5 + 전환5)
4. 모든 카드에서 CTR이 전환 섹션에 위치

## 변경 상세

### Part 1 — 노출당구매확률
- 현재: "도달당구매율" 라벨, purchases/reach 계산
- 목업: "노출당구매확률" 라벨, purchases/impressions 계산
- 변경: metric-groups.ts 공통 상수에 "노출당구매확률" 라벨 정의, t3-engine.ts + aggregate.ts 계산식 reach→impressions 수정

### Part 2 — CTR 위치 통일
- 현재: 1등 카드 DiagnosisDetail, 2~5등 BenchmarkCompareGrid — 그룹핑 불일치
- 목업: 1~5등 모두 동일 구조 (영상3 + 참여5 + 전환5)
- 변경: 공통 metric-groups.ts에서 import, 모든 카드 BenchmarkCompareGrid 사용, ROAS 제거
