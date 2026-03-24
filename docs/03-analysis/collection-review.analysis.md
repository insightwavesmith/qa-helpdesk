# 수집→저장→분석 구조 코드리뷰 + 변경점 도출

**검토일**: 2026-03-24
**범위**: 수집 입구 → DB 스키마 → 하류 SELECT → 분석 파이프라인 전수조사
**타입**: 분석/리뷰 (코드 수정 없음)

---

## 1. 변경 목록 (파일별, 우선순위)

### P0 — CRITICAL (CAROUSEL 대응 전제조건)

| # | 파일 | 변경 내용 | 이유 |
|---|------|---------|------|
| 1 | `supabase/migrations/` | `creative_media.creative_id UNIQUE` 제약 제거 → `UNIQUE(creative_id, position)` | 현재 1:1 강제 → CAROUSEL 1:N 불가 |
| 2 | `supabase/migrations/` | `creative_media.position INT DEFAULT 0` 추가 | 카드별 식별자 |
| 3 | `src/lib/protractor/creative-type.ts` | CAROUSEL 타입 분류 로직 추가 | 현재 IMAGE/VIDEO/CATALOG만. CAROUSEL 누락 |
| 4 | `src/app/api/cron/collect-daily/route.ts` | CAROUSEL 다중 슬라이드 → creative_media N행 저장 | 현재 1광고=1미디어만 저장 |

### P1 — HIGH (데이터 정합성)

| # | 파일 | 변경 내용 | 이유 |
|---|------|---------|------|
| 5 | `src/app/api/protractor/overlap/route.ts:176` | reach 합산 로직 수정 | reach는 유니크 수치 — 합산하면 중복 카운트 |
| 6 | `src/app/api/admin/backfill/route.ts:377` | 동일 reach 합산 버그 | overlap과 동일 문제 |
| 7 | `src/lib/precompute/insights-precompute.ts:188` | `acc.reach += row.reach` → MAX 또는 제거 | 일별 reach 합산 = 부정확 |
| 8 | `scripts/collect-benchmark-creatives.mjs:205` | `getCreativeType()` 공용 함수 사용 | 현재 하드코딩 `VIDEO/IMAGE`만 — CAROUSEL 불가 |
| 9 | `scripts/collect-benchmark-creatives.mjs:209` | LP URL 추출 로직 — asset_feed_spec fallback 누락 | collect-daily와 로직 불일치 |

### P2 — MEDIUM (CAROUSEL 하류 대응)

| # | 파일 | 변경 내용 | 이유 |
|---|------|---------|------|
| 10 | `src/lib/ad-creative-embedder.ts:55-59` | `maybeSingle()` → position별 처리 | CAROUSEL 카드별 임베딩 필요 |
| 11 | `scripts/analyze-five-axis.mjs:1037-1225` | creative_media N행 순회 + analysis_json 카드별 | 5축 분석 카드별 실행 필요 |
| 12 | `src/app/api/cron/creative-saliency/route.ts` | DeepGaze 카드별 호출 | 카드별 시선 히트맵 필요 |
| 13 | `scripts/compute-andromeda-similarity.mjs` | andromeda_signals 카드별 처리 | 유사도 계산 시 카드 단위 |
| 14 | `src/app/api/cron/embed-creatives/route.ts` | creative_media N행 대응 | 임베딩 크론에서 position 지원 |

### P3 — LOW (정리/개선)

| # | 파일 | 변경 내용 | 이유 |
|---|------|---------|------|
| 15 | `supabase/migrations/20260322_v3_schema_additions.sql` 내 RPC | `c.source = 'member'` → `c.is_member = true` | get_student_creative_summary RPC — 유일한 source 필터 사용처 |
| 16 | `src/app/api/admin/creative-intelligence/route.ts:51` | `website_purchase_value` → `purchase_value` 확인 | 존재하지 않을 수 있는 컬럼 참조 |

---

## 2. Migration SQL 초안

```sql
-- =============================================================
-- CAROUSEL 지원 + creative_media 1:N 전환
-- =============================================================

-- 1. creative_media에 position 컬럼 추가
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS card_total INT DEFAULT 1;

-- 2. 기존 UNIQUE(creative_id) 제약 제거 → UNIQUE(creative_id, position) 으로 변경
ALTER TABLE creative_media DROP CONSTRAINT IF EXISTS creative_media_creative_id_key;
ALTER TABLE creative_media ADD CONSTRAINT creative_media_creative_position_unique
  UNIQUE (creative_id, position);

-- 3. creative_media에 lp_id 추가 (카드별 LP 다를 수 있음)
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS lp_id UUID REFERENCES landing_pages(id);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_cm_position ON creative_media (creative_id, position);

-- 5. 기존 데이터: 모두 position=0 (단일 미디어)
-- DEFAULT 0이므로 자동 처리됨
```

