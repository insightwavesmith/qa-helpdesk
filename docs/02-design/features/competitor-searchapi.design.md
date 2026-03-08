# 경쟁사 분석기 SearchAPI.io 연동 설계서

> 작성일: 2026-03-08
> Plan: `docs/01-plan/features/competitor-searchapi.plan.md`
> 선행 설계: `docs/02-design/features/competitor-analyzer.design.md`

---

## 1. 데이터 모델

### 1-1. SearchAPI.io 응답 구조 (외부)

SearchAPI.io `meta_ad_library` 엔진의 응답에서 사용할 핵심 필드:

```typescript
// SearchAPI.io raw 응답 (참고용, 직접 사용하지 않음)
interface SearchApiAdRaw {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  start_date: string;               // "2025-10-15"
  end_date?: string;                // null = 게재중
  is_active: boolean;
  publisher_platform: string[];     // ["FACEBOOK", "INSTAGRAM"]
  snapshot: {
    body?: { text?: string };
    title?: string;
    caption?: string;
    link_url?: string;
    display_format?: string;        // "IMAGE" | "VIDEO" | "CAROUSEL" | "DCO" | "MULTI_IMAGES"
    images?: Array<{
      original_image_url: string;
      resized_image_url: string;
    }>;
    videos?: Array<{
      video_hd_url?: string;
      video_sd_url?: string;
      video_preview_image_url?: string;
    }>;
    cards?: Array<{
      title?: string;
      body?: string;
      link_url?: string;
      original_image_url?: string;
      resized_image_url?: string;
    }>;
  };
}
```

### 1-2. CompetitorAd 타입 확장

기존 `CompetitorAd` 인터페이스에 미디어 필드 추가:

```typescript
// src/types/competitor.ts (수정)

/** 가공된 광고 카드 데이터 */
export interface CompetitorAd {
  // === 기존 필드 (유지) ===
  id: string;                       // ad_archive_id (SearchAPI) or id (Meta)
  pageId: string;
  pageName: string;
  body: string;
  title: string;
  caption: string;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  isActive: boolean;
  platforms: string[];
  snapshotUrl: string;

  // === 신규 필드 (T1) ===
  imageUrl: string | null;          // snapshot.images[0].original_image_url
  videoUrl: string | null;          // snapshot.videos[0].video_hd_url ?? video_sd_url
  videoPreviewUrl: string | null;   // snapshot.videos[0].video_preview_image_url
  displayFormat: DisplayFormat;     // "IMAGE" | "VIDEO" | "CAROUSEL" | "UNKNOWN"
  linkUrl: string | null;           // snapshot.link_url (랜딩페이지)
  carouselCards: CarouselCard[];    // CAROUSEL인 경우 개별 카드들
}

export type DisplayFormat = "IMAGE" | "VIDEO" | "CAROUSEL" | "UNKNOWN";

export interface CarouselCard {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
}
```

### 1-3. SearchAPI.io Raw 타입

```typescript
// src/types/competitor.ts (추가)

/** SearchAPI.io Meta Ad Library 응답 항목 */
export interface SearchApiAdRaw {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  publisher_platform?: string[];
  snapshot?: SearchApiSnapshot;
}

export interface SearchApiSnapshot {
  body?: { text?: string } | string;
  title?: string;
  caption?: string;
  link_url?: string;
  display_format?: string;
  images?: Array<{
    original_image_url?: string;
    resized_image_url?: string;
  }>;
  videos?: Array<{
    video_hd_url?: string;
    video_sd_url?: string;
    video_preview_image_url?: string;
  }>;
  cards?: Array<{
    title?: string;
    body?: string;
    link_url?: string;
    original_image_url?: string;
    resized_image_url?: string;
  }>;
}
```

### 1-4. DB 테이블: `competitor_ad_cache` (신규)

