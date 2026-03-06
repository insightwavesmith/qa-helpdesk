# 경쟁사 분석기 설계서

> 목업: https://mozzi-reports.vercel.app/reports/mockup/2026-03-06-competitor-analyzer-v2.html
> 작성일: 2026-03-06

---

## 1. 데이터 모델

### 1-1. Meta Ad Library API 응답 (외부)

Meta Ad Library API v19.0 응답을 내부 타입으로 매핑:

```typescript
// src/types/competitor.ts (신규)

/** Meta Ad Library API raw 응답 항목 */
interface MetaAdRaw {
  id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time: string;        // ISO 날짜
  ad_delivery_stop_time?: string;        // null = 현재 게재중
  publisher_platforms?: string[];        // ["facebook","instagram","messenger"]
  ad_snapshot_url: string;
}

/** 가공된 광고 카드 데이터 */
export interface CompetitorAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;                          // ad_creative_bodies[0] ?? ""
  title: string;                         // ad_creative_link_titles[0] ?? ""
  caption: string;                       // ad_creative_link_captions[0] ?? ""
  startDate: string;                     // ISO
  endDate: string | null;                // null = 게재중
  durationDays: number;                  // 운영기간 (일)
  isActive: boolean;                     // endDate === null
  platforms: string[];                   // ["facebook","instagram"]
  snapshotUrl: string;                   // ad_snapshot_url
}

/** 검색 응답 */
export interface CompetitorSearchResponse {
  ads: CompetitorAd[];
  totalCount: number;
  query: string;
  searchedAt: string;
}
```

### 1-2. DB 테이블 (신규)

#### `competitor_monitors`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` (PK, default gen_random_uuid()) | |
| `user_id` | `uuid` (FK -> auth.users) | 등록한 사용자 |
| `brand_name` | `text` NOT NULL | 브랜드명 (검색어) |
| `page_id` | `text` | Meta 페이지 ID (첫 검색 시 자동 설정) |
| `last_checked_at` | `timestamptz` | 마지막 체크 시간 |
| `last_ad_count` | `integer` DEFAULT 0 | 마지막 체크 시 광고 수 |
| `created_at` | `timestamptz` DEFAULT now() | |

**RLS 정책:**
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

**인덱스:** `idx_competitor_monitors_user_id ON competitor_monitors(user_id)`

#### `competitor_alerts`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` (PK, default gen_random_uuid()) | |
| `monitor_id` | `uuid` (FK -> competitor_monitors.id ON DELETE CASCADE) | |
| `new_ad_ids` | `jsonb` NOT NULL | 신규 감지된 광고 ID 배열 |
| `detected_at` | `timestamptz` DEFAULT now() | |
| `is_read` | `boolean` DEFAULT false | |

**RLS 정책:** monitor_id JOIN으로 user_id 확인
- SELECT: `EXISTS (SELECT 1 FROM competitor_monitors m WHERE m.id = monitor_id AND m.user_id = auth.uid())`

#### `competitor_insight_cache`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` (PK, default gen_random_uuid()) | |
| `search_query` | `text` NOT NULL | 검색어 (lowercase) |
| `insight_data` | `jsonb` NOT NULL | AI 분석 결과 |
| `ad_count` | `integer` | 분석 대상 광고 수 |
| `created_at` | `timestamptz` DEFAULT now() | |
| `expires_at` | `timestamptz` | created_at + 24h |

**인덱스:** `idx_insight_cache_query ON competitor_insight_cache(search_query)`
**RLS:** 서비스 클라이언트로만 접근 (사용자 RLS 불필요)

### 1-3. 타입 정의

```typescript
// src/types/competitor.ts (계속)

/** 모니터링 브랜드 */
export interface CompetitorMonitor {
  id: string;
  brandName: string;
  pageId: string | null;
  lastCheckedAt: string | null;
  lastAdCount: number;
  createdAt: string;
  unreadAlertCount?: number;  // JOIN으로 계산
}

/** AI 인사이트 결과 */
export interface CompetitorInsight {
  longRunningAdCount: number;        // 30일+ 광고 수
  totalAdCount: number;
  videoRatio: number;                // 영상 비율 (0~1)
  imageRatio: number;                // 이미지 비율 (0~1)
  platformDistribution: {
    facebook: number;
    instagram: number;
    messenger: number;
  };
  hookTypes: {
    type: string;                    // "할인형" | "후기형" | "성분형" | "감성형" | "기타"
    count: number;
    percentage: number;
    examples: string[];              // 대표 광고 문구 1~2개
  }[];
  seasonPattern: {
    month: number;
    adCount: number;
  }[];
  keyProducts: string[];             // 핵심 제품/프로모션
  summary: string;                   // AI 텍스트 인사이트 요약 (한국어)
  analyzedAt: string;
}
```

