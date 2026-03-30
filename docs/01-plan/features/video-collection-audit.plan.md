# Video Collection Audit (영상 수집 누락 점검) Plan

> 작성일: 2026-03-29
> 프로세스 레벨: L1 (분석/점검) → 수정 필요 시 L2 전환
> Match Rate 기준: -

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 영상 소재 수집 누락 점검 + 원인 분석 |
| **작성일** | 2026-03-29 |
| **범위** | creative_media 데이터 점검 + collect-daily 수집 로직 검증 + Meta API 기준 대조 |
| **예상 산출물** | 분석 보고서 + (필요 시) 수집 로직 수정 |

| 관점 | 내용 |
|------|------|
| **Problem** | 38개 활성 계정에서 영상 157개만 수집됨 — 계정당 평균 4.1개, 비정상적으로 적음 |
| **Solution** | DB 현황 조회 + collect-daily 로직 검증 + Meta API 실데이터 대조 |
| **Core Value** | 총가치각도기 영상 분석 커버리지 확보 |

---

## 1. 문제 정의

38개 활성 광고 계정에서 영상 소재가 157개만 수집됨. 일반적인 Meta 광고 계정은 영상 소재 비율이 30~60% 수준이므로, 계정당 수십 개의 광고가 있다면 영상이 수백~수천 건이어야 정상.

### 점검 관점
1. **수집 자체가 안 되는 건지** — collect-daily가 video_id 있는 광고를 creative_media에 넣고 있는지
2. **수집은 됐지만 카운트가 맞는 건지** — creative_media 테이블의 실제 VIDEO 레코드 수
3. **Meta API에서 video_id가 몇 개 반환되는지** — API 기준 실제 영상 광고 수
4. **권한 없는 3개 계정 외에 누락이 있는지** — 계정별 수집 분포

---

## 2. 점검 항목

### 점검 A: creative_media 테이블 현황 (DB 직접 조회)

```sql
-- A-1: 전체 VIDEO 레코드 수
SELECT count(*) FROM creative_media WHERE media_type = 'VIDEO';

-- A-2: 계정별 VIDEO 분포
SELECT c.account_id, count(cm.id) as video_count
FROM creative_media cm
JOIN creatives c ON cm.creative_id = c.id
WHERE cm.media_type = 'VIDEO'
GROUP BY c.account_id
ORDER BY video_count DESC;

-- A-3: storage_url 유무별 VIDEO 분포
SELECT
  CASE WHEN storage_url IS NOT NULL THEN 'downloaded' ELSE 'pending' END as status,
  count(*)
FROM creative_media
WHERE media_type = 'VIDEO'
GROUP BY 1;

-- A-4: video_analysis 유무별 분포
SELECT
  CASE WHEN video_analysis IS NOT NULL THEN 'analyzed' ELSE 'pending' END as status,
  count(*)
FROM creative_media
WHERE media_type = 'VIDEO'
GROUP BY 1;

-- A-5: content_hash(video_id) NULL인 VIDEO 레코드
SELECT count(*) FROM creative_media
WHERE media_type = 'VIDEO' AND content_hash IS NULL;

-- A-6: 활성 계정 수
SELECT count(*) FROM ad_accounts WHERE is_active = true;

-- A-7: 활성 계정별 전체 소재 수 (IMAGE+VIDEO)
SELECT c.account_id, cm.media_type, count(*)
FROM creative_media cm
JOIN creatives c ON cm.creative_id = c.id
GROUP BY c.account_id, cm.media_type
ORDER BY c.account_id;
```

### 점검 B: collect-daily 수집 로직 검증

**파일:** `src/app/api/cron/collect-daily/route.ts`

1. Meta API `fetchAccountAds` → `creative.fields(video_id, ...)` 포함 확인 ✓ (meta-collector.ts 라인 19)
2. `getCreativeType()` — VIDEO 판별 조건 확인
3. `creative?.video_id` 파싱 — null/undefined 처리
4. CAROUSEL 카드 내 video_id 추출 — `extractCarouselCards()` → `card.videoId`

