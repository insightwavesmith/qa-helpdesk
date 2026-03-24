# collect-daily 효율화 설계서

## 1. 현재 코드 분석 (route.ts 891줄)

### 블록별 라인 범위

| 블록 | 라인 | 줄수 | 역할 | 단계 |
|------|------|-----:|------|------|
| 문서+imports | 1-63 | 63 | JSDoc, import, 상수(AD_FIELDS, INSIGHT_FIELDS) | 공통 |
| 유틸함수 | 65-137 | 73 | safeFloat/Int, getActionValue, normalizeRanking, extractLpUrl | 공통 |
| calculateMetrics | 152-215 | 64 | 30+ KPI 계산 (ROAS, 전환율, 영상 지표 등) | 1단계 |
| checkMetaPermission | 217-239 | 23 | Meta API 접근 사전검증 | 1단계 |
| fetchMetaWithRetry | 241-275 | 35 | 429 재시도 래퍼 (최대 2회, backoff) | 1단계 |
| fetchAccountAds | 277-313 | 37 | Meta Graph API /ads 호출 | 1단계 |
| runCollectDaily 시작 | 328-380 | 53 | 서비스 클라이언트 + 계정 조회 + 배치 분할 | 1단계 |
| 권한 체크 루프 | 385-430 | 46 | permittedAccounts / deniedIds 분류 | 1단계 |
| **계정 루프 시작** | 434-485 | 52 | Meta API fetch + daily_ad_insights UPSERT | **1단계 핵심** |
| 이미지/영상 URL | 487-505 | 19 | fetchImageUrlsByHash + fetchVideoThumbnails | 2단계 |
| LP 정규화 | 507-555 | 49 | normalizeUrl → landing_pages UPSERT → lp_id 매핑 | 1단계 |
| creatives UPSERT | 557-594 | 38 | creatives 테이블 INSERT (is_member, creative_type) | 1단계 |
| creative_media UPSERT | 596-714 | 119 | CAROUSEL 카드 추출 + media 행 생성 | **경계** |
| mp4 다운로드 | 716-772 | 57 | fetchVideoSourceUrls → GCS 업로드 → storage_url UPDATE | **2단계 핵심** |
| 후처리 (배치4만) | 789-845 | 57 | embedMissingCreatives + SHARE→VIDEO fix + precompute + pipeline | 3단계 |
| 크론 완료 | 847-868 | 22 | completeCronRun + 응답 반환 | 공통 |
| HTTP 핸들러 | 871-891 | 21 | GET 파라미터 파싱 + verifyCron | 공통 |

### 현재 흐름 (1계정 기준, 순서 고정)

```
Meta API /ads 호출 (1~3초, 재시도 포함)
 ↓ ads 배열 필요
daily_ad_insights UPSERT (0.5초)
 ↓ ads 배열 필요 (image_hash, video_id 추출)
fetchImageUrlsByHash + fetchVideoThumbnails (1~2초, Meta API 추가 호출)
 ↓ hashToUrl, videoThumbMap 필요
LP 정규화 → landing_pages UPSERT (0.3초)
 ↓ lp_id 매핑 필요
creatives UPSERT (0.3초)
 ↓ creative_id 매핑 필요
creative_media UPSERT (0.5초, CAROUSEL N행)
 ↓ 완료 후
mp4 다운로드 + GCS 업로드 (5~30초/건, VIDEO만)
 ↓ 전 계정 완료 후 (배치4만)
embedMissingCreatives (10~30초)
precompute (5~10초)
creative pipeline 호출 (외부)
```

**1계정 예상 시간**: 수집 3~5초 + 미디어 5~30초 = **8~35초**
**38계정 순차**: 300~1,330초 (5~22분) — Cloud Run 300초 타임아웃 초과 가능

---

## 2. 분리 설계

### 2.1 3단계 아키텍처

