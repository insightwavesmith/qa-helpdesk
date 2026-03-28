# collect-daily 효율화 — 병목 해결 방안

## 개요
collect-daily (891줄)를 수집+DB저장 / 미디어처리 / 후처리 3단계로 분리.
계정별 독립 실행으로 장애 격리 + 병렬화.

## 배경
- collect-daily 단일 함수(runCollectDaily, 891줄)가 수집+미디어+후처리 전부 담당
- 계정 38개 순차 처리 → 1개 실패 시 뒤 계정 전부 중단
- GCS 업로드 느리면 수집 자체가 지연
- Cloud Run 타임아웃 300초 안에 38계정 + 미디어 + 후처리 모두 해야 함

## 범위

### IN 범위
1. collect-daily/route.ts 블록별 분석 + 분리 설계
2. process-media 신규 크론 설계
3. 계정별 병렬화 방안
4. 크론 스케줄 재설계
5. backfill 경량화 영향도 분석

### OUT 범위
- 코드 구현 (다음 TASK)
- DB 스키마 변경
- Cloud Run 인프라 변경

## 성공 기준
1. 블록별 라인 범위 + 의존 관계 다이어그램 완성
2. 분리 설계서 완성 (어디서 자르고, 새 파일/함수 구조)
3. process-media 크론 API 스펙 + 스케줄 확정
4. 현재 vs 분리 후 예상 성능 비교
5. 영향도 분석 (깨질 수 있는 곳)

## 산출물
| # | 산출물 | 위치 |
|---|--------|------|
| 1 | 분리 설계서 | `docs/02-design/features/collect-daily-refactor.design.md` |
| 2 | 현재 코드 분석 | 설계서 §1에 포함 |
| 3 | 영향도 분석 | 설계서 §7에 포함 |

## 의존성
- 선행: Wave 1-3 CAROUSEL 스키마 완료 ✅
- 선행: raw JSONB 수집 구조 완료 ✅
- 선행: GCP Cloud Run 이관 완료 ✅
- 후행: 코드 구현 (별도 TASK)

## 타입
분석/설계 — **src/ 코드 수정 금지**