```sql
-- supabase/migrations/YYYYMMDD_competitor_ad_cache.sql

CREATE TABLE IF NOT EXISTS competitor_ad_cache (
  ad_archive_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  ad_text TEXT,                          -- body 텍스트
  ad_title TEXT,
  image_url TEXT,                        -- original_image_url
  video_url TEXT,                        -- video_hd_url
  video_preview_url TEXT,                -- video_preview_image_url
  display_format TEXT DEFAULT 'UNKNOWN', -- IMAGE/VIDEO/CAROUSEL/UNKNOWN
  link_url TEXT,                         -- 랜딩페이지 URL
  start_date TEXT,
  end_date TEXT,
  is_active BOOLEAN DEFAULT true,
  platforms JSONB DEFAULT '[]'::jsonb,
  snapshot_url TEXT,                      -- 기존 ad_snapshot_url
  carousel_cards JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,    -- 전체 snapshot 원본 데이터
  expires_at TIMESTAMPTZ,                -- 미디어 URL 만료 시점 (oe 파라미터 기반)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_ad_cache_page_id ON competitor_ad_cache(page_id);
CREATE INDEX idx_ad_cache_expires_at ON competitor_ad_cache(expires_at);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_competitor_ad_cache_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_competitor_ad_cache_updated_at
  BEFORE UPDATE ON competitor_ad_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_competitor_ad_cache_updated_at();

-- RLS: 서비스 클라이언트로만 접근 (public read 허용)
ALTER TABLE competitor_ad_cache ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 읽기 허용
CREATE POLICY "Authenticated users can read ad cache"
  ON competitor_ad_cache FOR SELECT
  TO authenticated
  USING (true);
```

### 1-5. DB Row 타입

```typescript
// src/types/competitor.ts (추가)

export interface CompetitorAdCacheRow {
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  ad_text: string | null;
  ad_title: string | null;
  image_url: string | null;
  video_url: string | null;
  video_preview_url: string | null;
  display_format: string;
  link_url: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  platforms: string[];
  snapshot_url: string | null;
  carousel_cards: CarouselCard[];
  metadata: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## 2. API 설계

### 2-1. 검색 API (T1 — 기존 수정)

```
GET /api/competitor/search
```

**변경 사항:** 내부 구현만 변경. 요청/응답 인터페이스는 하위 호환 유지 + 신규 필드 추가.

| 파라미터 | 타입 | 필수 | 설명 | 변경 |
|----------|------|------|------|------|
| `q` | string | Y | 검색어 | 유지 |
| `country` | string | N | 국가 코드 (default: "KR") | 유지 |
| `active_only` | boolean | N | 게재중만 | 유지 |
| `min_days` | number | N | 최소 운영일수 | 유지 |
| `platform` | string | N | 플랫폼 필터 | 유지 |
| `limit` | number | N | 결과 수 (max: 100) | 유지 |
| `media_type` | string | N | "video" / "image" / "all" | **신규** |

**내부 동작 변경:**

1. `SEARCH_API_KEY` 환경변수 확인 → 없으면 503 (`API_KEY_MISSING`)
2. SearchAPI.io 호출:
   ```
   GET https://www.searchapi.io/api/v1/search
     ?engine=meta_ad_library
     &q={searchTerms}
     &country={country}
     &media_type={mediaType}
     &api_key={SEARCH_API_KEY}
   ```
3. 응답 가공: `SearchApiAdRaw` → `CompetitorAd` (신규 필드 포함)
4. 캐시 UPSERT: `competitor_ad_cache`에 결과 저장 (T4)
5. 클라이언트 필터 + 정렬 (기존 로직 유지)

**응답 (200) — 확장:**
```json
{
  "ads": [
    {
      "id": "12345678",
      "pageId": "111222333",
      "pageName": "올리브영",
      "body": "지금 이 가격, 놓치면 후회합니다",
      "title": "올리브영 세일",
      "caption": "https://oliveyoung.co.kr",
      "startDate": "2025-10-15",
      "endDate": null,
      "durationDays": 145,
      "isActive": true,
      "platforms": ["FACEBOOK", "INSTAGRAM"],
      "snapshotUrl": "https://www.facebook.com/ads/archive/render_ad/?id=12345678",
      "imageUrl": "https://scontent.xx.fbcdn.net/v/...",
      "videoUrl": null,
      "videoPreviewUrl": null,
      "displayFormat": "IMAGE",
      "linkUrl": "https://oliveyoung.co.kr/sale",
      "carouselCards": []
    }
  ],
  "totalCount": 42,
  "query": "올리브영",
  "searchedAt": "2026-03-08T12:00:00Z"
}
```

**에러 코드 확장:**

| 코드 | 상태 | 메시지 |
|------|------|--------|
| API_KEY_MISSING | 503 | SearchAPI.io API 키가 설정되지 않았습니다 |
| SEARCH_API_ERROR | 502 | 검색 API 호출 실패: {detail} |
| (기존) INVALID_QUERY | 400 | 검색어를 입력하세요 |
| (기존) RATE_LIMITED | 429 | 요청 한도 초과 |

### 2-2. 다운로드 API (T3 — 신규)

```
GET /api/competitor/download
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `ad_id` | string | Y | ad_archive_id |
| `type` | "image" \| "video" | Y | 다운로드 타입 |

