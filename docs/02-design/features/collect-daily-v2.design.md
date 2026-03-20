# collect-daily v2 전환 설계서

> 작성: Leader | 2026-03-20
> 참조: TASK-phase2-execution.md STEP 1, ADR-001, collect-daily/route.ts

---

## 1. 데이터 모델

### 기존 (v1)
```
Meta API → daily_ad_insights (성과)
         → ad_creative_embeddings (소재 메타 — 77컬럼 통합)
```

### 변경 후 (v2) — 양쪽 모두 UPSERT
```
Meta API → daily_ad_insights (성과) — 변경 없음
         → creatives (소재 마스터) — 신규 UPSERT
         → creative_media (미디어) — 신규 UPSERT
         → landing_pages (LP) — 신규 UPSERT (LP URL 있을 때)
         → ad_creative_embeddings (v1) — 호환 유지
```

### UPSERT 순서 (FK 의존성)
```
1. landing_pages (canonical_url ON CONFLICT) → lp_id 반환
2. creatives (ad_id ON CONFLICT) → creative_id 반환, lp_id FK 연결
3. creative_media (creative_id ON CONFLICT) → media 저장
4. ad_creative_embeddings (ad_id ON CONFLICT) → 호환 유지
```

---

## 2. API 설계 (Meta API 필드 추가)

### AD_FIELDS 변경

```typescript
// 현재
"creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec)"

// 변경 → effective_object_story_spec 추가 (LP URL 추출용)
"creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec,effective_object_story_spec)"
```

### LP URL 추출 경로
```
ad.creative.effective_object_story_spec.link_data.link  ← 가장 흔한 경로
ad.creative.effective_object_story_spec.video_data.call_to_action.value.link  ← 영상 CTA
```

---

## 3. 컴포넌트 구조

### 3-1. LP URL 정규화 모듈 (신규)

**파일**: `src/lib/lp-normalizer.ts`
**역할**: `normalize-lps.mjs`의 URL 정규화 로직을 TypeScript 모듈로 분리

```typescript
export function normalizeUrl(raw: string): { canonical: string; hostname: string } | null;
export function classifyUrl(canonical: string, hostname: string): { page_type: string; platform: string };
```

