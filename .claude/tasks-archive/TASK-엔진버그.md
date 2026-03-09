# TASK-엔진버그.md — t3-engine 참여지표 리턴 누락 + video 역산 버그

> 작성: 모찌 | 2026-02-27 19:54
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 905f6a8
> ⚠️ Plan 인터뷰 스킵: 질문 없이 바로 Plan 작성 후 실행할 것

---

## 타입
버그 수정

## 제약
- daily_ad_insights 테이블 구조 변경 금지
- npm run build 성공 필수

---

## T1. 버그 1 (Critical): computeMetricValues 참여 개별 4개 지표 리턴 누락

### 파일
`src/lib/protractor/t3-engine.ts` → `computeMetricValues` 함수

### 현상
- 현재: 리턴 객체에 engagement_per_10k(합계)만 포함. reactions/comments/shares/saves_per_10k 4개 누락
- 변경: 리턴 객체에 4개 개별 지표 추가하여 T3_PARTS engagement 5개 키 전부 값 리턴

### 수정
computeMetricValues 리턴 객체에 다음 4줄 추가:

```typescript
reactions_per_10k: totalImpressions > 0 ? (totalReactions / totalImpressions) * 10000 : null,
comments_per_10k: totalImpressions > 0 ? (totalComments / totalImpressions) * 10000 : null,
shares_per_10k: totalImpressions > 0 ? (totalShares / totalImpressions) * 10000 : null,
saves_per_10k: totalImpressions > 0 ? (totalSaves / totalImpressions) * 10000 : null,
```

### 검증
수정 후 T3_PARTS.engagement.metrics의 5개 키(reactions/comments/shares/saves/engagement _per_10k) 전부 metricValues에서 값이 나오는지 확인

---

## T2. 버그 2: video_p3s_rate 역산 시 reach 사용 (impressions여야 함)

### 파일
`src/lib/protractor/t3-engine.ts` → `computeMetricValues` 함수

### 현상
video_p3s_rate를 원본 수(videoP3s 건수)로 역산할 때 `reach`를 분모로 사용 중.
하지만 collect-daily에서 `video_p3s_rate = videoP3s / impressions * 100`으로 계산함.
역산도 impressions 기준이어야 정확함.

### 현재/변경
- 현재: `totalVideoP3s += (p3sRate / 100) * rowReach` — reach로 역산 (틀림)
- 변경: `totalVideoP3s += (p3sRate / 100) * imp` — impressions로 역산
- 현재: 리턴 `video_p3s_rate: totalReach > 0 ? ...` — reach 분모
- 변경: 리턴 `video_p3s_rate: totalImpressions > 0 ? ...` — impressions 분모

### 같은 패턴 확인
thruplay_rate, retention_rate 역산도 동일한 문제 있는지 확인 후 일괄 수정할 것.
collect-daily 기준:
- thruplay_rate = thruplay / impressions * 100 → 역산도 impressions
- retention_rate = videoP100 / videoP3s * 100 → 이건 별도 확인

---

## 리뷰 결과
- T1: 리턴 누락 확인 완료. 4줄 추가로 해결.
- T2: reach→impressions 분모 수정. thruplay_rate는 이미 정상. retention_rate는 별도 이슈.

## 검증 방법
1. npm run build 성공
2. /protractor?account=1112351559994391 에서 성과요약 탭:
   - 좋아요/만노출, 댓글/만노출, 공유/만노출, 저장/만노출 값이 "-"가 아닌 숫자로 표시
   - 참여합계/만노출과 개별 4개의 합이 일치
3. 영상 3초재생률 값이 이전보다 달라졌는지 확인 (impressions vs reach 차이)
