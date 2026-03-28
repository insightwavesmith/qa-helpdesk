# 수집 구조 리팩토링 Plan

## 목적
소재 수집의 분류 체계를 is_member/is_benchmark 플래그로 전환하고,
creative_media에도 raw JSONB를 저장하여 데이터 완결성 확보.

## 이전 세션 완료 항목 (참조용)
- raw_insight + raw_ad on daily_ad_insights + 자동 추출 트리거
- raw_creative on creatives
- collect-daily raw 저장
- collect-benchmark dedup (creative_media + LP 기존 제외)

## 이번 TASK 범위 (delta)
1. creatives 테이블에 `is_member`, `is_benchmark` BOOLEAN 플래그 추가
2. creative_media 테이블에 `raw_creative` JSONB 컬럼 추가
3. collect-daily: member 소재 insert 시 `is_member=true` 설정
4. collect-benchmark-creatives: benchmark 소재 insert 시 `is_benchmark=true` 설정
5. 기존 데이터 태깅 (source='member' → is_member=true, source='benchmark' → is_benchmark=true)
6. database.ts 타입 업데이트
7. 빌드 검증

## 성공 기준
- is_member/is_benchmark 플래그가 정확히 설정됨
- 기존 source 컬럼과 호환 (삭제 안 함)
- creative_media.raw_creative에 Meta creative 원본 저장됨
- tsc + build 통과

## 제약
- 기존 컬럼 삭제 금지 (하위 호환)
- source 컬럼은 유지 (is_member/is_benchmark는 추가 분류)