**내부 동작:**

1. 인증 확인 (Supabase Auth)
2. `competitor_ad_cache`에서 `ad_archive_id`로 조회
3. URL 만료 확인 (`expires_at < now()` 이면):
   a. SearchAPI.io 재호출로 fresh URL 획득
   b. 캐시 업데이트
4. `type=image` → `image_url`로 fetch
5. `type=video` → `video_url`로 fetch
6. 서버사이드 프록시 스트림:
   ```
   Content-Type: image/jpeg | video/mp4
   Content-Disposition: attachment; filename="{page_name}_{ad_id}.{ext}"
   ```

**에러 응답:**

| 코드 | 상태 | 메시지 |
|------|------|--------|
| AD_NOT_FOUND | 404 | 광고를 찾을 수 없습니다 |
| URL_EXPIRED | 410 | 미디어 URL이 만료되었습니다. 다시 검색하세요 |
| DOWNLOAD_FAILED | 502 | 파일 다운로드에 실패했습니다 |
| UNAUTHORIZED | 401 | 로그인이 필요합니다 |

**파일:** `src/app/api/competitor/download/route.ts` (신규)

### 2-3. 기존 API 영향 분석

| API | 영향 | 대응 |
|-----|------|------|
| `GET /api/competitor/search` | 내부 구현 변경 (SearchAPI.io) | T1에서 수정 |
| `GET /api/competitor/pages` | Meta Graph API 유지 (page 검색용) | **변경 없음** |
| `GET/POST /api/competitor/monitors` | 변경 없음 | - |
| `DELETE /api/competitor/monitors/[id]` | 변경 없음 | - |
| `GET/PATCH .../alerts` | 변경 없음 | - |
| `GET /api/cron/competitor-check` | 검색 로직이 SearchAPI로 전환되므로 영향 | Cron도 `searchMetaAds()` 사용하므로 자동 전환 |
| `POST /api/competitor/insights` | 입력이 CompetitorAd[] → 신규 필드 무시 | **변경 없음** (기존 필드만 사용) |

---

## 3. 컴포넌트 구조

### 3-1. 수정/신규 컴포넌트

```
src/app/(main)/protractor/competitor/
  components/
    ad-card.tsx                ← 수정: iframe → img/video 미리보기
    ad-media-modal.tsx         ← 신규: 소재 확대 모달 (이미지/영상/캐러셀)
    filter-chips.tsx           ← 수정: 영상/이미지 미디어 타입 필터 추가
```

### 3-2. ad-card.tsx 수정 (T2, T5)

**Before (현재):**
```
+------------------------------------------+
| [iframe - ad_snapshot_url] ← 대부분 차단  |
|                                           |
| 브랜드명              FB IG 아이콘        |
| 광고 문구 (3줄 말줄임)                    |
| [=====운영기간 바=====] 142일             |
| [소재 보기 →]  [랜딩페이지 →]             |
+------------------------------------------+
```

**After (변경 후):**
```
+------------------------------------------+
| [실제 이미지 썸네일]     ← <img> 직접     |
|      또는                                 |
| [영상 프리뷰 + ▶ 아이콘] ← 클릭→모달     |
|      또는                                 |
| [캐러셀 첫 이미지 + "1/4" 뱃지]          |
|                                           |
| 브랜드명              FB IG 아이콘        |
| 광고 문구 (3줄 말줄임)                    |
| [=====운영기간 바=====] 142일             |
| [소재 보기]  [다운로드 ↓]  [랜딩페이지 →] |
+------------------------------------------+
```

**렌더링 로직:**

```typescript
// ad-card.tsx 미리보기 섹션 결정 로직
function MediaPreview({ ad }: { ad: CompetitorAd }) {
  // 1. 영상 광고
  if (ad.displayFormat === "VIDEO" && (ad.videoPreviewUrl || ad.imageUrl)) {
    return <VideoPreview src={ad.videoPreviewUrl ?? ad.imageUrl!} />;
  }
  // 2. 이미지 광고 (단일/캐러셀)
  if (ad.imageUrl) {
    return <ImagePreview src={ad.imageUrl} carouselCount={ad.carouselCards.length} />;
  }
  // 3. fallback: URL 없음
  return <EmptyPreview />;
}
```