---

## 2. API 설계

### 2-1. 광고 검색 API (T1)

```
GET /api/competitor/search
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `q` | string | Y | 검색어 (브랜드명/키워드) |
| `country` | string | N | 국가 코드 (default: "KR") |
| `active_only` | boolean | N | 게재중 광고만 (default: false) |
| `min_days` | number | N | 최소 운영일수 필터 (default: 0) |
| `platform` | string | N | "facebook" / "instagram" (default: 전체) |
| `limit` | number | N | 결과 수 (default: 50, max: 100) |

**내부 동작:**
1. `META_AD_LIBRARY_TOKEN` 환경변수 확인 -> 없으면 `{ error: "META_AD_LIBRARY_TOKEN이 설정되지 않았습니다", code: "TOKEN_MISSING" }` 반환 (503)
2. Meta API 호출: `GET https://graph.facebook.com/v19.0/ads_archive`
   - `access_token`: `process.env.META_AD_LIBRARY_TOKEN`
   - `search_terms`: q
   - `ad_reached_countries`: `["KR"]` (country 파라미터 기반)
   - `ad_type`: `POLITICAL_AND_ISSUE_ADS` -> 아니고 `ALL` (일반 광고)
   - `fields`: `id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,ad_snapshot_url`
   - `limit`: 파라미터값
3. 응답 가공:
   - `durationDays` = `(endDate ?? today) - startDate` (일수)
   - `isActive` = `endDate === null`
   - 클라이언트 필터: `active_only`, `min_days`, `platform`
   - 정렬: `durationDays` DESC (운영기간 긴 순)

**응답 (200):**
```json
{
  "ads": [CompetitorAd],
  "totalCount": 42,
  "query": "올리브영",
  "searchedAt": "2026-03-06T12:00:00Z"
}
```

**에러 응답:**
| 코드 | 상태 | 메시지 |
|------|------|--------|
| TOKEN_MISSING | 503 | META_AD_LIBRARY_TOKEN이 설정되지 않았습니다 |
| INVALID_QUERY | 400 | 검색어를 입력하세요 |
| META_API_ERROR | 502 | Meta API 호출 실패: {detail} |
| RATE_LIMITED | 429 | 요청 한도 초과. 잠시 후 다시 시도하세요 |

**파일:** `src/app/api/competitor/search/route.ts` (신규)

### 2-2. 모니터링 API (T2)

#### 모니터링 목록 조회
```
GET /api/competitor/monitors
```
**인증:** 필수 (Supabase Auth)
**응답:** `{ monitors: CompetitorMonitor[] }`

#### 모니터링 등록
```
POST /api/competitor/monitors
```
**Body:** `{ brandName: string, pageId?: string }`
**제한:** 사용자당 최대 10개
**응답:** `{ monitor: CompetitorMonitor }` (201)

#### 모니터링 삭제
```
DELETE /api/competitor/monitors/[id]
```
**인증:** 본인 소유 확인
**응답:** `{ success: true }` (200)

#### 알림 읽음 처리
```
PATCH /api/competitor/monitors/[id]/alerts
```
**Body:** `{ alertIds: string[] }`
**응답:** `{ success: true }`

**파일:**
- `src/app/api/competitor/monitors/route.ts` (GET, POST)
- `src/app/api/competitor/monitors/[id]/route.ts` (DELETE)
- `src/app/api/competitor/monitors/[id]/alerts/route.ts` (PATCH)

### 2-3. Cron - 신규 광고 체크 (T2)

```
GET /api/cron/competitor-check
```
**인증:** `CRON_SECRET` 헤더 또는 Vercel Cron
**스케줄:** 매일 09:00, 21:00 KST (1일 2회)

