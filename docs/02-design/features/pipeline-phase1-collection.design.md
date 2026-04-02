# pipeline-phase1-collection Design — 처방시스템 파이프라인 Phase 1 수집 정상화

> 작성일: 2026-04-02
> 레벨: L2 OPS
> TASK: TASK-PIPELINE-PHASE1-COLLECTION.md
> 마스터플랜: prescription-system-v2 (Layer 1~2)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | pipeline-phase1-collection (처방시스템 파이프라인 Phase 1 수집 정상화) |
| 시작일 | 2026-04-02 |
| 레벨 | L2 OPS |
| 핵심 목표 | META_ACCESS_TOKEN 교체 + 크론 에러 해소(code:13, code:7) + 분석 커버리지 100% |

### Value Delivered 4관점

| 관점 | 내용 |
|------|------|
| Problem | 토큰 권한 부족으로 광고 콘텐츠(이미지/영상) 수집 실패. 크론 6건 에러. 분석 커버리지 95~97% |
| Solution | 신규 토큰(ads_read+콘텐츠 조회) 교체 + IAM 권한 부여 + 실패건 재처리 |
| Function UX Effect | Layer 1~2 전체 정상 → 처방시스템 v2 Phase 2~3 진행 가능 |
| Core Value | 파이프라인 수집→분석 100% = 처방 엔진 입력 데이터 완전성 확보 |

---

## 1. 변경 범위 분석

### 1-1. META_ACCESS_TOKEN 사용 지점 (영향 범위)

코드에서 `process.env.META_ACCESS_TOKEN`을 참조하는 **모든 파일**:

| # | 파일 | 용도 | 영향 |
|---|------|------|------|
| 1 | `src/app/api/cron/collect-daily/route.ts:396` | Meta API 일일 수집 | ✅ 직접 수혜 |
| 2 | `src/app/api/cron/embed-creatives/route.ts:57` | ACTIVE 광고 + 소재 수집 | ✅ 직접 수혜 |
| 3 | `src/app/api/cron/collect-benchmarks/route.ts:314` | 벤치마크 수집 | ✅ 직접 수혜 |
| 4 | `src/app/api/cron/discover-accounts/route.ts:158` | 계정 디스커버리 | ✅ 직접 수혜 |
| 5 | `src/lib/protractor/creative-image-fetcher.ts:61,123,231,297` | image_hash→URL, 크리에이티브 상세 | ✅ 직접 수혜 |
| 6 | `src/lib/protractor/meta-collector.ts:215` | Meta API 광고 조회 | ✅ 직접 수혜 |
| 7 | `src/lib/protractor/overlap-utils.ts:24` | 타겟 오버랩 조회 | ✅ 직접 수혜 |
| 8 | `src/lib/collect-daily-utils.ts:289` | 수집 유틸리티 | ✅ 직접 수혜 |
| 9 | `src/lib/classify-account.ts:254` | 계정 분류 | ✅ 직접 수혜 |
| 10 | `src/app/api/facebook/page-info/route.ts:23` | 페이지 정보 | ✅ 직접 수혜 |
| 11 | `scripts/download-missing-media.mjs:30` | 누락 미디어 보충 | 간접 |
| 12 | `scripts/download-videos.mjs:37` | 영상 다운로드 | 간접 |
| 13 | `scripts/local-collect.mjs:22` | 로컬 수집 | 간접 |
| 14 | `scripts/collect-benchmark-creatives.mjs:27` | 벤치마크 소재 | 간접 |

**토큰 교체 방법**: Cloud Run 환경변수만 교체. 코드 변경 없음.

```bash
gcloud run services update bscamp-cron \
  --region asia-northeast3 \
  --project modified-shape-477110-h8 \
  --set-env-vars "META_ACCESS_TOKEN=<NEW_TOKEN>"
```

### 1-2. 크론 에러 분석

#### A. embed-creatives Scheduler code:13 (INTERNAL)

- **Scheduler ID**: `bscamp-embed-creatives`
- **스케줄**: 매일 20:00 KST (독립 백업 스케줄)
- **체인에서도 실행됨**: process-media → embed-creatives (체인 트리거)