**주의사항:**
- UNIQUE 제약 제거는 BREAKING CHANGE — onConflict("creative_id") 사용하는 모든 코드 수정 필요
- 영향 받는 upsert: collect-daily (route.ts), collect-benchmark-creatives.mjs
- onConflict를 `"creative_id,position"`으로 변경해야 함

---

## 3. CAROUSEL 분류 로직 초안

### creative-type.ts 수정안

```typescript
// 현재: IMAGE / VIDEO / CATALOG 만
// 추가: CAROUSEL

export function getCreativeType(ad: Record<string, unknown>): string {
  const creative = (ad as any).creative;
  if (!creative) return "IMAGE";

  const objectType = creative.object_type;
  const videoId = creative.video_id;
  const productSetId = creative.product_set_id;
  const afsImages = creative.asset_feed_spec?.images;
  const afsVideos = creative.asset_feed_spec?.videos;
  const oss = creative.object_story_spec;

  // CAROUSEL 감지 (우선순위 높음)
  // 1) object_story_spec.template_data 존재 = CAROUSEL
  if (oss?.template_data) return "CAROUSEL";
  // 2) asset_feed_spec.images 2개 이상 = CAROUSEL (CATALOG 아닌 경우)
  if (!productSetId && afsImages && Array.isArray(afsImages) && afsImages.length > 1) {
    return "CAROUSEL";
  }

  // SHARE (기존 로직)
  if (objectType === "SHARE") {
    if (videoId || (afsVideos && afsVideos.length > 0)) return "VIDEO";
  }

  // CATALOG
  if (productSetId) return "CATALOG";

  // VIDEO
  if (videoId) return "VIDEO";
  if (oss?.video_data) return "VIDEO";
  if (afsVideos && afsVideos.length > 0) return "VIDEO";

  // IMAGE (기본값)
  return "IMAGE";
}
```

### CAROUSEL 카드 추출 함수 (신규)

```typescript
export function extractCarouselCards(ad: Record<string, unknown>): Array<{
  imageHash: string | null;
  imageUrl: string | null;
  videoId: string | null;
  lpUrl: string | null;
  position: number;
}> {
  const creative = (ad as any).creative;
  const oss = creative?.object_story_spec;
  const cards: Array<any> = [];

  // template_data.elements → 각 카드
  if (oss?.template_data?.elements) {
    oss.template_data.elements.forEach((el: any, i: number) => {
      cards.push({
        imageHash: el.image_hash || null,
        imageUrl: null, // hashToUrl 매핑 필요
        videoId: el.video_id || null,
        lpUrl: el.link || null,
        position: i,
      });
    });
  }
  // asset_feed_spec.images → 각 카드 (template_data 없는 경우)
  else if (creative?.asset_feed_spec?.images) {
    creative.asset_feed_spec.images.forEach((img: any, i: number) => {
      cards.push({
        imageHash: img.hash || null,
        imageUrl: img.url || null,
        videoId: null,
        lpUrl: null, // AFS는 카드별 LP 없을 수 있음
        position: i,
      });
    });
  }

  return cards;
}
```

---

## 4. 초기 수집 크론 설계

### 신규 계정 3개월 backfill

**결정사항 (Smith님):**
- 숫자: 최근 3개월 일별 전부
- 콘텐츠: active 광고만

**설계:**

```
POST /api/admin/protractor/collect?mode=backfill&account_id=xxx

1. date_range = [today - 90, yesterday]
2. batch_size = 7일 (Meta API 일별 데이터 제한 고려)
3. 반복: for each 7일 window
   a. Meta Insights API → daily_ad_insights (raw_insight + raw_ad)
   b. Meta Ad API → creatives (raw_creative + is_member=true)
   c. creative_media (position별)
   d. landing_pages (중복 제외)
4. 기존 수집 코드(collect-daily) 재사용 — dateParam 파라미터 전달
```

**현재 collect-daily 구조:**
- `runCollectDaily(dateParam?, batch?, accountId?)` — 이미 날짜/계정 파라미터 지원
- backfill은 이 함수를 날짜별 반복 호출하면 됨

**초안 (API route):**
```typescript
// POST /api/admin/protractor/collect?mode=backfill
if (mode === "backfill") {
  const days = 90;
  for (let i = days; i >= 1; i--) {
    const date = formatDate(subDays(new Date(), i)); // YYYY-MM-DD
    await runCollectDaily(date, undefined, accountId);
    await delay(1000); // rate limit
  }
}
```

**주의:**
- Meta API rate limit: 200 calls/hour/ad account
- 90일 × (insights + ads + images) ≈ 270 calls → 충분
- 대규모 계정(광고 수백 개)은 페이지네이션 고려

---

## 5. 영향도 매트릭스

### CAROUSEL 대응 시 변경 영향