```
[1단계] collect-daily (경량)     ← 수집 + DB 저장만
 │  Meta API → daily_ad_insights
 │  LP 정규화 → landing_pages + creatives
 │  creative_media (media_url만, storage_url 없이)
 │
 │  계정당 3~5초 → 38계정 = 2~3분
 │
[2단계] process-media (별도 크론)  ← 미디어 처리
 │  creative_media WHERE storage_url IS NULL
 │  이미지 hash→URL→GCS 업로드
 │  영상 mp4 다운로드→GCS
 │  CAROUSEL 카드별 처리
 │
 │  건당 5~30초 → 신규분만 처리
 │
[3단계] 후처리 (기존 크론 유지)    ← 이미 분리됨
   embed-creatives (임베딩)
   analyze-five-axis (5축)
   creative-saliency (DeepGaze)
   precompute (사전계산)
```

### 2.2 분리 지점 (자르는 위치)

```
┌─────────────── 1단계: collect-daily (경량) ───────────────┐
│ lines 1-63    imports + 상수                              │
│ lines 65-137  유틸함수 (공용 → lib/ 분리)                  │
│ lines 152-215 calculateMetrics (공용)                     │
│ lines 217-313 Meta API 함수 3개 (공용)                    │
│ lines 328-485 runCollectDaily 시작 ~ daily_ad_insights    │
│ lines 507-594 LP 정규화 + creatives UPSERT                │
│ lines 596-714 creative_media UPSERT (media_url만)         │
│                ★ mp4 다운로드 제거 (storage_url 안 채움)    │
│ lines 847-891 크론 완료 + HTTP 핸들러                     │
└───────────────────────────────────────────────────────────┘

┌─────────────── 2단계: process-media (신규) ───────────────┐
│ creative_media에서 storage_url IS NULL 조회               │
│ lines 487-505 fetchImageUrlsByHash + fetchVideoThumbnails │
│               → lib/protractor/creative-image-fetcher.ts  │
│ lines 716-772 mp4 다운로드 + GCS 업로드 로직              │
│ 이미지: hash→URL→fetch→GCS 업로드→storage_url UPDATE      │
│ 영상: fetchVideoSourceUrls→fetch mp4→GCS→storage_url     │
└───────────────────────────────────────────────────────────┘

┌─────────────── 3단계: 후처리 (기존 유지) ────────────────┐
│ lines 789-845 → 이미 별도 크론으로 존재                   │
│ embedMissingCreatives → embed-creatives 크론              │
│ precompute → precompute 크론                              │
│ pipeline → Cloud Run 트리거                               │
│ ★ SHARE→VIDEO fix → 레거시 코드, 별도 1회성 스크립트 분리 │
└───────────────────────────────────────────────────────────┘
```

### 2.3 핵심 결정: creative_media에서 잘라야 하는 이유

**현재 문제**: creative_media UPSERT(596-714) 안에서 `fetchImageUrlsByHash`(487-505)로 media_url을 미리 가져옴. 이 Meta API 호출이 계정당 1~2초 추가.

**해결**: creative_media에 media_url은 raw_creative에서 추출 가능한 것만 채우고, hash→URL 변환과 실제 파일 다운로드는 process-media로 이관.

```
1단계에서 creative_media에 저장하는 것:
- creative_id, position, card_total, media_type ✅
- media_url: raw_creative에서 바로 추출 가능한 것만 (thumbnail_url 등) ✅
- storage_url: NULL (process-media가 채움) ✅
- raw_creative: JSONB 원본 ✅

2단계(process-media)에서 채우는 것:
- media_url: image_hash → Meta API → 실제 URL
- storage_url: URL → fetch → GCS 업로드 → 영구 경로
```

---

## 3. process-media 크론 설계

### 3.1 API 스펙

```
GET /api/cron/process-media
Authorization: Bearer {CRON_SECRET}
Query Parameters:
  ?accountId=123     선택, 단일 계정 처리
  ?limit=100         선택, 처리 건수 제한 (기본 200)
  ?type=IMAGE|VIDEO  선택, 미디어 타입 필터
```

### 3.2 처리 흐름

