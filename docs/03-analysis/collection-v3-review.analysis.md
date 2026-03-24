# 수집 구조 v3 — 마이그레이션 리뷰 보고서

**작성일**: 2026-03-24
**상태**: 리뷰 (구현 전 분석)
**TASK**: TASK-COLLECTION-V3.md

---

## 1. DB 마이그레이션 필요 사항

### 1.1 ad_accounts 테이블 변경

현재 ad_accounts 컬럼:
```
id, account_id(UNIQUE), account_name, active, user_id(FK→profiles),
meta_status, mixpanel_board_id, mixpanel_project_id, mixpanel_status,
created_at, updated_at
```

**추가 필요:**

| 컬럼 | 타입 | 기본값 | 용도 |
|------|------|--------|------|
| `is_member` | BOOLEAN | false | 가입한 수강생 계정 여부 (user_id IS NOT NULL이면 true) |
| `discovered_at` | TIMESTAMPTZ | now() | 디스커버리로 최초 발견 시각 |
| `last_checked_at` | TIMESTAMPTZ | NULL | 마지막 디스커버리 체크 시각 |
| `currency` | TEXT | NULL | Meta 계정 통화 (KRW 등) |
| `account_status` | INT | NULL | Meta account_status (1=ACTIVE, 2=DISABLED 등) |

**인덱스:**
```sql
CREATE INDEX idx_aa_active ON ad_accounts(active) WHERE active = true;
CREATE INDEX idx_aa_is_member ON ad_accounts(is_member);
```

**마이그레이션:**
```sql
-- 기존 42개 계정 중 user_id 있는 것 → is_member=true
UPDATE ad_accounts SET is_member = true WHERE user_id IS NOT NULL;
```

### 1.2 creative_media 테이블 변경

현재 관련 컬럼:
```
media_hash (TEXT) — 파일 SHA-256 (process-media에서 계산)
```

**추가 필요:**

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `content_hash` | TEXT | Meta `image_hash` (이미지) 또는 `video_id` (영상) 저장 |

**핵심 차이:**
- `media_hash`: 다운로드된 파일의 SHA-256 (process-media 단계에서 계산)
- `content_hash`: Meta API가 제공하는 원본 식별자 (collect-daily 단계에서 즉시 저장)
  - 이미지: `creative.image_hash` (Meta가 업로드 시 생성하는 고유 해시)
  - 영상: `creative.video_id` (Meta 영상 고유 ID)

**인덱스:**
```sql
CREATE INDEX idx_cm_content_hash ON creative_media(content_hash) WHERE content_hash IS NOT NULL;
```

### 1.3 마이그레이션 SQL 요약

```sql
-- ad_accounts 확장
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT false;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS account_status INT;

UPDATE ad_accounts SET is_member = true WHERE user_id IS NOT NULL;

-- creative_media 확장
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_aa_active ON ad_accounts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_aa_is_member ON ad_accounts(is_member);
CREATE INDEX IF NOT EXISTS idx_cm_content_hash ON creative_media(content_hash) WHERE content_hash IS NOT NULL;
```

---

## 2. 기존 코드 영향 범위

### 2.1 수정 필요 파일 (직접 변경)

| 파일 | 변경 내용 | 난이도 |
|------|-----------|--------|
| **신규** `/api/cron/discover-accounts/route.ts` | 계정 디스커버리 크론 신규 생성 | 중 |
| `src/app/api/cron/collect-daily/route.ts` | ad_accounts 전체 active 조회 (기존: profiles JOIN), content_hash 저장 | 중 |
| `src/lib/collect-daily-utils.ts` | content_hash 추출 로직 추가 (image_hash/video_id from AD_FIELDS) | 소 |
| `src/app/api/cron/process-media/route.ts` | content_hash 기준 storage_url 재사용 로직 | 중 |
| `src/app/api/cron/embed-creatives/route.ts` | content_hash 기준 임베딩 재사용 로직 | 소 |
| `src/app/api/cron/analyze-five-axis/route.ts` (확인 필요) | content_hash 기준 분석 재사용 로직 | 소 |
| `src/app/api/cron/creative-saliency/route.ts` | content_hash 기준 saliency 재사용 로직 | 소 |