**원인 추정 (3가지)**:
1. **Gemini API 키 문제**: `src/lib/gemini.ts`에서 `GEMINI_API_KEY` 환경변수 필수. 미설정 시 경고만 출력되고, 실제 호출 시 에러. 이 에러가 500 응답 → Scheduler에서 code:13으로 기록
2. **타임아웃**: embed-creatives가 39계정 × N광고 순회 + 각각 Gemini 임베딩 호출 → Cloud Run 타임아웃 초과 가능
3. **Meta API Rate Limit**: 토큰 권한 부족으로 Meta API 호출 실패 → 에러 누적 → 500

**확인 방법**: Cloud Run 로그 확인 (`gcloud logging read`)

#### B. Cloud Run Jobs 5개 Scheduler code:7 (PERMISSION_DENIED)

| Job 이름 | Scheduler ID | 스케줄 |
|----------|-------------|--------|
| bscamp-score-percentiles | bscamp-job-score-percentiles | 매일 02:00 |
| bscamp-fatigue-risk | bscamp-job-fatigue-risk | 매일 02:30 |
| bscamp-andromeda-similarity | bscamp-job-andromeda | 매일 03:00 |
| bscamp-lp-alignment | bscamp-job-lp-alignment | 매일 03:30 |
| bscamp-analyze-lps | bscamp-job-analyze-lps | 매일 04:00 |

**원인**: Cloud Scheduler가 Cloud Run Jobs를 호출할 때 사용하는 서비스 계정에 `roles/run.invoker` 권한이 없음.

**수정 방법**:
```bash
# Scheduler 서비스 계정에 Cloud Run Invoker 역할 부여
gcloud projects add-iam-policy-binding modified-shape-477110-h8 \
  --member="serviceAccount:modified-shape-477110-h8@appspot.gserviceaccount.com" \
  --role="roles/run.invoker"
```

또는 개별 Job에 대해:
```bash
gcloud run jobs add-iam-policy-binding <JOB_NAME> \
  --region=asia-northeast3 \
  --member="serviceAccount:modified-shape-477110-h8@appspot.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project=modified-shape-477110-h8
```

### 1-3. 분석 커버리지 갭 원인

| 파이프라인 | 현재 | 목표 | 갭 원인 추정 |
|-----------|------|------|-------------|
| process-media (GCS 저장) | 95% | 100% | 신규 추가 소재 미처리 또는 Meta API에서 미디어 URL 없는 소재 (삭제됨/권한 부족) |
| embed-creatives (임베딩) | 97% | 100% | Gemini 임베딩 실패건 (이미지 fetch 실패, 타임아웃) |
| creative-saliency (DeepGaze 이미지) | 97% | 100% | DeepGaze 서비스 타임아웃 또는 이미지 없는 소재 |
| video-saliency (DeepGaze 영상) | 97% | 100% | 영상 프레임 추출 실패 또는 영상 URL 만료 |

**해소 전략**:
1. 토큰 교체 후 collect-daily 재실행 → 미수집 콘텐츠 URL 갱신
2. process-media 수동 실행 → 미다운로드 미디어 보충
3. 분석 크론 3개 수동 실행 → 누락건 재처리
4. 여전히 실패하는 건 = 소재 자체가 삭제/비활성 → 제외 처리

---

## 2. 수정 계획

### Phase A: 인프라 (코드 변경 없음)

| # | 작업 | 방법 | 검증 |
|---|------|------|------|
| A1 | META_ACCESS_TOKEN 교체 | `gcloud run services update` | curl로 토큰 유효성 확인 |
| A2 | Cloud Run Jobs IAM 수정 | `gcloud projects add-iam-policy-binding` | Scheduler 수동 실행 → code:7 해소 확인 |
| A3 | embed-creatives 에러 조사 | `gcloud logging read` | 실제 에러 원인 확인 후 대응 |

### Phase B: 수집 검증 (코드 변경 없음)

| # | 작업 | 방법 | 검증 |
|---|------|------|------|
| B1 | collect-daily 수동 실행 | curl 호출 | 39계정 수집 성공 + 콘텐츠 URL 갱신 |
| B2 | process-media 수동 실행 | curl 호출 | GCS에 미디어 저장 확인 |
| B3 | embed-creatives 수동 실행 | curl 호출 | 임베딩 생성 확인 |
| B4 | creative-saliency 수동 실행 | curl 호출 | DeepGaze 히트맵 생성 확인 |
| B5 | video-saliency 수동 실행 | curl 호출 | 영상 시선 분석 확인 |