- 프로토콜 보정 (https:// 추가)
- UTM/쿼리스트링 제거
- www./m. 프리픽스 제거
- 후행 슬래시 제거
- surl 리다이렉트는 **하지 않음** (collect-daily는 빠르게 끝나야 함 → 리다이렉트 해소는 별도 배치)

### 3-2. collect-daily/route.ts 수정

**수정 위치**: `runCollectDaily()` 내 lines 370~417 (creativeRows 빌드 + UPSERT)

#### 변경 1: LP URL 추출
```typescript
// ad 객체에서 LP URL 추출
function extractLpUrl(ad: any): string | null {
  const oss = ad.creative?.effective_object_story_spec;
  if (!oss) return null;
  // link_data.link (이미지/캐러셀)
  if (oss.link_data?.link) return oss.link_data.link;
  // video_data.call_to_action.value.link (영상)
  if (oss.video_data?.call_to_action?.value?.link) return oss.video_data.call_to_action.value.link;
  return null;
}
```

#### 변경 2: landing_pages UPSERT
```typescript
// LP URL 수집 → 정규화 → landing_pages UPSERT
const lpUrlMap = new Map<string, { canonical: string; hostname: string; account_id: string }>();

for (const ad of ads) {
  const rawLpUrl = extractLpUrl(ad);
  if (!rawLpUrl) continue;
  const norm = normalizeUrl(rawLpUrl);
  if (!norm) continue;
  lpUrlMap.set(norm.canonical, { ...norm, account_id: account.account_id });
}

// landing_pages UPSERT (canonical_url ON CONFLICT)
if (lpUrlMap.size > 0) {
  const lpRows = Array.from(lpUrlMap.values()).map(lp => {
    const { page_type, platform } = classifyUrl(lp.canonical, lp.hostname);
    return {
      account_id: lp.account_id,
      canonical_url: lp.canonical,
      domain: lp.hostname,
      page_type,
      platform,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
  });
  await svc.from("landing_pages").upsert(lpRows, { onConflict: "canonical_url" });
}
```

#### 변경 3: creatives UPSERT
```typescript
// creativeRows 빌드 (기존 ad_creative_embeddings 로직 확장)
const v2CreativeRows = ads.map((ad: any) => {
  const adId = (ad.ad_id ?? ad.id) as string;
  if (!adId) return null;
  const creative = ad.creative;
  const creativeType = getCreativeType(ad);
  const rawLpUrl = extractLpUrl(ad);

  return {
    ad_id: adId,
    account_id: account.account_id,
    creative_type: creativeType,
    source: "bscamp",
    brand_name: account.account_name || null,
    is_active: true,
    lp_url: rawLpUrl || null,  // 원본 LP URL (정규화 전)
    updated_at: new Date().toISOString(),
  };
}).filter(Boolean);

// creatives UPSERT (ad_id ON CONFLICT)
if (v2CreativeRows.length > 0) {
  const { error } = await svc
    .from("creatives")
    .upsert(v2CreativeRows, { onConflict: "ad_id" });
}
```

#### 변경 4: creatives.lp_id FK 연결
```typescript
// LP URL 정규화 후 lp_id 매핑
// 1. landing_pages에서 canonical_url → id 조회
// 2. creatives에서 lp_url → canonical_url 매핑 → lp_id UPDATE
if (lpUrlMap.size > 0) {
  const { data: lpIdData } = await svc
    .from("landing_pages")
    .select("id, canonical_url")
    .in("canonical_url", Array.from(lpUrlMap.keys()));

  if (lpIdData && lpIdData.length > 0) {
    const canonicalToLpId = new Map(lpIdData.map(lp => [lp.canonical_url, lp.id]));

    for (const ad of ads) {
      const rawLpUrl = extractLpUrl(ad);
      if (!rawLpUrl) continue;
      const norm = normalizeUrl(rawLpUrl);
      if (!norm) continue;
      const lpId = canonicalToLpId.get(norm.canonical);
      if (!lpId) continue;
      const adId = (ad.ad_id ?? ad.id) as string;

      await svc.from("creatives")
        .update({ lp_id: lpId })
        .eq("ad_id", adId);
    }
  }
}
```

**최적화**: 개별 UPDATE 대신 배치 처리 — `ad_id → lp_id` 매핑을 모아서 한 번에

#### 변경 5: creative_media UPSERT
```typescript
// media_url 있는 건만 creative_media에 UPSERT
// creative_id FK가 필요하므로 creatives UPSERT 후 id 조회
const adIds = v2CreativeRows.map(r => r.ad_id);
const { data: creativeIdData } = await svc
  .from("creatives")
  .select("id, ad_id")
  .in("ad_id", adIds);

const adIdToCreativeId = new Map(
  (creativeIdData || []).map(c => [c.ad_id, c.id])
);

const mediaRows = ads.map((ad: any) => {
  const adId = (ad.ad_id ?? ad.id) as string;
  const creativeId = adIdToCreativeId.get(adId);
  if (!creativeId) return null;

  const creative = ad.creative;
  const imageHash = creative?.image_hash;
  const videoId = creative?.video_id;
  const mediaUrl = /* 기존 3단계 fallback 로직 */;

  if (!mediaUrl) return null;  // media_url 없으면 creative_media에 안 넣음

  return {
    creative_id: creativeId,
    media_type: videoId ? "VIDEO" : "IMAGE",
    media_url: mediaUrl,
    media_hash: imageHash || null,
    // ad_copy, storage_url, embedding은 embed-creatives에서 채움
  };
}).filter(Boolean);

if (mediaRows.length > 0) {
  await svc.from("creative_media")
    .upsert(mediaRows, { onConflict: "creative_id" });
}
```

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| landing_pages UPSERT 실패 | 로깅 후 계속 (creatives.lp_id = null) |
| creatives UPSERT 실패 | 로깅 후 계속 (creative_media 스킵) |
| creative_media UPSERT 실패 | 로깅 후 계속 |
| ad_creative_embeddings UPSERT 실패 | 기존 로직 유지 (로깅 후 계속) |
| LP URL 정규화 실패 | null 처리, 해당 LP 스킵 |
| effective_object_story_spec 없음 | lp_url = null, 정상 (일부 소재는 LP 없음) |

**원칙**: v2 UPSERT 실패가 기존 v1 UPSERT나 daily_ad_insights에 영향 주면 안 됨.
모든 v2 UPSERT는 독립적 try-catch로 감싼다.

---

## 5. 구현 순서

- [ ] **S1**: `src/lib/lp-normalizer.ts` 작성 (normalizeUrl + classifyUrl)
- [ ] **S2**: `collect-daily/route.ts` — AD_FIELDS에 effective_object_story_spec 추가
- [ ] **S3**: `collect-daily/route.ts` — extractLpUrl() 헬퍼 추가
- [ ] **S4**: `collect-daily/route.ts` — landing_pages UPSERT 로직
- [ ] **S5**: `collect-daily/route.ts` — creatives UPSERT 로직
- [ ] **S6**: `collect-daily/route.ts` — creatives.lp_id FK 연결
- [ ] **S7**: `collect-daily/route.ts` — creative_media UPSERT 로직
- [ ] **S8**: `collect-daily/route.ts` — 로깅 추가 (건수 출력)
- [ ] **S9**: tsc + lint + build 통과
- [ ] **S10**: Gap 분석

---

## 6. 변경 파일 목록

| 파일 | 변경 | 담당 |
|------|------|------|
| `src/lib/lp-normalizer.ts` | **신규** — LP URL 정규화 모듈 | backend-dev |
| `src/app/api/cron/collect-daily/route.ts` | **수정** — v2 테이블 UPSERT 추가 | backend-dev |

---

## 7. 데이터 흐름 (변경 후)

```
Meta API (per account)
│
├── /ads?fields=...,effective_object_story_spec,...
│
├─── daily_ad_insights UPSERT (성과) ← 변경 없음
│
├─── [v2] LP URL 추출 + 정규화
│    └─── landing_pages UPSERT (canonical_url ON CONFLICT)
│
├─── [v2] creatives UPSERT (ad_id ON CONFLICT)
│    └─── lp_id FK 연결 (landing_pages.id)
│
├─── [v2] creative_media UPSERT (creative_id ON CONFLICT)
│    └─── media_url, media_type, media_hash
│
└─── [v1 호환] ad_creative_embeddings UPSERT (ad_id ON CONFLICT) ← 기존 유지
```