```
1. creative_media 조회
   WHERE storage_url IS NULL
   AND media_type IN ('IMAGE', 'VIDEO')
   ORDER BY created_at ASC
   LIMIT {limit}

2. 계정별 그룹핑
   GROUP BY account_id (JOIN creatives)

3. 계정별 독립 처리 (for-of, 에러 격리)
   3a. IMAGE 처리:
       - raw_creative에서 image_hash 추출
       - fetchImageUrlsByHash(account_id, hashes[])
       - 각 URL fetch → GCS 업로드
       - creative_media.storage_url UPDATE
       - creative_media.media_url UPDATE (hash→URL 변환 결과)

   3b. VIDEO 처리:
       - raw_creative에서 video_id 추출
       - fetchVideoSourceUrls(videoIds[])
       - mp4 fetch (≤100MB) → GCS 업로드
       - creative_media.storage_url UPDATE
       - fetchVideoThumbnails → thumbnail_url UPDATE

4. 결과 반환
   { processed: N, uploaded: N, errors: N, byType: {IMAGE: N, VIDEO: N} }
```

### 3.3 GCS 경로 (ADR-001 준수)

```
creatives/{account_id}/media/{ad_id}.jpg          ← IMAGE
creatives/{account_id}/media/{ad_id}_card{N}.jpg  ← CAROUSEL 카드
creatives/{account_id}/media/{ad_id}.mp4          ← VIDEO
creatives/{account_id}/media/{ad_id}_thumb.jpg    ← VIDEO 썸네일
```

### 3.4 에러 처리

| 실패 유형 | 처리 |
|----------|------|
| Meta API 429 | fetchMetaWithRetry 재시도 (기존 로직 재사용) |
| Meta CDN 403/404 | 건너뛰기 (media_url은 유지, storage_url=NULL 유지) |
| GCS 업로드 실패 | 건너뛰기 (다음 크론에서 재시도) |
| mp4 > 100MB | 건너뛰기 + 로그 |
| 계정 A 에러 | 다음 계정 B 계속 진행 (계정별 try-catch) |

### 3.5 스케줄

```
collect-daily:   03:00 KST (수집 2~3분)
process-media:   03:10 KST (미디어 5~15분, 신규분만)
embed-creatives: 04:00 KST (임베딩, storage_url 의존 아님)
creative-saliency: 04:30 KST (DeepGaze, media_url 필요)
```

---

## 4. 계정별 독립 실행 (병렬화)

### 4.1 현재 vs 개선

| 항목 | 현재 | 개선 |
|------|------|------|
| 실행 단위 | 배치(10계정) 순차 | 계정별 독립 |
| 장애 격리 | 1계정 실패 → 뒤 계정 중단 | 1계정 실패 → 다른 계정 영향 없음 |
| 미디어 처리 | 수집 루프 안에서 동기 | 별도 크론, 비동기 |
| 후처리 | 배치4에서만 트리거 | 별도 크론 (이미 분리) |

### 4.2 병렬화 방법 (Cloud Run)

**방법 A: 단일 요청, 내부 계정별 에러 격리 (권장)**
```
GET /api/cron/collect-daily
 → 38계정 순차 처리, 각 계정 try-catch로 격리
 → 1계정 실패해도 나머지 계속
 → 수집만이므로 3~5초×38 = 2~3분 (타임아웃 내)
```

**방법 B: 계정별 개별 요청 (Cloud Scheduler 38개)**
```
GET /api/cron/collect-daily?accountId=1234
GET /api/cron/collect-daily?accountId=5678
 → Cloud Run concurrency=10이므로 4파에 나눠 처리
 → Scheduler 38개 관리 부담 큼 → 비추천
```

**방법 C: 팬아웃 (1요청 → N개 비동기)**
```
GET /api/cron/collect-daily
 → 내부에서 계정별 Cloud Tasks 큐잉
 → 복잡도 높음 → 현재 규모(38계정)에서 오버엔지니어링
```

**결론**: 방법 A 권장. 미디어 제거 후 계정당 3~5초면 38계정 2~3분 내 완료. 에러 격리만 추가하면 충분.

### 4.3 process-media 병렬화