### 2.2 영향 없음 (변경 불필요)

| 파일 | 이유 |
|------|------|
| `video-saliency/route.ts` | VIDEO는 video_id 기준이지만 creative_media.id로 개별 조회, 변경 불필요 |
| `collect-benchmarks/route.ts` | 벤치마크는 ad_id 기준 성과 집계, content_hash 무관 |
| `daily_ad_insights` 관련 | 성과 지표는 ad_id × date 기준 (같은 콘텐츠라도 광고별 성과 다름) |
| 프론트엔드 코드 | 프론트는 creative_media 조회 시 기존 인터페이스 유지 |

### 2.3 현재 collect-daily 흐름 (수정 포인트)

```
현재:
1. ad_accounts에서 active=true 조회 (42개)
2. 각 계정별 Meta API /ads 호출
3. daily_ad_insights UPSERT (ad_id + date)
4. creatives UPSERT (ad_id)
5. creative_media UPSERT (creative_id + position)
   └ media_hash = null (process-media에서 나중에 채움)

변경 후:
1. ad_accounts에서 active=true 조회 (디스커버리 포함 전체)  ← 변경
2. 각 계정별 Meta API /ads 호출 (동일)
3. daily_ad_insights UPSERT (동일)
4. creatives UPSERT (동일)
5. creative_media UPSERT + content_hash 저장  ← 추가
   └ content_hash = ad.creative.image_hash || ad.creative.video_id
```

### 2.4 현재 process-media 흐름 (수정 포인트)

```
현재:
1. creative_media WHERE storage_url IS NULL 조회
2. 이미지: image_hash → Meta adimages API로 URL 조회 → 다운로드 → GCS 업로드
3. 영상: video_id → Meta API source URL → 다운로드 → GCS 업로드

변경 후:
1. creative_media WHERE storage_url IS NULL 조회 (동일)
2. ★ 다운로드 전: content_hash로 이미 storage_url 있는 다른 row 검색
   → 있으면 그 storage_url을 복사 + 다운로드 스킵
3. 없으면 기존대로 다운로드 → GCS 업로드
```

---

## 3. creatives ↔ creative_media 관계 변경

### 3.1 현재 구조 (ad_id 기준)

```
creatives (ad_id UNIQUE)
  └── creative_media (creative_id + position UNIQUE)
      1개 creative → 1~N개 media (CAROUSEL이면 N, 아니면 1)

같은 이미지를 3개 광고에서 사용:
  creative(ad_id=111) → creative_media(pos=0, image_hash=abc)  ← 별도 row
  creative(ad_id=222) → creative_media(pos=0, image_hash=abc)  ← 별도 row
  creative(ad_id=333) → creative_media(pos=0, image_hash=abc)  ← 별도 row

  → 3건 다운로드, 3건 임베딩, 3건 5축 분석, 3건 DeepGaze = 낭비
```

### 3.2 변경 후 구조 (content_hash 추가)

```
creatives (ad_id UNIQUE) — 변경 없음
  └── creative_media (creative_id + position UNIQUE) — content_hash 컬럼 추가

같은 이미지를 3개 광고에서 사용:
  creative(ad_id=111) → creative_media(pos=0, content_hash=abc)  ← 1번째: 정상 처리
  creative(ad_id=222) → creative_media(pos=0, content_hash=abc)  ← 2번째: 결과 복사
  creative(ad_id=333) → creative_media(pos=0, content_hash=abc)  ← 3번째: 결과 복사

  → 1건 다운로드, 1건 임베딩, 1건 분석 + 2건 복사 = 절약
```

### 3.3 관계 변경 정리

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| creatives:creative_media | 1:N (position별) | **동일** (변경 없음) |
| creative_media 행 수 | ad_id별 독립 | **동일** (행은 그대로 유지) |
| 중복 콘텐츠 | 별도 다운로드+분석 | 첫 번째만 실행, 나머지는 결과 복사 |
| dedup 방식 | 없음 | content_hash로 이전 결과 참조 |