### 3-3. ad-media-modal.tsx (T2, T5 — 신규)

```typescript
interface AdMediaModalProps {
  ad: CompetitorAd;
  isOpen: boolean;
  onClose: () => void;
}
```

**레이아웃:**
```
+--------------------------------------------------+
| ✕                                    [Meta에서 보기] |
|                                                    |
| [이미지: <img> 원본 사이즈]                        |
|   또는                                             |
| [영상: <video controls autoplay>]                  |
|   또는                                             |
| [캐러셀: ← 이미지 1/4 →]                          |
|                                                    |
| 브랜드명 · 게재중 · 142일                           |
| "광고 문구 전체 표시..."                            |
|                                                    |
| [📥 이미지 다운로드]  또는  [📥 영상 다운로드]      |
+--------------------------------------------------+
```

**기능:**
- ESC 또는 배경 클릭 → 닫기
- 이미지: `<img>` 태그로 `imageUrl` 원본 표시
- 영상: `<video>` 태그로 `videoUrl` 인라인 재생 (controls, autoplay)
- 캐러셀: 좌/우 네비게이션으로 카드 순회
- "다운로드" 버튼: `/api/competitor/download?ad_id={id}&type={image|video}` 호출
- "Meta에서 보기": `snapshotUrl` 외부 링크 (보조)

### 3-4. filter-chips.tsx 수정 (T2)

기존 필터에 미디어 타입 필터 추가:

```typescript
// 기존
interface FilterState {
  activeOnly: boolean;
  minDays: number;
  platform: string | null;
}

// 변경 후
interface FilterState {
  activeOnly: boolean;
  minDays: number;
  platform: string | null;
  mediaType: "all" | "image" | "video";  // 신규
}
```

칩 목록 변경:
```
기존: 30일+ | 게재중 | Facebook | Instagram
변경: 30일+ | 게재중 | Facebook | Instagram | 이미지 | 영상
```

### 3-5. 상태 관리 (competitor-dashboard.tsx)

기존 상태에 모달 관련 상태 추가:

```typescript
// 추가 상태
const [selectedAd, setSelectedAd] = useState<CompetitorAd | null>(null);
const [isModalOpen, setIsModalOpen] = useState(false);

// 핸들러
const handleAdClick = (ad: CompetitorAd) => {
  setSelectedAd(ad);
  setIsModalOpen(true);
};

const handleDownload = async (ad: CompetitorAd, type: "image" | "video") => {
  window.open(`/api/competitor/download?ad_id=${ad.id}&type=${type}`, "_blank");
};
```

---

## 4. 에러 처리

### 4-1. API 에러

| 상황 | HTTP | 에러 코드 | 사용자 메시지 |
|------|------|-----------|---------------|
| SEARCH_API_KEY 미설정 | 503 | API_KEY_MISSING | "검색 API 연동이 준비되지 않았습니다. 관리자에게 문의하세요." |
| SearchAPI.io 호출 실패 | 502 | SEARCH_API_ERROR | "광고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요." |
| 다운로드 대상 없음 | 404 | AD_NOT_FOUND | "광고를 찾을 수 없습니다" |
| 미디어 URL 만료 + 재호출 실패 | 410 | URL_EXPIRED | "미디어 URL이 만료되었습니다. 다시 검색해 주세요." |
| fbcdn 다운로드 실패 | 502 | DOWNLOAD_FAILED | "파일을 다운로드할 수 없습니다. 잠시 후 다시 시도하세요." |
| 인증 실패 | 401 | UNAUTHORIZED | "로그인이 필요합니다" |

### 4-2. UI 에러 표시

- 검색 실패: `AlertTriangle` 인라인 에러 (기존 패턴)
- 다운로드 실패: `toast.error()` (sonner)
- 이미지 로드 실패: `<img>` onError → fallback 아이콘 ("소재를 불러올 수 없습니다")
- 영상 재생 실패: `<video>` onError → fallback 메시지 + "Meta에서 보기" 링크

### 4-3. 미디어 URL 방어적 파싱

SearchAPI.io 응답의 미디어 필드는 optional이므로 방어적 추출:

