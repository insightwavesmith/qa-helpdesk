# TASK: 벤치마크 수집/계산 로직 수정

## 배경
현재 벤치마크 계산에 2가지 문제가 있다:
1. **creative_type 분류 오류**: 수동업로드 광고가 CATALOG로 잘못 분류됨 (object_type=SHARE → 무조건 CATALOG)
2. **계산 방식 왜곡**: 단순 산술 평균 → 이상치(전환율 54% 등)가 벤치마크를 왜곡

## 작업 1: creative_type 분류 로직 수정

**파일**: `src/app/api/cron/collect-benchmarks/route.ts` → `getCreativeType()`

### 현재 (잘못된 분류)
```
object_type=VIDEO → VIDEO
object_type=SHARE → CATALOG (❌ 수동업로드도 여기로)
object_type=IMAGE + product_set_id → CATALOG
object_type=IMAGE → IMAGE
```

### 수정 (소재 기반 분류)
```
1순위: creative.video_id 존재 → VIDEO
2순위: creative.image_hash 존재 (+ product_set_id 없음) → IMAGE
3순위: creative.product_set_id 존재 → CATALOG (진짜 다이나믹 광고)
fallback: object_type 기반 (기존 로직)
```

### API 요청 필드 추가
현재 `AD_FIELDS`에 `creative{object_type,product_set_id}` 요청 중.
→ `creative{object_type,product_set_id,video_id,image_hash}` 로 변경

### 핵심
- "카탈로그 설정 사용 + 수동업로드 영상" → VIDEO로 분류되어야 함
- "카탈로그 설정 사용 + 수동업로드 이미지" → IMAGE로 분류되어야 함
- video_id/image_hash를 최우선으로 체크 → 소재 자체의 형식으로 판별

## 작업 2: 계산 방식 변경 (Trimmed Weighted Mean)

**파일**: `src/app/api/cron/collect-benchmarks/route.ts` → `calcGroupAvg()`

### 현재 (단순 산술 평균)
```ts
양수값 모아서 sum / count
```

### 수정 (Trimmed 가중 평균)
```
1. 해당 지표가 양수인 광고만 필터
2. 값 기준 오름차순 정렬
3. 상하위 10% 제거 (최소 trim 1개씩)
4. 남은 광고들로 가중 평균 계산
```

### 가중치 기준 (지표별 분모)
| 지표 카테고리 | 가중치 필드 |
|---|---|
| 기반 (video_p3s_rate, thruplay_rate, retention_rate, ctr) | impressions |
| 참여 (reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k, engagement_per_10k) | impressions |
| 전환 (click_to_checkout_rate, click_to_purchase_rate, checkout_to_purchase_rate) | clicks |
| ROAS | spend |
| reach_to_purchase_rate | reach |

### 가중 평균 공식
```
Trimmed Weighted Mean = Σ(value_i × weight_i) / Σ(weight_i)
(상하 10% 제거 후)
```

### 데이터 3건 미만이면
trimming 하지 않고 단순 가중 평균 fallback

## 작업 3: creative_type별 벤치마크 계산

### 현재
- `creative_type: "ALL"` 만 계산하여 benchmarks 테이블에 저장

### 수정
- ALL (전체) + VIDEO + IMAGE + CATALOG 각각 계산
- benchmarks 테이블에 creative_type별로 행 생성
- 기존 ALL은 그대로 유지 (하위 호환)

### benchmarks UPSERT
```
onConflict: "creative_type,ranking_type,ranking_group,date,category"
```
→ creative_type이 이미 unique key에 포함되어 있으므로 추가 마이그레이션 불필요

## 작업 순서
1. `getCreativeType()` 수정 + AD_FIELDS 필드 추가
2. `calcGroupAvg()` → `calcTrimmedWeightedAvg()` 변경
3. STEP 2 벤치마크 계산에 creative_type별 루프 추가
4. 빌드 검증 (tsc + lint + build)
5. 커밋 + 푸시

## 검증
- 빌드 통과
- 타입 에러 없음
- 기존 ALL 벤치마크 계산 동작 유지
- creative_type별 벤치마크 행이 생성되는 구조 확인

## 참고
- 현재 데이터: 206건 (VIDEO 83, CATALOG 123, IMAGE 0)
- 수정 후 IMAGE가 새로 생길 것 (현재 CATALOG에 잘못 분류된 이미지 광고)
- 재수집은 수정 배포 후 수동 트리거 예정
