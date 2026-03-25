# Instagram Graph API 연동 기술 조사

> 조사일: 2026-03-25
> 작성자: 에이전트팀
> 목적: bscamp Phase 3 Instagram 콘텐츠 발행/인사이트 연동 사전 조사
> 참고: 웹 검색 도구 사용 불가로 학습 데이터(~2025.05) + 프로젝트 기존 코드 기반 작성. 구현 전 공식 문서에서 최신 변경사항 반드시 재확인 필요.

---

## 1. 콘텐츠 발행 API (Content Publishing API)

### 공식 문서
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing

### 1.1 단일 이미지 게시 (2단계 프로세스)

Instagram Graph API의 콘텐츠 발행은 **2단계(컨테이너 생성 → 발행)** 구조이다.

**Step 1: 미디어 컨테이너 생성**
```
POST /{ig-user-id}/media
```
| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `image_url` | O | 공개 접근 가능한 이미지 URL |
| `caption` | X | 캡션 텍스트 (해시태그 포함 가능) |
| `location_id` | X | Facebook 위치 ID |
| `user_tags` | X | 이미지 내 사용자 태그 (JSON 배열) |
| `access_token` | O | 사용자 액세스 토큰 |

응답: `{ "id": "{creation-id}" }`

**Step 2: 미디어 발행**
```
POST /{ig-user-id}/media_publish
```
| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `creation_id` | O | Step 1에서 받은 컨테이너 ID |
| `access_token` | O | 사용자 액세스 토큰 |

응답: `{ "id": "{ig-media-id}" }`

### 1.2 캐러셀(여러 이미지) 게시 (3단계 프로세스)

**Step 1: 각 아이템의 컨테이너 생성 (2~10개)**
```
POST /{ig-user-id}/media
```
| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `image_url` | O (이미지) | 공개 URL |
| `video_url` | O (영상) | 공개 URL |
| `is_carousel_item` | O | `true` 설정 필수 |

- 각 아이템별로 호출하여 `creation_id` 수집
- 캐러셀 아이템에는 `caption` 설정 불가 (캐러셀 전체에만 설정)

**Step 2: 캐러셀 컨테이너 생성**
```
POST /{ig-user-id}/media
```
| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `media_type` | O | `CAROUSEL` |
| `children` | O | Step 1의 creation_id 배열 (쉼표 구분) |
| `caption` | X | 캐러셀 전체 캡션 |
| `location_id` | X | 위치 태그 |

**Step 3: 캐러셀 발행**
```
POST /{ig-user-id}/media_publish
```
- `creation_id`: Step 2에서 받은 캐러셀 컨테이너 ID

### 1.3 Reels 게시

Reels 발행도 동일한 2단계 프로세스를 따른다.

**Step 1: Reels 컨테이너 생성**
```
POST /{ig-user-id}/media
```
| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `media_type` | O | `REELS` |
| `video_url` | O | 공개 접근 가능한 동영상 URL |
| `caption` | X | 캡션 |
| `share_to_feed` | X | 피드에도 공유 여부 (기본 `true`) |
| `cover_url` | X | 커버 이미지 URL |
| `thumb_offset` | X | 커버 썸네일 오프셋 (밀리초) |
| `audio_name` | X | 오디오 이름 |

**Reels 동영상 요구사항:**
- 길이: 3초 ~ 15분 (일부 제한 90초)
- 해상도: 최소 720p 권장
- 비율: 9:16 권장 (세로형)
- 형식: MP4, MOV
- 크기: 최대 1GB

### 1.4 이미지 요구사항

| 항목 | 제한 |
|------|------|
| **URL** | 공개 접근 가능한 HTTPS URL 필수 (인증 필요한 URL 불가) |
| **형식** | JPEG, PNG (BMP, TIFF 등은 불가) |
| **최대 크기** | 8MB |
| **최소 해상도** | 150 x 150 px |
| **최대 해상도** | 제한 없으나 1936 x 1936 px 이내 권장 |
| **비율** | 4:5 ~ 1.91:1 (정사각형 1:1 권장) |
| **GIF** | 지원하지 않음 |

