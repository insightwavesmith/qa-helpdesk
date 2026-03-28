# Wave 1: DB 스키마 변경 Plan

## 목적
CAROUSEL 지원을 위한 creative_media 1:N 전환 + 기존 데이터 교정.
모든 후속 코드 변경(Wave 2-4)의 전제조건.

## 범위
1. Migration SQL — position/card_total/lp_id 추가, UNIQUE 변경, CAROUSEL 재분류
2. onConflict 변경 — creative_media upsert 3곳 (collect-daily, collect-benchmark, analyze-competitors)
3. 빌드 검증

## 성공 기준
- creative_media UNIQUE(creative_id, position) 제약 적용
- 기존 데이터 position=0, CAROUSEL 재분류 완료
- onConflict 변경된 3곳 모두 빌드 통과
- tsc + build 0 에러