**핵심: 테이블 관계는 바뀌지 않는다.** creative_media 행은 여전히 ad_id별로 독립 생성됨.
다만 content_hash가 같으면 storage_url, embedding, analysis_json, saliency_url 등의 결과를 복사함.

### 3.4 복사 가능한 필드 목록

content_hash가 같으면 아래 필드를 기존 row에서 복사:

| 필드 | 복사 가능 | 이유 |
|------|-----------|------|
| `storage_url` | ✅ | 같은 파일 = 같은 GCS URL 재사용 |
| `thumbnail_url` | ✅ | 같은 영상 = 같은 썸네일 |
| `embedding` | ✅ | 같은 이미지 = 같은 벡터 |
| `text_embedding` | ❌ | ad_copy가 광고마다 다를 수 있음 |
| `analysis_json` | ✅ | 같은 이미지 = 같은 5축 분석 |
| `saliency_url` | ✅ | 같은 이미지 = 같은 히트맵 |
| `video_analysis` | ✅ | 같은 영상 = 같은 시선 흐름 |

---

## 4. ad_accounts 테이블 변경 상세

### 4.1 현재 ad_accounts (42개)

```
전부 수강생이 가입 시 등록한 계정 (user_id 연결됨)
→ 가입 안 한 수강생의 계정은 수집 대상에서 빠짐
→ Meta 앱 토큰으로 접근 가능하지만 DB에 없음
```

### 4.2 디스커버리 시 필요한 컬럼

| 컬럼 | 용도 | 디스커버리 동작 |
|------|------|----------------|
| `is_member` | 가입 수강생 구분 | 기존 계정: true, 디스커버리 신규: false |
| `discovered_at` | 최초 발견 시각 | 신규 등록 시 now() |
| `last_checked_at` | 마지막 디스커버리 체크 | 매주 디스커버리 실행 시 갱신 |
| `currency` | 통화 | Meta API 응답에서 추출 |
| `account_status` | Meta 계정 상태 | 1=ACTIVE, 2=DISABLED 등 |

### 4.3 디스커버리 크론 로직 (신규)

```
GET /api/cron/discover-accounts (주 1회)

1. Meta API: GET /me/adaccounts?fields=account_id,name,account_status,currency
   → 접근 가능한 전체 광고계정 목록

2. 각 계정의 90일 impressions 체크:
   GET /act_{id}/insights?date_preset=last_90d&fields=impressions
   → impressions 0이면 스킵 (비활성 계정)

3. 활성 계정 → ad_accounts UPSERT:
   - 이미 있으면: account_name, account_status, currency, last_checked_at 업데이트
   - 없으면: 신규 등록 (is_member=false, active=true, discovered_at=now())

4. 기존 ad_accounts 중 API 응답에 없는 계정:
   → active=false 처리 (접근 권한 상실)
```

### 4.4 user_id 연결 문제

현재 ad_accounts.user_id는 profiles(id)를 참조. 디스커버리로 등록된 계정은 user_id=NULL.
프론트에서 계정 필터 시:
- 가입 수강생: user_id로 본인 계정 조회
- 관리자(admin): 전체 계정 조회 (is_member + 비회원 포함)

---

## 5. Backfill 호환성

### 5.1 현재 backfill 흐름

```
POST /api/admin/protractor/collect
Body: { mode: "backfill", accountIds: ["123456"], days: 90 }

→ 90일 루프: runCollectDaily(date, batch, accountId)
  → Meta API → daily_ad_insights + creatives + creative_media UPSERT
```

### 5.2 호환성 분석

| 항목 | 호환 | 이유 |
|------|------|------|
| 기존 backfill API | ✅ | runCollectDaily() 수정은 content_hash 저장 추가뿐, 기존 로직 유지 |
| 기존 데이터 | ✅ | content_hash=NULL인 기존 데이터는 그대로 동작 (dedup 없이 기존대로 처리) |
| 새 계정 backfill | ✅ | 디스커버리로 등록된 계정도 active=true이면 backfill 대상 |
| 중복 콘텐츠 backfill | ✅ | content_hash 있으면 결과 복사, 없으면 기존대로 처리 |

### 5.3 backfill 시 content_hash 채우기