### Phase C: 커버리지 갭 해소 (코드 변경 가능)

소재가 실제로 Meta에서 삭제/비활성되어 URL이 없는 경우:
- creative_media에서 해당 row의 status를 'expired' 또는 'unavailable'로 마킹
- 커버리지 계산 시 이 건들을 분모에서 제외

---

## 3. 체인 구조 확인

```
Cloud Scheduler (18:00 KST)
  │
  ▼
collect-daily?chain=true       ← META_ACCESS_TOKEN 사용
  │ (results.length > 0)
  ▼
process-media?chain=true       ← GCS 다운로드/저장
  │ (uploaded/processed/dedup > 0)
  ├──► embed-creatives         ← META_ACCESS_TOKEN + GEMINI_API_KEY
  ├──► creative-saliency       ← DeepGaze 서비스 호출
  └──► video-saliency          ← DeepGaze 영상 프레임

triggerNext() — src/lib/pipeline-chain.ts
  - fire-and-forget (2초 AbortSignal)
  - CRON_SECRET Bearer 인증
  - CLOUD_RUN_URL: bscamp-cron-906295665279.asia-northeast3.run.app
```

---

## 4. TDD 케이스

이 TASK는 L2 OPS (인프라+검증)이므로 코드 TDD보다 **운영 검증 체크리스트**가 적절.

| ID | 검증 항목 | 방법 | 기대 결과 |
|----|----------|------|----------|
| PH1-01 | META_ACCESS_TOKEN 유효성 | `curl "https://graph.facebook.com/v21.0/me?access_token=<TOKEN>"` | 200 + user 정보 반환 |
| PH1-02 | collect-daily 수동 실행 | curl 엔드포인트 호출 | 39계정 데이터 수집 성공, errors=0 |
| PH1-03 | creative-image-fetcher 이미지 URL 수집 | collect-daily 로그 확인 | adimages API + ad creative 엔드포인트 정상 응답 |
| PH1-04 | process-media 미디어 다운로드 | curl 호출 후 GCS 확인 | uploaded > 0, 95→100% |
| PH1-05 | embed-creatives 임베딩 생성 | curl 호출 | newCreatives > 0, errors=[] |
| PH1-06 | embed-creatives Scheduler 독립 실행 | Cloud Scheduler 수동 트리거 | code:13 → 정상(code:0) |
| PH1-07 | Cloud Run Jobs 5개 실행 | 각 Scheduler 수동 트리거 | code:7 → 정상(code:0) |
| PH1-08 | creative-saliency 커버리지 | DB 쿼리 (saliency_url IS NOT NULL 비율) | 97→100% |
| PH1-09 | video-saliency 커버리지 | DB 쿼리 (video_analysis IS NOT NULL 비율) | 97→100% |
| PH1-10 | 전체 체인 정상 동작 | collect-daily?chain=true → 로그 추적 | 모든 단계 정상 트리거 확인 |

---

## 5. 위험 요소

| 위험 | 영향 | 대응 |
|------|------|------|
| 새 토큰에 ads_read 권한 누락 | 수집 전체 실패 | 토큰 교체 전 `curl me?access_token` + `me/adaccounts`로 검증 |
| Gemini API 할당량 초과 | 임베딩 일부 실패 | 배치 50개씩 + 500ms 딜레이 (기존 코드에 이미 적용) |
| DeepGaze 서비스 다운 | saliency 실패 | Mac Studio 로컬 서비스 상태 확인 필요 |
| 삭제된 소재 URL 404 | 커버리지 100% 불가 | expired 마킹으로 분모에서 제외 |

---

## 6. 코드 변경 여부

**이 TASK는 코드 변경 최소화**. 핵심은 인프라 작업(환경변수 교체, IAM 수정).

코드 변경이 필요한 유일한 경우:
- 커버리지 갭 해소 시 expired 소재 마킹 로직 추가 (Phase C, 필요 시)
- 그 외 모든 작업은 `gcloud` CLI + curl 수동 실행