> **bscamp 관련**: Supabase Storage의 이미지는 signed URL (만료 시간 있음)이므로, 발행 시 GCS public bucket 또는 Supabase Storage의 public bucket 활용 필요. 현재 프로젝트에서 `knowledge_chunks` 등의 이미지는 signed URL 패턴을 사용하고 있어 별도 public 경로 설계 필요.

### 1.5 캡션, 해시태그, 위치 태그

**캡션:**
- 최대 2,200자
- 줄바꿈(`\n`) 지원
- 멘션(`@username`) 지원
- 이모지 지원

**해시태그:**
- 캡션 본문에 `#태그` 형태로 포함
- **게시물당 최대 30개** (초과 시 게시 실패)
- 관련성 높은 태그 5~10개 권장 (알고리즘 최적화)

**위치 태그:**
- Facebook Pages Search API로 `location_id` 조회 후 사용
- `GET /search?type=place&q={검색어}&fields=id,name,location`

---

## 2. Instagram Insights API

### 공식 문서
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/insights

### 2.1 게시물별 인사이트 (Media Insights)

```
GET /{ig-media-id}/insights?metric={metrics}
```

**이미지/캐러셀 게시물 지표:**

| 지표 | 설명 |
|------|------|
| `impressions` | 미디어 노출 횟수 |
| `reach` | 고유 계정 도달 수 |
| `engagement` | 좋아요 + 댓글 수 (deprecated 주의, 2024년 이후 변경 가능) |
| `saved` | 저장 횟수 |
| `likes` | 좋아요 수 (v18.0+) |
| `comments` | 댓글 수 (v18.0+) |
| `shares` | 공유 횟수 (v18.0+) |
| `total_interactions` | 전체 상호작용 수 (v18.0+) |
| `follows` | 게시물을 통해 팔로우한 수 (v18.0+) |
| `profile_visits` | 게시물에서 프로필 방문 수 (v18.0+) |

**Reels 전용 지표:**

| 지표 | 설명 |
|------|------|
| `plays` | 재생 횟수 |
| `total_interactions` | 전체 상호작용 |
| `ig_reels_avg_watch_time` | 평균 시청 시간 |
| `ig_reels_video_view_total_time` | 총 시청 시간 |

**Stories 전용 지표:**

| 지표 | 설명 |
|------|------|
| `exits` | 스토리 나간 횟수 |
| `replies` | 답장 수 |
| `taps_forward` | 다음 탭 |
| `taps_back` | 이전 탭 |

### 2.2 계정 인사이트 (User Insights)

```
GET /{ig-user-id}/insights?metric={metrics}&period={period}
```

| 지표 | period | 설명 |
|------|--------|------|
| `impressions` | day, week, days_28 | 콘텐츠 노출 횟수 |
| `reach` | day, week, days_28 | 도달 고유 계정 수 |
| `follower_count` | day | 팔로워 수 변화 (최소 100명 이상) |
| `profile_views` | day | 프로필 방문 수 |
| `website_clicks` | day | 웹사이트 클릭 수 |
| `email_contacts` | day | 이메일 버튼 클릭 |
| `get_directions_clicks` | day | 길찾기 클릭 |
| `phone_call_clicks` | day | 전화 버튼 클릭 |
| `text_message_clicks` | day | 문자 버튼 클릭 |
| `online_followers` | lifetime | 시간대별 팔로워 온라인 수 |
| `audience_city` | lifetime | 팔로워 도시별 분포 |
| `audience_country` | lifetime | 팔로워 국가별 분포 |
| `audience_gender_age` | lifetime | 팔로워 성별/연령 분포 |

### 2.3 일별 데이터 수집 방법

```
GET /{ig-user-id}/insights
  ?metric=impressions,reach,follower_count,profile_views
  &period=day
  &since={unix_timestamp}
  &until={unix_timestamp}
```

- `since`/`until`: Unix timestamp (초 단위)
- 최대 30일치 한 번에 조회 가능
- Cron job으로 매일 수집 권장 (bscamp의 기존 `collect-daily` 패턴 활용 가능)

### 2.4 데이터 보존 기간