```
process-media도 방법 A와 동일:
 → 단일 요청, 내부에서 계정별 try-catch
 → storage_url IS NULL인 건만 조회 (보통 10~50건)
 → 건당 5~30초, limit 200 → 최대 10분
 → Cloud Run 타임아웃 3600초 내 여유
```

---

## 5. backfill 영향

### 현재 backfill 구조
```
scripts/run-backfill-all.mjs
 → POST /api/admin/protractor/collect (mode=backfill, days=90)
 → 내부에서 runCollectDaily(date, null, accountId) 호출
 → 90일 × 38계정 = 3,420회 호출
```

### 분리 후 backfill 효과

| 항목 | 현재 | 분리 후 |
|------|------|---------|
| 1회 호출 시간 | 8~35초 (미디어 포함) | 3~5초 (수집만) |
| 총 시간 (3,420회) | 7.6~33시간 | 2.8~4.7시간 |
| GCS 비용 | 매 호출 업로드 | 별도 배치 1회 |
| Meta API 호출 | 수집 + hash→URL | 수집만 |

**효과**: backfill 시간 60~85% 단축. GCS 업로드는 process-media에서 일괄 처리.

---

## 6. 예상 성능 비교

### collect-daily (38계정 기준)

| 지표 | 현재 | 분리 후 |
|------|------|---------|
| 총 실행 시간 | 5~22분 | 2~3분 |
| Meta API 호출 | 38(수집) + 38(hash) + 38(video) = 114 | 38(수집만) |
| DB 쿼리 | 38×7 = 266 | 38×5 = 190 |
| GCS 업로드 | 0~50건 (동기) | 0 (process-media로 이관) |
| Cloud Run 타임아웃 위험 | 높음 (300초 초과 가능) | 낮음 (180초 이내) |

### process-media (신규)

| 지표 | 값 |
|------|-----|
| 실행 주기 | 매일 03:10 KST (collect-daily 10분 후) |
| 처리 건수 | 일평균 10~50건 (신규 수집분) |
| 예상 시간 | 1~5분 |
| Meta API | hash→URL + videoSource (신규분만) |
| GCS 업로드 | 10~50건 |

---

## 7. 영향도 분석 (변경 시 깨질 수 있는 곳)

### 7.1 직접 영향

| 파일 | 변경 내용 | 위험도 |
|------|----------|--------|
| `src/app/api/cron/collect-daily/route.ts` | mp4 다운로드 제거, fetchImage 제거 | ⚠ 높음 |
| `src/app/api/cron/collect-daily-{1~4}/route.ts` | runCollectDaily 시그니처 변경 없음 | 🟢 낮음 |
| `src/app/api/admin/protractor/collect/route.ts` | runCollectDaily 재사용 → 자동 경량화 | 🟢 낮음 |
| `scripts/run-backfill-all.mjs` | runCollectDaily 재사용 → 자동 경량화 | 🟢 낮음 |

### 7.2 간접 영향

| 하류 크론 | 영향 | 대응 |
|----------|------|------|
| embed-creatives | storage_url 없어도 media_url로 임베딩 가능 | 🟢 영향 없음 |
| creative-saliency | media_url 필요 (storage_url 아님) | 🟢 영향 없음 |
| precompute | daily_ad_insights만 사용 | 🟢 영향 없음 |
| analyze-five-axis | analysis_json, storage_url에서 이미지 로드 | ⚠ storage_url NULL일 수 있음 |

### 7.3 analyze-five-axis 대응

```
현재: storage_url → GCS에서 이미지 로드 → Gemini 분석
분리 후: storage_url NULL인 건 → media_url(Meta CDN)에서 직접 로드

대응 방법:
1. analyze-five-axis에 fallback 추가: storage_url || media_url
2. process-media 스케줄을 analyze-five-axis 이전에 배치 (이미 그렇게 설계)
3. storage_url NULL이면 건너뛰기 옵션 추가 (--require-storage 플래그)
```

### 7.4 SHARE→VIDEO fix 처리

```
현재: collect-daily 후처리에서 매번 실행 (lines 803-816)
→ 레거시 호환 코드. 이미 대부분 수정 완료.
→ 1회성 스크립트로 분리하거나, collect-daily에서 제거.
→ 남은 SHARE 건수 확인 후 판단.
```