```typescript
function extractMediaUrls(snapshot?: SearchApiSnapshot) {
  const imageUrl = snapshot?.images?.[0]?.original_image_url
    ?? snapshot?.cards?.[0]?.original_image_url
    ?? null;

  const videoUrl = snapshot?.videos?.[0]?.video_hd_url
    ?? snapshot?.videos?.[0]?.video_sd_url
    ?? null;

  const videoPreviewUrl = snapshot?.videos?.[0]?.video_preview_image_url
    ?? null;

  const displayFormat = detectDisplayFormat(snapshot);

  return { imageUrl, videoUrl, videoPreviewUrl, displayFormat };
}

function detectDisplayFormat(snapshot?: SearchApiSnapshot): DisplayFormat {
  const fmt = snapshot?.display_format?.toUpperCase();
  if (fmt === "VIDEO" || (snapshot?.videos?.length ?? 0) > 0) return "VIDEO";
  if (fmt === "CAROUSEL" || fmt === "DCO" || fmt === "MULTI_IMAGES") return "CAROUSEL";
  if (fmt === "IMAGE" || (snapshot?.images?.length ?? 0) > 0) return "IMAGE";
  return "UNKNOWN";
}
```

### 4-4. URL 만료 시점 추출

영상 URL의 `oe` 파라미터(hex timestamp)에서 만료 시점 계산:

```typescript
function extractExpiresAt(url: string | null): Date | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const oe = u.searchParams.get("oe");
    if (!oe) return null;
    const timestamp = parseInt(oe, 16);
    if (isNaN(timestamp)) return null;
    return new Date(timestamp * 1000);
  } catch {
    return null;
  }
}
```

---

## 5. 구현 순서 (체크리스트)

### Phase 1-A: T1 — SearchAPI.io 전환 (backend-dev)

- [ ] `src/types/competitor.ts` — `SearchApiAdRaw`, `SearchApiSnapshot`, `DisplayFormat`, `CarouselCard` 타입 추가
- [ ] `src/types/competitor.ts` — `CompetitorAd`에 `imageUrl`, `videoUrl`, `videoPreviewUrl`, `displayFormat`, `linkUrl`, `carouselCards` 추가
- [ ] `src/types/competitor.ts` — `CompetitorAdCacheRow` 타입 추가
- [ ] `src/types/competitor.ts` — `CompetitorErrorCode`에 `API_KEY_MISSING`, `SEARCH_API_ERROR`, `AD_NOT_FOUND`, `URL_EXPIRED`, `DOWNLOAD_FAILED` 추가
- [ ] `src/lib/competitor/meta-ad-library.ts` — `META_API_BASE` → SearchAPI.io 엔드포인트 전환
- [ ] `src/lib/competitor/meta-ad-library.ts` — `SearchApiAdRaw` → `CompetitorAd` 변환 함수 (`transformSearchApiAd`)
- [ ] `src/lib/competitor/meta-ad-library.ts` — `extractMediaUrls()`, `extractExpiresAt()` 유틸
- [ ] `src/lib/competitor/meta-ad-library.ts` — 환경변수 `SEARCH_API_KEY` 참조, 에러 코드 `API_KEY_MISSING`
- [ ] `src/app/api/competitor/search/route.ts` — 캐시 UPSERT 호출 추가

### Phase 1-B: T4 — 캐싱 테이블 (backend-dev, T1과 병렬)

- [ ] `supabase/migrations/YYYYMMDD_competitor_ad_cache.sql` — 테이블 + RLS + 트리거
- [ ] `src/lib/competitor/ad-cache.ts` (신규) — `upsertAdCache()`, `getAdFromCache()`, `isUrlExpired()` 함수

### Phase 2-A: T2 — 소재 미리보기 UI (frontend-dev, T1 완료 후)