| 데이터 유형 | 보존 기간 |
|-------------|-----------|
| 게시물 인사이트 | 게시물 존재하는 동안 영구 |
| 계정 인사이트 (daily) | **최대 30일** (과거 데이터 소실) |
| 계정 인사이트 (week) | 최대 30일 |
| 계정 인사이트 (days_28) | 최대 30일 |
| Stories 인사이트 | 스토리 만료 후 24시간 |
| 인구통계 (lifetime) | 항상 최신값만 |

> **주의**: 계정 인사이트는 30일이 지나면 조회 불가. 따라서 **일별 Cron으로 수집하여 DB에 저장하는 것이 필수**. bscamp의 기존 `daily_ad_insights` 테이블 패턴과 유사하게 `daily_ig_organic_insights` 테이블 설계 필요.

---

## 3. Meta 비즈니스 계정 요구사항

### 공식 문서
- https://developers.facebook.com/docs/instagram-platform/getting-started

### 3.1 Instagram Professional Account 필요

Instagram Graph API를 사용하려면 반드시 다음이 필요하다:

1. **Instagram Professional Account** (비즈니스 또는 크리에이터 계정)
   - 개인 계정으로는 API 사용 불가
   - Instagram 앱 설정 → "프로페셔널 계정으로 전환"

2. **Facebook 페이지와 연결**
   - Instagram Professional Account는 Facebook 페이지에 연결되어야 함
   - 페이지 설정 → Instagram → 계정 연결
   - 연결된 페이지의 Page Access Token으로 API 호출

3. **Meta Business Suite (구 Facebook Business Manager)**
   - 비즈니스 포트폴리오에 페이지와 Instagram 계정 등록
   - API 앱도 비즈니스에 연결

### 3.2 Meta App 등록 절차

1. https://developers.facebook.com/ 에서 앱 생성
2. 앱 유형: "Business" 선택
3. Instagram Graph API 제품 추가
4. 앱 검수(App Review) 요청:
   - `instagram_basic` — 기본 프로필/미디어 조회
   - `instagram_content_publish` — 콘텐츠 발행
   - `instagram_manage_insights` — 인사이트 조회
   - `pages_read_engagement` — 페이지 인게이지먼트 조회
   - `pages_show_list` — 페이지 목록 조회
5. 검수 통과 후 Live 모드 전환

> **bscamp 관련**: 기존 Meta App (`META_APP_ID: 1602316874143269`)이 이미 등록되어 있음. 이 앱에 Instagram Graph API 제품을 추가하고, 필요한 권한을 추가 검수 받으면 됨. 단, 기존 앱이 Marketing API 용도이므로, Instagram Content Publishing 권한은 별도 검수가 필요할 수 있음.

---

## 4. OAuth 인증 (Meta)

### 공식 문서
- https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/overview#tokens

### 4.1 Facebook Login for Business

Instagram Graph API는 Facebook Login을 통해 인증한다.

**OAuth 흐름:**
```
1. 사용자를 Facebook 로그인 페이지로 리다이렉트
   GET https://www.facebook.com/v21.0/dialog/oauth
     ?client_id={app-id}
     &redirect_uri={redirect-uri}
     &scope={permissions}
     &response_type=code

2. 사용자 승인 후 authorization code 수신
   GET {redirect-uri}?code={auth-code}

3. code를 access token으로 교환
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?client_id={app-id}
     &redirect_uri={redirect-uri}
     &client_secret={app-secret}
     &code={auth-code}
```

### 4.2 Access Token 종류

| 토큰 유형 | 만료 | 용도 |
|-----------|------|------|
| **Short-Lived User Token** | ~1시간 | OAuth 직후 발급 |
| **Long-Lived User Token** | ~60일 | Short-lived 교환으로 획득 |
| **Page Access Token** | Long-lived User에서 파생 시 무기한 | 페이지/Instagram API 호출 |
| **App Access Token** | 무기한 | 앱 레벨 호출 (사용자 데이터 접근 불가) |

### 4.3 Long-Lived Token 교환 방법

**Short-Lived → Long-Lived User Token:**
```
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={app-id}
  &client_secret={app-secret}
  &fb_exchange_token={short-lived-token}
```

