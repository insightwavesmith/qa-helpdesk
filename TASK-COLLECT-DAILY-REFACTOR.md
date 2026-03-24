# TASK: collect-daily 효율화 — 병목 해결 방안 분석

> CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라
> **코드 수정 하지 마. 분석 + 설계만.**

## 배경
collect-daily가 730줄 단일 함수로 모든 것을 처리 중.
수집 구조 리팩토링(raw JSONB, CAROUSEL, is_member)이 완료된 상태에서
이 함수를 효율적으로 분리해야 한다.

## 현재 문제 (병목)

### 1. 순차 처리
- 계정 38개를 순차 처리 (1개 끝나야 다음)
- 1개 계정 실패 → 뒤에 계정 전부 중단

### 2. 수집+저장+후처리 혼합
- Meta API 호출 → DB 저장 → GCS 업로드 → 영상 다운로드 → LP 정규화 → 사전계산
- 전부 한 함수 안에서 동기 실행
- GCS 업로드 느리면 수집 자체가 늦어짐

### 3. 의존 관계
```
collect-daily (수집+DB+미디어) 
 ↓ 전부 끝나야
embed-creatives (임베딩)
 ↓
analyze-five-axis (5축)
creative-saliency (DeepGaze)
 ↓
precompute (사전계산)
```

## 확정된 방향 (Smith님)

### 분리 기준
```
[1단계] collect-daily → 수집+DB저장만 (경량화)
 - Meta API 호출 → raw_insight, raw_ad, raw_creative DB INSERT
 - 트리거가 자동으로 메트릭 추출 (fn_extract_daily_metrics)
 - LP URL 정규화 + landing_pages UPSERT
 - creatives UPSERT (is_member, creative_type)

[2단계] process-media → 미디어 처리 (별도 크론)
 - creative_media에서 storage_url NULL인 것 조회
 - 이미지 hash→URL 변환 + GCS 업로드
 - 영상 다운로드 + GCS
 - CAROUSEL 카드별 분리

[3단계] 후처리 → 이미 별도 크론
 - embed-creatives
 - analyze-five-axis
 - creative-saliency
 - precompute
```

### 계정별 독립 실행
- 계정A 수집 → 계정A 미디어 (A 끝나면 바로)
- 계정B 수집 → 계정B 미디어
- 서로 독립, 한 계정 실패해도 다른 계정 영향 없음

## 에이전트팀이 해야 할 것

### 1. 현재 collect-daily/route.ts (730줄) 전수 분석
- 수집(API 호출+DB INSERT)에 해당하는 코드 라인
- 미디어 처리에 해당하는 코드 라인
- 후처리(precompute)에 해당하는 코드 라인
- 각 블록의 의존 관계 (뭐가 끝나야 뭐가 가능한지)

### 2. 병목 해결 방안 설계
- 분리 방법: 어디서 자르는 게 가장 깔끔한지
- 계정별 병렬화 방법: Cloud Run에서 어떻게 (계정별 요청? 큐?)
- 실패 복구: 한 계정 실패 시 재시도 로직
- 크론 스케줄: 1단계 끝나고 2단계 자동 트리거 방법

### 3. process-media 신규 크론 설계
- 입력: creative_media WHERE storage_url IS NULL
- 출력: GCS 업로드 + storage_url UPDATE
- CAROUSEL 카드별 처리 포함
- 영상 다운로드 (MP4, ≤100MB)

### 4. backfill과의 관계
- backfill도 같은 함수(runCollectDaily) 사용
- 분리하면 backfill도 자동으로 경량화됨
- 90일 × 38계정 = 3,420회 호출 → 경량화 효과 큼

## 산출물
1. **현재 코드 분석** — 블록별 라인 범위 + 의존 관계 다이어그램
2. **분리 설계서** — 어디서 자르고, 새 파일/함수 구조
3. **process-media 크론 설계** — API 스펙 + 스케줄
4. **병렬화 방안** — 계정별 독립 실행 구조
5. **영향도** — 변경 시 깨질 수 있는 곳
6. **예상 성능** — 현재 vs 분리 후 실행 시간 비교

코드 수정은 하지 마라. 분석+설계만. 수정은 Smith님 확인 후 다음 TASK.