- [ ] `src/app/(main)/protractor/competitor/components/ad-card.tsx` — iframe → `MediaPreview` 컴포넌트
- [ ] `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` (신규) — 소재 확대 모달
- [ ] `src/app/(main)/protractor/competitor/components/filter-chips.tsx` — `mediaType` 필터 추가
- [ ] `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — `selectedAd`/`isModalOpen` 상태 + 핸들러

### Phase 2-B: T3 — 다운로드 API (backend-dev, T1+T4 완료 후)

- [ ] `src/app/api/competitor/download/route.ts` (신규) — 서버 프록시 스트림 다운로드
- [ ] 다운로드 시 캐시 조회 → 만료 확인 → 재호출 로직

### Phase 3: T5 — 외부 링크 교체 (frontend-dev, T2 완료 후)

- [ ] `ad-card.tsx` — "소재 보기" 링크 → `onClick` 모달 오픈
- [ ] `ad-card.tsx` — "다운로드" 버튼 추가
- [ ] `ad-media-modal.tsx` — "Meta에서 보기" 보조 외부 링크 + "다운로드" 버튼

### Phase 4: 통합 + QA

- [ ] `tsc --noEmit` 에러 0개
- [ ] `next lint` 에러 0개
- [ ] `npm run build` 성공
- [ ] 기존 모니터링/Cron 기능 정상 동작 확인
- [ ] 이미지 광고 검색 → 썸네일 표시 → 모달 → 다운로드 E2E
- [ ] 영상 광고 검색 → 프리뷰 → 모달 재생 → 다운로드 E2E
- [ ] URL 없는 광고 → fallback 표시 확인
- [ ] 반응형 검증 (Desktop 1920px + Mobile 375px)

---

## 6. 디자인 가이드

### 미리보기 썸네일 스타일

```
카드 썸네일 영역:
- 크기: w-full h-48 (기존 iframe과 동일)
- 이미지: object-cover rounded-t-xl
- 영상 프리뷰: 위와 동일 + 재생 아이콘 오버레이
- 재생 아이콘: absolute center, bg-black/50 rounded-full w-12 h-12, Play 아이콘 white
- 캐러셀 뱃지: absolute top-2 right-2, bg-black/60 text-white text-xs px-2 py-0.5 rounded-full
- fallback: bg-gray-50 flex items-center justify-center text-gray-400
```

### 모달 스타일

```
모달:
- Overlay: fixed inset-0 bg-black/60 z-50
- Container: max-w-3xl mx-auto my-8 bg-white rounded-2xl overflow-hidden
- 이미지: max-h-[70vh] object-contain mx-auto
- 영상: max-h-[70vh] w-full
- 닫기 버튼: absolute top-4 right-4, X 아이콘
- 하단 정보: p-5 border-t
- 다운로드 버튼: bg-[#F75D5D] hover:bg-[#E54949] text-white px-4 py-2 rounded-lg
```

### 다운로드 버튼 (카드 내)

```
- Download 아이콘 (lucide) + "다운로드"
- 스타일: text-xs font-medium text-[#F75D5D] bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5
- 영상 다운로드 시: 로딩 스피너 표시 (파일 크기가 클 수 있음)
```

---

## 7. 환경변수

| 변수 | 용도 | 필수 | 빌드 시 | 기본값 |
|------|------|------|---------|--------|
| `SEARCH_API_KEY` | SearchAPI.io API 키 | Y (런타임) | 불필요 | - |
| `META_AD_LIBRARY_TOKEN` | 기존 Meta API | N | 불필요 | - (pages API fallback) |

**빌드 안전성:** `SEARCH_API_KEY`는 `process.env`에서 런타임 참조만. 빌드 타임 검사 없음.

---

## 8. 파일 경계 (팀원별)

| 팀원 | 파일 | Phase |
|------|------|-------|
| **backend-dev** | `src/types/competitor.ts` | 1-A |
| **backend-dev** | `src/lib/competitor/meta-ad-library.ts` | 1-A |
| **backend-dev** | `src/lib/competitor/ad-cache.ts` (신규) | 1-B |
| **backend-dev** | `src/app/api/competitor/search/route.ts` | 1-A |
| **backend-dev** | `src/app/api/competitor/download/route.ts` (신규) | 2-B |
| **backend-dev** | `supabase/migrations/` | 1-B |
| **frontend-dev** | `src/app/(main)/protractor/competitor/components/ad-card.tsx` | 2-A, 3 |
| **frontend-dev** | `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` (신규) | 2-A, 3 |
| **frontend-dev** | `src/app/(main)/protractor/competitor/components/filter-chips.tsx` | 2-A |
| **frontend-dev** | `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | 2-A |

**순서:** backend-dev가 Phase 1 (T1+T4) 완료 → frontend-dev Phase 2-A (T2) + backend-dev Phase 2-B (T3) 병렬 → frontend-dev Phase 3 (T5)