**Long-Lived User Token → Page Token (무기한):**
```
GET https://graph.facebook.com/v21.0/{user-id}/accounts
  ?access_token={long-lived-user-token}
```
- Long-Lived User Token으로 페이지 목록 조회 시, 반환되는 Page Token은 **무기한** 유효

**Instagram User ID 조회:**
```
GET https://graph.facebook.com/v21.0/{page-id}
  ?fields=instagram_business_account
  &access_token={page-token}
```

### 4.4 필요한 Permissions

| Permission | 용도 | 검수 필요 |
|------------|------|-----------|
| `instagram_basic` | IG 프로필, 미디어 조회 | O |
| `instagram_content_publish` | 콘텐츠 발행 (이미지/캐러셀/릴스) | O |
| `instagram_manage_insights` | 인사이트 데이터 조회 | O |
| `pages_read_engagement` | 연결된 FB 페이지 인게이지먼트 | O |
| `pages_show_list` | 사용자의 페이지 목록 조회 | O |
| `business_management` | 비즈니스 포트폴리오 관리 (선택) | O |

### 4.5 토큰 갱신 전략 (bscamp 권장)

```
[권장 아키텍처]

1. 사용자가 Instagram 연결 시 OAuth 흐름 실행
2. Short-Lived Token → Long-Lived User Token 교환 (60일)
3. Long-Lived User Token → Page Token 획득 (무기한)
4. Page Token으로 instagram_business_account ID 조회
5. Page Token + IG User ID를 DB에 저장
6. Cron으로 Long-Lived User Token 만료 전 갱신 (50일마다)
```

> **bscamp 관련**: 현재 `META_ACCESS_TOKEN`은 `.env`에 하드코딩되어 있으며, Marketing API(광고 계정) 용도로 사용 중. Instagram Content Publishing은 **수강생별로 각자의 Instagram 계정에 발행**해야 하므로, 수강생별 OAuth 연결 + 토큰 저장 구조가 필요. `profiles` 테이블에 `ig_access_token`, `ig_user_id`, `ig_token_expires_at` 컬럼 추가 또는 별도 `instagram_connections` 테이블 설계 필요.

---

## 5. API 제한사항

### 공식 문서
- https://developers.facebook.com/docs/graph-api/overview/rate-limiting

### 5.1 Rate Limit

| 유형 | 제한 |
|------|------|
| **Business Use Case Rate Limit** | 앱 + 비즈니스 조합별 제한 |
| **Graph API 표준** | 200 calls / hour / user-token |
| **Content Publishing** | 별도 제한 (아래 참조) |
| **429 응답** | `Retry-After` 헤더 확인 후 재시도 |

### 5.2 콘텐츠 발행 제한

| 항목 | 제한 |
|------|------|
| **일일 게시 제한** | **25 posts / 24시간 / IG 계정** (API 발행 + 수동 발행 합산) |
| **캐러셀 아이템** | 2 ~ 10개 |
| **컨테이너 상태 확인** | 발행 전 `GET /{creation-id}?fields=status_code` 로 FINISHED 확인 필요 |
| **동시 발행** | 같은 IG 계정에 동시에 여러 컨테이너 발행 불가 (순차 처리) |

### 5.3 이미지/미디어 제한

| 항목 | 제한 |
|------|------|
| 이미지 URL | **공개 HTTPS URL 필수** (인증, 리다이렉트 불가) |
| 이미지 크기 | 최대 8MB |
| 이미지 형식 | JPEG, PNG |
| 동영상 크기 | 최대 1GB |
| 동영상 길이 | 3초 ~ 60분 (Reels: 3초 ~ 15분) |
| 해시태그 | **최대 30개** / 게시물 |
| 캡션 길이 | 최대 2,200자 |
| 멘션 | 최대 20개 / 게시물 |

### 5.4 컨테이너 상태 코드

컨테이너 생성 후 발행 전 상태 확인이 필요하다 (특히 동영상):

```
GET /{creation-id}?fields=status_code
```

