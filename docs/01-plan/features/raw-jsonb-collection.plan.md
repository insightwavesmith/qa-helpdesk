# raw JSONB 수집 구조 전환 Plan

## 목적
Meta API 응답을 통째로 JSONB에 저장하여 데이터 손실 방지 + 스키마 유연성 확보.
자주 쓰는 필드는 generated column으로 기존 코드 호환 유지.

## 범위
1. `daily_ad_insights` — raw_response JSONB 추가 + 메트릭 컬럼 generated 전환
2. `creatives` — raw_creative JSONB 추가
3. `collect-daily` route — raw 저장 방식 전환
4. `collect-benchmark-creatives.mjs` — 동일 패턴 + 기존 ad_id 제외

## 성공 기준
- Meta API 응답 전체가 raw_response에 저장됨
- 기존 ctr, roas 등 컬럼이 generated column으로 동일 값 반환
- collect-daily 코드가 간소화됨 (수동 매핑 제거)
- 기존 데이터 보존 (backfill)
- tsc + build 통과

## 제약
- PostgreSQL generated column은 IMMUTABLE 함수만 사용 가능
- 기존 데이터 backfill 필요 (raw_response 역생성)
- onConflict upsert 시 generated column 제외 필요
