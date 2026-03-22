# TASK: creative_type 분류 — 근본 원인 분석 + 수정

## 문제
데일리 수집에서 에어무드 "승무원 수정화장+현직_22s" 광고가 SHARE로 분류됨.
이 광고는 카탈로그 설정 사용 + 수동업로드 영상 광고인데, VIDEO로 분류돼야 정상.
벤치마크 수집에서는 같은 로직(`getCreativeType()`)으로 동일 유형 광고가 정상 분류(VIDEO)되고 있음.

## 분석 요구사항

### 1. Meta API 호출 방식 비교
- `collect-daily/route.ts`의 Meta API 호출 방식 (URL 구성, 필드 요청 방식, insights 조합)
- `collect-benchmarks/route.ts`의 Meta API 호출 방식
- 두 코드가 creative 필드를 요청하는 방법이 정확히 동일한지 diff 수준으로 비교

### 2. Meta API 응답 차이 원인 분석
- 같은 `creative.fields(object_type,product_set_id,video_id,image_hash)` 요청인데 왜 응답이 다른지
- insights와 함께 요청할 때 creative 필드 반환 방식이 달라지는지
- `date_preset(yesterday)` vs `date_preset(last_7d)` 차이가 영향을 주는지
- nested fields 문법(creative.fields(...))이 insights와 결합될 때 동작 방식

### 3. 에어무드 계정(1440411543944393)으로 실제 Meta API 테스트
- 벤치마크와 동일한 호출 방식으로 해당 광고 조회 시 video_id가 반환되는지 확인
- 데일리 호출 방식으로 같은 광고 조회 시 video_id가 누락되는지 확인
- 차이점 기록

### 4. 근본 해결
- 원인을 정확히 파악한 후, 데일리 수집에서도 video_id가 정상 반환되도록 수정
- SHARE→VIDEO 강제 매핑은 올바른 해결이 아님 — 근본 원인 해결 필수

## 참조
- 에어무드 계정: `1440411543944393`
- 문제 광고: "승무원 수정화장+현직_22s" (ad_id: `120241760840650479`)
- Meta API 토큰: `.env.local`의 `META_ACCESS_TOKEN`
- 데일리: `src/app/api/cron/collect-daily/route.ts`
- 벤치마크: `src/app/api/cron/collect-benchmarks/route.ts`

## 빌드 검증 + 커밋 + 푸시
- 원인 파악 후 수정 → `npm run build` 통과 → 커밋 + 푸시