| status_code | 의미 |
|-------------|------|
| `EXPIRED` | 24시간 내 발행하지 않아 만료 |
| `ERROR` | 처리 실패 |
| `FINISHED` | 발행 준비 완료 |
| `IN_PROGRESS` | 처리 중 (동영상 인코딩 등) |
| `PUBLISHED` | 이미 발행됨 |

---

## 6. bscamp에서의 활용 고려사항

### 6.1 기존 Meta API 연동 현황

| 항목 | 현재 상태 |
|------|-----------|
| API 버전 | `v21.0` (graph.facebook.com) |
| Meta App | `META_APP_ID: 1602316874143269` 등록됨 |
| App Secret | `META_APP_SECRET` 설정됨 |
| Access Token | Marketing API용 하드코딩 토큰 |
| 사용 중인 API | Marketing API (광고 인사이트), Ad Library API (경쟁사 분석) |
| 관련 파일 | `src/lib/protractor/meta-collector.ts`, `src/lib/classify-account.ts`, `src/lib/competitor/meta-ad-library.ts` |

### 6.2 기존 토큰 재활용 가능 여부

| 질문 | 답변 |
|------|------|
| 기존 `META_ACCESS_TOKEN`으로 Instagram API 호출 가능? | **조건부 가능** — 토큰 소유자의 Facebook 계정에 연결된 Instagram Professional Account가 있고, 해당 토큰에 `instagram_basic` 등 권한이 포함되어 있어야 함 |
| 기존 Meta App에 Instagram 제품 추가 가능? | **가능** — developers.facebook.com에서 앱에 "Instagram Graph API" 제품 추가 후 권한 검수 요청 |
| 수강생별 Instagram 연동은? | **별도 OAuth 흐름 필요** — 각 수강생이 자신의 Instagram 계정을 연결하는 OAuth UI 구현 필요 |

### 6.3 카드뉴스(캐러셀) 이미지 생성

Instagram API 자체는 이미지 생성 기능이 없다. 카드뉴스 이미지는 별도로 생성해야 한다.

| 방법 | 장점 | 단점 |
|------|------|------|
| **HTML → Image (puppeteer/playwright)** | 자유로운 디자인, 기존 스택 활용 | 서버 리소스, 폰트 관리 |
| **Canva API** | 전문 디자인 품질, 템플릿 활용 | 유료, API 제한, 외부 의존성 |
| **Sharp + Canvas (Node)** | 서버사이드, 빠름 | 복잡한 레이아웃 어려움 |
| **Satori (Vercel)** | React → SVG → PNG, Next.js 친화적 | OG Image용, 복잡한 디자인 제한 |

> **권장**: Playwright가 이미 프로젝트에 포함되어 있으므로 (`webapp-testing.md` 스킬), HTML 템플릿 → Playwright 스크린샷 → 이미지 생성 파이프라인이 가장 현실적.

### 6.4 Phase 3 구현 범위 제안

```
[Phase 3-1: Instagram 연결 기반]
├── Instagram OAuth 연결 UI (수강생 설정 페이지)
├── instagram_connections 테이블 (ig_user_id, page_token, expires_at)
├── 토큰 갱신 Cron (50일 주기)
└── IG 프로필/미디어 목록 조회

[Phase 3-2: 인사이트 수집]
├── daily_ig_insights 테이블 설계
├── 게시물 인사이트 수집 Cron (일 1회)
├── 계정 인사이트 수집 Cron (일 1회)
├── 인사이트 대시보드 UI
└── 기존 총가치각도기(Protractor)와 통합 — 유기적 지표 연계

[Phase 3-3: 콘텐츠 발행]
├── 카드뉴스 이미지 생성 (HTML → Image 파이프라인)
├── 발행 큐 시스템 (예약 게시 지원)
├── 단일 이미지/캐러셀/릴스 발행 API
├── 발행 상태 추적 (컨테이너 상태 폴링)
└── 발행 결과 → 인사이트 자동 연결
```

### 6.5 DB 설계 초안

