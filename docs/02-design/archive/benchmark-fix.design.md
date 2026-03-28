# 벤치마크 수집/계산 로직 수정 설계서

## 1. 데이터 모델
- benchmarks 테이블 변경 없음
- unique constraint: `(creative_type, ranking_type, ranking_group, date, category)` — 이미 creative_type 포함
- creative_type 값: ALL, VIDEO, IMAGE, CATALOG

## 2. API 변경

### 2-1. AD_FIELDS 수정
```
Before: creative.fields(object_type,product_set_id)
After:  creative.fields(object_type,product_set_id,video_id,image_hash)
```

### 2-2. getCreativeType() 수정
```
1순위: creative.video_id 존재 → VIDEO
2순위: creative.image_hash 존재 + product_set_id 없음 → IMAGE
3순위: creative.product_set_id 존재 → CATALOG
fallback: object_type 기반 (기존 로직)
```

타입 변경:
```ts
const creative = ad.creative as {
  object_type?: string;
  product_set_id?: string;
  video_id?: string;
  image_hash?: string;
} | undefined;
```

### 2-3. calcTrimmedWeightedAvg() (calcGroupAvg 대체)

가중치 매핑:
| 지표 | 가중치 필드 |
|---|---|
| video_p3s_rate, thruplay_rate, retention_rate, ctr | impressions |
| reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k, engagement_per_10k | impressions |
| click_to_checkout_rate, click_to_purchase_rate, checkout_to_purchase_rate | clicks |
| roas | spend |
| reach_to_purchase_rate | reach |

알고리즘:
```
1. 해당 지표가 양수인 광고만 필터
2. 값 기준 오름차순 정렬
3. 데이터 3건 이상: 상하위 10% 제거 (최소 1개씩)
4. 남은 광고들로 가중 평균: Σ(value_i × weight_i) / Σ(weight_i)
5. 데이터 3건 미만: trimming 없이 가중 평균
```

### 2-4. STEP 2 creative_type별 루프

```ts
const creativeTypes = ["ALL", "VIDEO", "IMAGE", "CATALOG"] as const;

for (const ct of creativeTypes) {
  const pool = ct === "ALL" ? allClassified : allClassified.filter(a => a.creative_type === ct);
  if (pool.length === 0) continue;
  // ranking_type × ranking_group 루프 (기존과 동일)
}
```

STEP 3 (MEDIAN_ALL)도 동일하게 creative_type별 루프 적용.

## 3. 컴포넌트 구조
- 프론트엔드 변경 없음

## 4. 에러 처리
- 변경 없음 (기존 에러 처리 유지)

## 5. 구현 순서
- [ ] AD_FIELDS에 video_id, image_hash 추가
- [ ] getCreativeType() 분류 로직 수정
- [ ] calcGroupAvg() → calcTrimmedWeightedAvg() 변경
- [ ] STEP 2에 creative_type별 루프 추가
- [ ] STEP 3에 creative_type별 루프 추가
- [ ] 응답 JSON에 계산 방식 표기
- [ ] 빌드 검증