**내부 동작:**
1. `competitor_monitors` 전체 조회 (서비스 클라이언트)
2. 브랜드별 Meta Ad Library API 호출 (rate limit 고려: 브랜드당 1 call)
3. `last_ad_count` 대비 새 광고 감지 -> `competitor_alerts` INSERT
4. `last_checked_at`, `last_ad_count` 업데이트

**Rate limit 전략:**
- 200 calls/hour 제한 -> Cron 1회당 최대 100 브랜드 처리
- 100개 초과 시 다음 Cron에서 이어서 처리 (last_checked_at ASC 순)

**파일:** `src/app/api/cron/competitor-check/route.ts` (신규)

### 2-4. AI 인사이트 API (T3)

```
POST /api/competitor/insights
```
**Body:**
```json
{
  "query": "올리브영",
  "ads": [CompetitorAd]   // 검색 결과 광고 목록 (최대 50개)
}
```

**내부 동작:**
1. 캐시 확인: `competitor_insight_cache` WHERE `search_query = lower(query)` AND `expires_at > now()`
2. 캐시 있으면 -> 즉시 반환
3. 캐시 없으면 -> AI 분석:
   - ai-proxy 경유 (AI_PROXY_URL 환경변수)
   - 실패 시 Anthropic API 직접 호출 (기존 t3-curation-proxy 패턴 재사용)
   - 모델: `claude-sonnet-4-20250514`
   - 프롬프트: 광고 데이터 JSON -> 분석 항목 6종 추출
4. 결과 `competitor_insight_cache`에 저장 (24h TTL)

**응답 (200):**
```json
{
  "insight": CompetitorInsight,
  "cached": true | false
}
```

**파일:** `src/app/api/competitor/insights/route.ts` (신규)

---

## 3. 컴포넌트 구조

### 3-1. 라우팅

```
src/app/(main)/protractor/
  competitor/
    page.tsx                    <- 경쟁사 분석 메인 (서버 컴포넌트, 인증 체크)
    competitor-dashboard.tsx     <- 클라이언트 컴포넌트 (검색+결과+모니터링+인사이트)
    components/
      search-bar.tsx            <- 검색바 + 필터칩
      ad-card.tsx               <- 개별 광고 카드
      ad-card-list.tsx          <- 광고 카드 리스트 (정렬/필터 상태)
      duration-bar.tsx          <- 운영기간 시각화 바
      filter-chips.tsx          <- 필터 칩 UI (한국/30일+/게재중/FB/IG/영상/이미지)
      monitor-panel.tsx         <- 모니터링 패널 (브랜드 등록/목록)
      monitor-brand-card.tsx    <- 개별 모니터링 브랜드 카드
      add-monitor-dialog.tsx    <- 브랜드 등록 다이얼로그
      insight-section.tsx       <- AI 인사이트 섹션
      insight-stat-card.tsx     <- 통계 카드 (4개)
      hook-type-chart.tsx       <- 훅 유형 분포 차트
      season-chart.tsx          <- 월별 시즌 패턴 차트
```

### 3-2. 탭 네비게이션 통합

현재 `real-dashboard.tsx`의 탭 구조:
```
성과 요약 | 콘텐츠
```

변경 후:
```
성과 요약 | 콘텐츠 | 경쟁사 분석
```

**방식 A (별도 페이지 - 권장):**
- `/protractor` -> 기존 대시보드 (성과 요약 / 콘텐츠)
- `/protractor/competitor` -> 경쟁사 분석 전용 페이지
- 탭 네비게이션을 `layout.tsx` 레벨로 올려서 페이지 간 전환
- 장점: 경쟁사 분석은 광고계정 선택/기간 의존 없이 독립 동작

**구현:**
1. `layout.tsx`에 탭 네비게이션 추가 (Link 기반, active 상태 URL 매칭)
2. `real-dashboard.tsx`의 기존 Tabs는 layout 탭 아래의 서브 탭으로 유지
3. 경쟁사 분석 페이지는 계정 선택 불필요 (Meta Ad Library는 퍼블릭 데이터)

### 3-3. 주요 컴포넌트 상세

#### `competitor-dashboard.tsx` (메인 클라이언트 컴포넌트)