```sql
-- Instagram 계정 연결 테이블
CREATE TABLE instagram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) NOT NULL,
  ig_user_id TEXT NOT NULL,            -- Instagram Business Account ID
  ig_username TEXT,                     -- @username
  page_id TEXT NOT NULL,               -- 연결된 Facebook Page ID
  page_access_token TEXT NOT NULL,     -- 무기한 Page Token (암호화 저장)
  user_access_token TEXT,              -- Long-Lived User Token (갱신용)
  token_expires_at TIMESTAMPTZ,        -- User Token 만료일
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, ig_user_id)
);

-- Instagram 오가닉 인사이트 (일별)
CREATE TABLE daily_ig_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id TEXT NOT NULL,
  date DATE NOT NULL,
  -- 계정 인사이트
  impressions INT,
  reach INT,
  follower_count INT,
  profile_views INT,
  website_clicks INT,
  -- 수집 메타
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ig_user_id, date)
);

-- Instagram 게시물 인사이트
CREATE TABLE ig_media_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id TEXT NOT NULL,
  ig_media_id TEXT NOT NULL,
  media_type TEXT,                     -- IMAGE, CAROUSEL_ALBUM, REELS, VIDEO
  caption TEXT,
  permalink TEXT,
  timestamp TIMESTAMPTZ,
  -- 인사이트 지표
  impressions INT,
  reach INT,
  likes INT,
  comments INT,
  shares INT,
  saved INT,
  total_interactions INT,
  -- Reels 전용
  plays INT,
  -- 수집 메타
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ig_media_id)
);
```

### 6.6 주의사항 정리

| 항목 | 주의 |
|------|------|
| **이미지 URL** | Supabase Storage signed URL은 만료되므로 public bucket 필요 |
| **토큰 보안** | Page Token은 DB에 암호화 저장 (AES-256), RLS 정책으로 본인만 조회 |
| **Rate Limit** | 수강생 수 x API 호출 수 계산 필요 (78명 기준, 일 200회 제한 주의) |
| **App Review** | `instagram_content_publish` 권한 검수에 2~4주 소요 가능 |
| **API 버전** | 현재 v21.0 사용 중. Instagram API도 동일 버전 사용 가능하나 최신 버전 확인 필요 |
| **컨테이너 만료** | 생성 후 24시간 내 발행하지 않으면 만료 |
| **동시 발행 불가** | 같은 계정에 동시 발행 요청 시 에러 → 큐 시스템 필요 |
| **계정 인사이트 30일** | 30일 지나면 과거 데이터 조회 불가 → Cron 수집 필수 |

---

## 7. 공식 문서 URL 정리

| 주제 | URL |
|------|-----|
| Instagram Graph API 개요 | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/overview |
| 시작하기 | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/get-started |
| Content Publishing | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing |
| Insights API | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/insights |
| 미디어 (Media Node) | https://developers.facebook.com/docs/instagram-platform/reference/ig-media |
| 사용자 (User Node) | https://developers.facebook.com/docs/instagram-platform/reference/ig-user |
| Rate Limiting | https://developers.facebook.com/docs/graph-api/overview/rate-limiting |
| Access Tokens | https://developers.facebook.com/docs/facebook-login/guides/access-tokens |
| Long-Lived Tokens | https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived |
| Permissions Reference | https://developers.facebook.com/docs/permissions/reference |
| App Review | https://developers.facebook.com/docs/app-review |
| Graph API Explorer | https://developers.facebook.com/tools/explorer/ |
| API Changelog | https://developers.facebook.com/docs/graph-api/changelog |

---

## 8. 다음 단계

1. **공식 문서 최신 확인**: 이 조사는 2025년 5월까지의 학습 데이터 기반. 2025.05 이후 API 변경사항(v22.0 등) 반드시 확인
2. **기존 Meta App 권한 확인**: `META_APP_ID: 1602316874143269`에 현재 어떤 권한이 승인되어 있는지 확인
3. **Instagram 테스트 계정**: 개발용 테스트 Instagram Professional Account 생성
4. **App Review 신청**: `instagram_content_publish`, `instagram_manage_insights` 권한 검수 요청 (2~4주 소요)
5. **이미지 호스팅 결정**: Supabase Storage public bucket vs GCS public bucket