```
변경                          │ 영향 받는 파일             │ 깨짐 확률 │ 비고
─────────────────────────────┼──────────────────────────┼──────────┼──────────
creative_media UNIQUE 제거    │ collect-daily             │ 🔴 확실   │ onConflict 변경
                              │ collect-benchmark         │ 🔴 확실   │ onConflict 변경
                              │ embed-creatives           │ 🔴 확실   │ maybeSingle() 깨짐
                              │ analyze-five-axis         │ 🟠 높음   │ 1행 가정 깨짐
                              │ creative-saliency         │ 🟠 높음   │ 1행 가정 깨짐
                              │ andromeda-similarity      │ 🟡 중간   │ analysis_json 구조 변경
─────────────────────────────┼──────────────────────────┼──────────┼──────────
position 컬럼 추가            │ DB 타입 (database.ts)     │ 🟡 중간   │ 타입 업데이트 필요
                              │ SELECT 쿼리 전체          │ 🟢 낮음   │ 기존 쿼리 영향 없음
─────────────────────────────┼──────────────────────────┼──────────┼──────────
CAROUSEL 분류 추가            │ creative-type.ts          │ 🟢 낮음   │ 기존 분기 영향 없음
                              │ collect-daily             │ 🟠 높음   │ 슬라이드별 저장 로직 신규
                              │ creative-image-fetcher    │ 🟡 중간   │ 다중 해시 처리 추가
─────────────────────────────┼──────────────────────────┼──────────┼──────────
reach 합산 수정               │ overlap/route.ts          │ 🟡 중간   │ 수치 변경됨
                              │ backfill/route.ts         │ 🟡 중간   │ 수치 변경됨
                              │ insights-precompute.ts    │ 🟡 중간   │ 수치 변경됨
```

### source → is_member/is_benchmark 전환 영향

```
현재 source 사용처               │ 전환 필요 │ 비고
────────────────────────────────┼──────────┼──────────
RPC get_student_creative_summary │ ✅ 필요   │ c.source='member' → c.is_member=true
collect-daily (source: "member") │ ⚠️ 유지   │ is_member도 설정, source도 유지 (호환)
collect-benchmark (source)       │ ⚠️ 유지   │ is_benchmark도 설정, source도 유지
CHECK 제약 (member/benchmark/..) │ ⚠️ 유지   │ 제약 유지하되, 쿼리는 플래그 사용
```

---

## 6. 추가 발견사항

### 🔴 reach 합산 버그 (3곳)
- `overlap/route.ts:176` — adset별 reach 합산 → 유니크 중복 카운트
- `backfill/route.ts:377` — 동일 버그
- `insights-precompute.ts:188` — 일별 reach 합산 → 부정확

**해결 방향:** reach는 합산 불가. Max(reach) 또는 Meta API의 account-level reach 별도 요청 필요.

### 🟡 benchmark LP 추출 로직 불일치
- collect-daily: `extractLpUrl()` — 3단계 fallback (oss.link_data → oss.video_data → asset_feed_spec)
- collect-benchmark: 2단계만 (oss.link_data → oss.video_data) — asset_feed_spec fallback 누락

### 🟡 creative-intelligence website_purchase_value
- `route.ts:51`에서 `website_purchase_value` 컬럼 참조
- daily_ad_insights에 해당 컬럼 존재 여부 확인 필요 (purchase_value만 존재할 수 있음)

### 🟢 competitor_ad_cache는 CAROUSEL 이미 지원
- `carousel_cards JSONB` 필드로 카드별 데이터 저장 중
- 자사 creatives 구조도 이 패턴 참고 가능

---

## 7. 구현 순서 (권장)

```
Wave 1: DB 스키마 (선행 — 모든 코드 변경의 전제)
  ├─ T1: Migration SQL (position + UNIQUE 변경 + lp_id)
  └─ T2: database.ts 타입 업데이트

Wave 2: 수집 입구 (병렬 가능)
  ├─ T3: creative-type.ts CAROUSEL 분류
  ├─ T4: collect-daily CAROUSEL 다중 슬라이드 저장
  ├─ T5: collect-benchmark getCreativeType 통일 + LP fallback 수정
  └─ T6: 초기 수집 backfill 크론 구현

Wave 3: 하류 수정 (병렬 가능)
  ├─ T7: reach 합산 버그 수정 (3곳)
  ├─ T8: embed-creatives 카드별 임베딩
  ├─ T9: analyze-five-axis 카드별 5축
  └─ T10: creative-saliency 카드별 DeepGaze

Wave 4: 검증
  ├─ T11: 기존 IMAGE/VIDEO 수집 정상 동작 확인
  ├─ T12: CAROUSEL 테스트 데이터로 E2E 검증
  └─ T13: reach 수치 검증 (합산 vs 개별)
```