```typescript
"use client";

// 상태:
// - searchQuery: string
// - ads: CompetitorAd[]
// - filters: { activeOnly, minDays, platform }
// - monitors: CompetitorMonitor[]
// - insight: CompetitorInsight | null
// - loading: { search, monitors, insight }
// - error: string | null

// 레이아웃:
// +-----------------------------------------+
// | SearchBar + FilterChips                  |
// +-----------------------------------------+
// | MonitorPanel (접이식)      | AdCardList  |
// | - 등록된 브랜드 카드들     | - 광고 카드  |
// | - + 브랜드 추가 버튼       | - 정렬/필터  |
// +-----------------------------------------+
// | InsightSection (검색 결과 하단)          |
// | - 통계 카드 4개                          |
// | - 텍스트 인사이트                        |
// +-----------------------------------------+
```

#### `ad-card.tsx`

```
+------------------------------------------+
| [소재 썸네일 - ad_snapshot_url iframe]    |
|                                           |
| 브랜드명 (page_name)        FB IG 아이콘  |
| 광고 문구 (body, 3줄 말줄임)              |
|                                           |
| [=======운영기간 바=========] 142일       |
| 2025.10.15 ~ 게재중                       |
|                                           |
| [랜딩페이지]  [소재 보기]                  |
+------------------------------------------+
```

#### `search-bar.tsx`
- 입력: 브랜드명/키워드
- Enter 또는 검색 버튼 클릭으로 검색
- 디바운스 없음 (명시적 검색 트리거)
- 검색 히스토리: localStorage에 최근 5개 저장

#### `filter-chips.tsx`
- 칩 목록: 한국 | 30일+ | 게재중 | Facebook | Instagram | 영상 | 이미지
- 토글 방식 (다중 선택 가능)
- 클라이언트 필터링 (API 재호출 없음, 이미 받은 데이터에서 필터)

#### `monitor-panel.tsx`
- 접이식 사이드 패널 (모바일: 하단 시트)
- 등록된 브랜드 카드 목록 + 신규 감지 뱃지
- "브랜드 추가" 버튼 -> AddMonitorDialog
- 브랜드 클릭 시 해당 브랜드로 검색 자동 실행

#### `insight-section.tsx`
- 검색 결과가 있을 때만 표시
- "AI 분석" 버튼 클릭 -> API 호출 (자동 분석 아님, 사용자 트리거)
- 통계 카드 4개: 장기광고 비율 / 영상 비율 / 주력 훅 유형 / 월평균 광고 수
- 텍스트 인사이트: AI 생성 요약

### 3-4. 반응형 레이아웃

| 뷰포트 | 레이아웃 |
|---------|----------|
| Desktop (>=1024px) | 2컬럼: 좌측 모니터링 패널(280px) + 우측 검색결과/인사이트 |
| Tablet (768~1023px) | 1컬럼: 모니터링 접이식 + 검색결과 풀와이드 |
| Mobile (<768px) | 1컬럼: 모니터링 하단시트 + 카드 1열 |

---

## 4. 에러 처리

### 4-1. API 에러

| 상황 | HTTP | 에러 코드 | 사용자 메시지 |
|------|------|-----------|---------------|
| META_AD_LIBRARY_TOKEN 미설정 | 503 | TOKEN_MISSING | "Meta Ad Library 연동이 준비되지 않았습니다. 관리자에게 문의하세요." |
| 검색어 빈 값 | 400 | INVALID_QUERY | "검색어를 입력하세요" |
| Meta API 호출 실패 | 502 | META_API_ERROR | "광고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요." |
| Meta API Rate Limit | 429 | RATE_LIMITED | "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." |
| 모니터링 등록 한도 초과 | 400 | MONITOR_LIMIT | "모니터링은 최대 10개까지 등록할 수 있습니다." |
| 인증 실패 | 401 | UNAUTHORIZED | "로그인이 필요합니다" |
| AI 분석 실패 | 500 | INSIGHT_ERROR | "AI 분석에 실패했습니다. 다시 시도하세요." |

### 4-2. UI 에러 표시

- 토스트: sonner 사용 (기존 패턴)
- 인라인 에러: AlertTriangle 아이콘 + 빨간 배경 (기존 real-dashboard.tsx 패턴)
- 빈 상태: 검색 결과 없음 / 모니터링 없음 각각 전용 빈 상태 UI