**확인할 코드:**
- `src/lib/protractor/creative-type.ts` — VIDEO 판별 로직
- `src/lib/protractor/carousel-cards.ts` — CAROUSEL 내 video 추출
- `src/lib/protractor/meta-collector.ts` — API 필드 정의 (라인 8-20)

### 점검 C: Meta API 기준 실데이터 대조

**방법:** 대표 계정 2~3개 선택 → Meta Graph API 직접 호출 → video_id 있는 광고 수 카운트

```
GET /{account_id}/ads?fields=creative{video_id,image_hash,object_type}&effective_status=["ACTIVE"]
```

**대조 기준:**
- Meta API 반환 video_id 수 vs creative_media VIDEO 레코드 수
- 차이가 있으면 → collect-daily 파싱 누락 확인

### 점검 D: 권한 없는 계정 + 수집 누락 계정

**파일:** `src/lib/protractor/creative-image-fetcher.ts` (커밋 82c1624)
- 권한 에러 3개 계정 이미 식별됨 (Meta API #10, #283)
- 이 3개 외에도 수집 자체가 0건인 계정이 있는지 확인

```sql
-- D-1: 활성 계정 중 creative_media 레코드가 0건인 계정
SELECT aa.account_id, aa.account_name
FROM ad_accounts aa
LEFT JOIN creatives c ON aa.account_id = c.account_id
LEFT JOIN creative_media cm ON c.id = cm.creative_id
WHERE aa.is_active = true
GROUP BY aa.account_id, aa.account_name
HAVING count(cm.id) = 0;

-- D-2: collect-daily cron_runs 최근 실행 로그
SELECT * FROM cron_runs
WHERE cron_name = 'collect-daily'
ORDER BY started_at DESC
LIMIT 10;
```

---

## 3. 예상 원인 가설

| 순위 | 가설 | 검증 방법 | 수정 방향 |
|:----:|------|----------|----------|
| 1 | collect-daily가 VIDEO 타입을 제대로 판별 못 함 | 점검 B: getCreativeType() | creative-type.ts 수정 |
| 2 | CAROUSEL 내 video_id 추출 누락 | 점검 B: extractCarouselCards() | carousel-cards.ts 수정 |
| 3 | Meta API 호출 시 creative 필드 미포함 | 점검 B: AD_FIELDS 확인 | ✓ 이미 포함 |
| 4 | 실제로 영상 광고가 적음 (정상) | 점검 C: Meta API 직접 대조 | 수정 불필요 |
| 5 | 과거 데이터 미수집 (90일 필터) | 점검 A: created_at 분포 | backfill 필요 |
| 6 | 권한 없는 계정 3개 외 추가 누락 | 점검 D | 계정 권한 확인 |

---

## 4. 산출물

### L1 (분석만)
- 분석 보고서: `docs/03-analysis/video-collection-audit.analysis.md`
  - 점검 A~D 결과 + 원인 판정 + 수정 권고

### L2 전환 시 (수정 필요)
- 수정 코드 + TDD
- 수정 후 video 수집 수 재확인

---

## 5. 의존성

- TASK 1 (video-pipeline-dedup-fix)과 **독립적으로 진행 가능**
- 다만 점검 결과에 따라 TASK 1의 수정 범위가 변할 수 있음 (수집 누락이 원인이면 157건이 줄어듦)
- DB 직접 조회 필요 → Supabase 서비스 키 또는 SQL 클라이언트 접근

---

## 6. 참조

### 관련 파일
- `src/app/api/cron/collect-daily/route.ts` — 수집 메인 (라인 230-299: creative_media upsert)
- `src/lib/protractor/meta-collector.ts` — AD_FIELDS 정의 (라인 8-20)
- `src/lib/protractor/creative-type.ts` — VIDEO 타입 판별
- `src/lib/protractor/carousel-cards.ts` — CAROUSEL 카드 추출
- `src/lib/protractor/creative-image-fetcher.ts` — 권한 에러 처리 (커밋 82c1624)

### DB 테이블
- `ad_accounts` — is_active, account_id
- `creatives` — ad_id, account_id, creative_type
- `creative_media` — media_type, content_hash, storage_url, video_analysis
- `cron_runs` — 크론 실행 이력