---

## 8. 파일 구조 (구현 시)

### 변경 파일

```
src/app/api/cron/
├── collect-daily/route.ts        ← 730줄 → ~450줄 (미디어 제거)
├── process-media/route.ts        ← 신규 (~250줄)
└── collect-daily-{1~4}/route.ts  ← 변경 없음

src/lib/protractor/
├── creative-image-fetcher.ts     ← 변경 없음 (process-media에서 import)
├── creative-type.ts              ← 변경 없음
└── carousel-cards.ts             ← 변경 없음

src/lib/
├── collect-daily-utils.ts        ← 신규, 공용 유틸 분리 (safeFloat, calculateMetrics 등)
└── gcs-storage.ts                ← 변경 없음
```

### 공용 모듈 분리 대상 (collect-daily-utils.ts)

| 함수 | 현재 위치 | 사용처 |
|------|----------|--------|
| safeFloat, safeInt, round | route.ts 65-79 | collect-daily, process-media |
| getActionValue, getVideoActionValue | route.ts 81-92 | collect-daily |
| normalizeRanking | route.ts 94-102 | collect-daily |
| extractLpUrl | route.ts 104-137 | collect-daily |
| calculateMetrics | route.ts 152-215 | collect-daily |
| fetchMetaWithRetry | route.ts 241-275 | collect-daily, process-media |
| fetchAccountAds | route.ts 277-313 | collect-daily |

---

## 9. 크론 스케줄 재설계

### 현재 (Cloud Scheduler)
```
03:00 KST  collect-daily (수집+미디어+후처리, 5~22분)
04:00 KST  embed-creatives
04:30 KST  creative-saliency
05:00 KST  analyze-five-axis (Cloud Run Job)
```

### 분리 후
```
03:00 KST  collect-daily (수집만, 2~3분)
03:10 KST  process-media (미디어, 1~5분)
04:00 KST  embed-creatives (변경 없음)
04:30 KST  creative-saliency (변경 없음)
05:00 KST  analyze-five-axis (변경 없음)
```

### 후처리 트리거 변경
```
현재: collect-daily 배치4 → embedMissingCreatives + precompute 직접 호출
분리 후: collect-daily에서 후처리 제거 → 기존 별도 크론이 담당
→ embedMissingCreatives: embed-creatives 크론 (이미 존재)
→ precompute: precompute 크론 (이미 존재)
→ pipeline: Cloud Scheduler에서 직접 트리거 (이미 설정)
```

---

## 10. 구현 순서 (다음 TASK용)

```
Phase 1: 공용 모듈 분리 (위험 낮음)
 □ collect-daily-utils.ts 생성
 □ safeFloat/calculateMetrics/extractLpUrl 등 이동
 □ collect-daily/route.ts에서 import 교체
 □ tsc + build 통과 확인

Phase 2: process-media 크론 신규 생성 (위험 낮음)
 □ process-media/route.ts 작성
 □ creative_media WHERE storage_url IS NULL 조회
 □ 이미지 hash→URL→GCS + 영상 mp4→GCS
 □ Cloud Scheduler 등록 (03:10 KST)
 □ 단독 테스트

Phase 3: collect-daily 경량화 (위험 높음 → 주의)
 □ fetchImageUrlsByHash 호출 제거 (487-505)
 □ mp4 다운로드 블록 제거 (716-772)
 □ 후처리 블록 제거 (789-845, 기존 크론으로 위임)
 □ SHARE→VIDEO fix 제거 (잔여 건수 확인 후)
 □ 에러 격리 추가 (계정별 try-catch)
 □ E2E 테스트: 단일 계정 → 전체 계정

Phase 4: 검증
 □ collect-daily 실행 → 2~3분 내 완료 확인
 □ process-media 실행 → storage_url 채워지는지 확인
 □ embed-creatives → 임베딩 정상 확인
 □ analyze-five-axis → storage_url fallback 동작 확인
 □ backfill 1계정 1일 테스트
```