---

## 5. 구현 순서 (체크리스트)

### Phase 1: T1 - 광고 검색 (의존성 없음)

- [ ] `src/types/competitor.ts` — 타입 정의
- [ ] `src/lib/competitor/meta-ad-library.ts` — Meta API 클라이언트 (토큰 optional, 빌드 안전)
- [ ] `src/app/api/competitor/search/route.ts` — 검색 API Route
- [ ] `src/app/(main)/protractor/layout.tsx` — 탭 네비게이션 추가 (대시보드/경쟁사분석)
- [ ] `src/app/(main)/protractor/competitor/page.tsx` — 경쟁사 분석 페이지
- [ ] `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 메인 클라이언트 컴포넌트
- [ ] `src/app/(main)/protractor/competitor/components/search-bar.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/ad-card.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/ad-card-list.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/duration-bar.tsx`

### Phase 2-A: T2 - 모니터링 (T1 완료 후)

- [ ] DB 마이그레이션: `competitor_monitors`, `competitor_alerts` 테이블 + RLS
- [ ] `src/app/api/competitor/monitors/route.ts` — GET, POST
- [ ] `src/app/api/competitor/monitors/[id]/route.ts` — DELETE
- [ ] `src/app/api/competitor/monitors/[id]/alerts/route.ts` — PATCH
- [ ] `src/app/api/cron/competitor-check/route.ts` — Cron
- [ ] `src/app/(main)/protractor/competitor/components/monitor-panel.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx`

### Phase 2-B: T3 - AI 인사이트 (T1 완료 후, T2와 병렬)

- [ ] DB 마이그레이션: `competitor_insight_cache` 테이블
- [ ] `src/lib/competitor/analyze-ads.ts` — AI 분석 로직 (프롬프트 + ai-proxy 패턴)
- [ ] `src/app/api/competitor/insights/route.ts` — AI 인사이트 API
- [ ] `src/app/(main)/protractor/competitor/components/insight-section.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/insight-stat-card.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/hook-type-chart.tsx`
- [ ] `src/app/(main)/protractor/competitor/components/season-chart.tsx`

### Phase 3: 통합 + QA

- [ ] competitor-dashboard.tsx에 T2 + T3 통합
- [ ] 반응형 레이아웃 검증 (Desktop + Mobile)
- [ ] META_AD_LIBRARY_TOKEN 없이 빌드 성공 확인
- [ ] tsc + lint + build 통과

---

## 6. 디자인 시스템 (bscamp)

| 항목 | 값 |
|------|-----|
| Primary | `#F75D5D` |
| Primary Hover | `#E54949` |
| BG | `#f8f9fc` |
| Card | `#fff`, border `#e2e8f0`, radius `0.75rem` |
| Text | `#1a1a1a` |
| Muted | `#64748b` |
| Font | Pretendard |
| Sidebar Active | `bg-#fee2e2 text-#F75D5D` |
| 모드 | 라이트모드만 |

### 광고 카드 스타일

- 카드: `bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition`
- 운영기간 바: 배경 `#e2e8f0`, 채움 `#F75D5D` (30일 미만 `#64748b`)
- 게재중 뱃지: `bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full`
- 플랫폼 아이콘: Facebook(파랑), Instagram(보라) — 16x16 SVG

### 인사이트 통계 카드 스타일

- 카드: `bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-5`
- 숫자: `text-2xl font-bold text-gray-900`
- 라벨: `text-sm text-gray-500`

---

## 7. 환경변수

| 변수 | 용도 | 필수 | 기본값 |
|------|------|------|--------|
| `META_AD_LIBRARY_TOKEN` | Meta Ad Library API 액세스 토큰 | N (없으면 503) | - |
| `AI_PROXY_URL` | AI 프록시 URL (T3 인사이트) | N (없으면 Anthropic 직접) | - |
| `CRON_SECRET` | Cron 엔드포인트 인증 | T2 사용 시 Y | - |

**빌드 안전성:**
- 모든 환경변수는 런타임에서만 참조 (`process.env.META_AD_LIBRARY_TOKEN`)
- 빌드 타임에 존재 여부 검사하지 않음
- API Route 호출 시 없으면 명확한 에러 메시지 반환