기존 creative_media에 content_hash가 NULL인 행:
- 방법 1: backfill 재실행 시 collect-daily가 raw_creative에서 image_hash/video_id 추출 → content_hash 업데이트
- 방법 2: 별도 마이그레이션 스크립트로 raw_creative JSONB에서 추출

**추천: 방법 2** (일괄 업데이트)
```sql
-- 기존 데이터 content_hash 채우기 (이미지)
UPDATE creative_media cm
SET content_hash = cm.raw_creative->'image_hash'
WHERE cm.media_type = 'IMAGE'
  AND cm.content_hash IS NULL
  AND cm.raw_creative->>'image_hash' IS NOT NULL;

-- 기존 데이터 content_hash 채우기 (영상)
UPDATE creative_media cm
SET content_hash = cm.raw_creative->>'video_id'
WHERE cm.media_type = 'VIDEO'
  AND cm.content_hash IS NULL
  AND cm.raw_creative->>'video_id' IS NOT NULL;
```

---

## 6. 리스크 및 주의사항

### 6.1 Meta API rate limit

디스커버리 크론이 `/me/adaccounts`로 전체 계정 조회 후, 각 계정의 90일 insights를 체크.
계정 수가 많으면 (예: 200개) API 호출이 200+1회 → rate limit 주의.

**완화:** 90일 insights 체크를 배치로 하거나, insights 없이 account_status만 확인.

### 6.2 content_hash 신뢰성

| 식별자 | 신뢰도 | 설명 |
|--------|--------|------|
| `image_hash` | ✅ 높음 | Meta가 이미지 업로드 시 생성, 동일 파일이면 동일 해시 |
| `video_id` | ✅ 높음 | Meta 영상 고유 ID, 동일 영상이면 동일 ID |
| `creative_id` | ❌ 사용 금지 | 광고 복사 시 새 creative_id 부여됨 |

### 6.3 CAROUSEL 카드별 content_hash

CAROUSEL 소재에서 카드별로 다른 이미지 사용 가능:
```
CAROUSEL (ad_id=111)
  card 0: image_hash=abc (독립 이미지)
  card 1: image_hash=def (독립 이미지)
  card 2: video_id=ghi (독립 영상)
```
→ 각 position별로 content_hash가 다를 수 있음. 정상 동작.

### 6.4 기존 데이터와의 공존

content_hash=NULL인 기존 데이터:
- 다운스트림 크론(embed, saliency 등)은 content_hash 참조 없이 기존대로 동작
- content_hash가 있는 새 데이터만 dedup 혜택을 받음
- 점진적 전환 가능 (기존 데이터는 마이그레이션 스크립트로 backfill)

---

## 7. 구현 순서 제안

```
STEP 0: DB 마이그레이션
  - ad_accounts: is_member, discovered_at, last_checked_at, currency, account_status
  - creative_media: content_hash
  - 기존 데이터 backfill (raw_creative에서 content_hash 추출)

STEP 1: 계정 디스커버리 크론 (/api/cron/discover-accounts)
  - /me/adaccounts → 활성 계정 필터 → ad_accounts UPSERT
  - 접근 불가 계정 → active=false

STEP 2: collect-daily 수정
  - content_hash 저장 (image_hash || video_id)
  - 전체 active 계정 대상 (디스커버리 포함)

STEP 3: process-media 수정
  - content_hash 기준 storage_url 재사용

STEP 4: 다운스트림 크론 수정
  - embed-creatives: content_hash 기준 임베딩 복사
  - analyze-five-axis: content_hash 기준 분석 복사
  - creative-saliency: content_hash 기준 saliency 복사

STEP 5: QA + Gap 분석
```

---

## 8. 예상 효과

### 수집 범위 확대
- 현재: 42개 계정 (가입 수강생만)
- 변경 후: Meta 앱 토큰 접근 가능한 전체 (예상 100~200개)

### 중복 제거 절약 (추정)
- 동일 이미지를 여러 광고에서 사용하는 패턴이 흔함 (특히 A/B 테스트)
- 예상 중복률: 20~30%
- 절약: GCS 스토리지, Gemini 임베딩 API 비용, DeepGaze 분석 시간

---

**Smith님 승인 후 구현 시작합니다.**
