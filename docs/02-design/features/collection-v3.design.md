# 수집 구조 v3 — Design

## 1. 데이터 모델

### 1.1 ad_accounts 추가 컬럼

| 컬럼 | 타입 | 기본값 | 용도 |
|------|------|--------|------|
| `is_member` | BOOLEAN | false | 가입 수강생 계정 (user_id NOT NULL이면 true) |
| `discovered_at` | TIMESTAMPTZ | now() | 디스커버리 최초 발견 시각 |
| `last_checked_at` | TIMESTAMPTZ | NULL | 마지막 디스커버리 체크 시각 |
| `currency` | TEXT | NULL | Meta 계정 통화 |
| `account_status` | INT | NULL | Meta account_status (1=ACTIVE 등) |

### 1.2 creative_media 추가 컬럼

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `content_hash` | TEXT | Meta image_hash (이미지) 또는 video_id (영상) |

기존 `media_hash`(파일 SHA-256)와 별개. content_hash는 다운로드 전 Meta API에서 즉시 알 수 있음.

### 1.3 인덱스

```sql
CREATE INDEX idx_aa_active ON ad_accounts(active) WHERE active = true;
CREATE INDEX idx_aa_is_member ON ad_accounts(is_member);
CREATE INDEX idx_cm_content_hash ON creative_media(content_hash) WHERE content_hash IS NOT NULL;
```

## 2. API 설계

### 2.1 GET /api/cron/discover-accounts (신규)

| 항목 | 값 |
|------|-----|
| Method | GET |
| Auth | CRON_SECRET |
| 주기 | 주 1회 |
| maxDuration | 300s |

**흐름:**
```
1. Meta API: GET /me/adaccounts?fields=account_id,name,account_status,currency&limit=500
2. 각 계정: GET /act_{id}/insights?date_preset=last_90d&fields=impressions
   → impressions=0이면 스킵
3. 활성 계정 → ad_accounts UPSERT:
   - 신규: is_member=false, active=true, discovered_at=now()
   - 기존: account_name, account_status, currency, last_checked_at 업데이트
4. API 응답에 없는 기존 계정 → active=false
```

**응답:**
```json
{
  "message": "discover-accounts 완료",
  "elapsed": "12.3s",
  "totalApiAccounts": 150,
  "activeAccounts": 120,
  "newAccounts": 15,
  "deactivated": 3
}
```

### 2.2 collect-daily 변경

기존 흐름에 content_hash 저장 추가:

```typescript
// creative_media UPSERT 시
const contentHash = ad.creative?.image_hash || ad.creative?.video_id || null;
mediaRow.content_hash = contentHash;

// CAROUSEL 카드별:
card.content_hash = card.imageHash || card.videoId || null;
```

### 2.3 process-media 변경

다운로드 전 content_hash 기준 중복 체크:

```typescript
// Step 0: content_hash가 같은 다른 row에서 storage_url 가져오기
if (row.content_hash) {
  const { data: existing } = await svc
    .from("creative_media")
    .select("storage_url, thumbnail_url")
    .eq("content_hash", row.content_hash)
    .not("storage_url", "is", null)
    .neq("id", row.id)
    .limit(1)
    .maybeSingle();

  if (existing?.storage_url) {
    // 복사하고 다운로드 스킵
    await svc.from("creative_media")
      .update({ storage_url: existing.storage_url, thumbnail_url: existing.thumbnail_url })
      .eq("id", row.id);
    continue;
  }
}
// 기존 다운로드 로직...
```

### 2.4 다운스트림 크론 변경 (동일 패턴)

embed-creatives, creative-saliency 각각에서:

```typescript
// 처리 전: content_hash 같은 다른 row에서 결과 복사
if (row.content_hash) {
  const { data: donor } = await svc
    .from("creative_media")
    .select("embedding, analysis_json, saliency_url")  // 각 크론에 맞는 필드
    .eq("content_hash", row.content_hash)
    .not("embedding", "is", null)  // 각 크론에 맞는 조건
    .neq("id", row.id)
    .limit(1)
    .maybeSingle();

  if (donor) {
    await svc.from("creative_media")
      .update({ embedding: donor.embedding })
      .eq("id", row.id);
    continue;  // 분석 스킵
  }
}
```

## 3. content_hash 복사 가능 필드

| 필드 | 복사 | 이유 |
|------|------|------|
| storage_url | ✅ | 같은 파일 = 같은 GCS URL |
| thumbnail_url | ✅ | 같은 영상 = 같은 썸네일 |
| embedding (vector) | ✅ | 같은 이미지 = 같은 벡터 |
| text_embedding | ❌ | ad_copy가 광고마다 다름 |
| analysis_json | ✅ | 같은 이미지 = 같은 5축 분석 |
| saliency_url | ✅ | 같은 이미지 = 같은 히트맵 |
| video_analysis | ✅ | 같은 영상 = 같은 시선 분석 |

## 4. 마이그레이션 SQL

```sql
-- ad_accounts 확장
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT false;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS account_status INT;
UPDATE ad_accounts SET is_member = true WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aa_active ON ad_accounts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_aa_is_member ON ad_accounts(is_member);

-- creative_media 확장
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_cm_content_hash ON creative_media(content_hash)
  WHERE content_hash IS NOT NULL;

-- 기존 데이터 content_hash 채우기
UPDATE creative_media
SET content_hash = raw_creative->>'image_hash'
WHERE media_type = 'IMAGE'
  AND content_hash IS NULL
  AND raw_creative->>'image_hash' IS NOT NULL;

UPDATE creative_media
SET content_hash = raw_creative->>'video_id'
WHERE media_type = 'VIDEO'
  AND content_hash IS NULL
  AND raw_creative->>'video_id' IS NOT NULL;
```

## 5. 에러 처리

| 상황 | 처리 |
|------|------|
| Meta API /me/adaccounts 실패 | 크론 전체 실패 → 500 반환, 다음 주 재시도 |
| 계정별 insights 조회 실패 | 해당 계정 스킵, 다음 계정 계속 |
| content_hash 복사 대상 없음 | 기존대로 다운로드/분석 실행 |
| content_hash=NULL (레거시 데이터) | dedup 없이 기존대로 처리 |
| Cloud SQL 마이그레이션 실패 | 롤백, 수동 재실행 |

## 6. 구현 순서

- [x] 6.0 Plan + Design 문서 작성
- [ ] 6.1 DB 마이그레이션 (Cloud SQL)
- [ ] 6.2 discover-accounts 크론 생성
- [ ] 6.3 collect-daily content_hash 저장
- [ ] 6.4 process-media content_hash 재사용
- [ ] 6.5 다운스트림 크론 content_hash 재사용
- [ ] 6.6 tsc + build + 커밋
