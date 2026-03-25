# 오가닉 5채널 배포 프로세스 — Design 설계서

## Executive Summary

| 항목 | 내용 |
|------|------|
| 기능 | 오가닉 5채널 콘텐츠 배포 프로세스 |
| 작성일 | 2026-03-25 |
| 작성자 | Leader (bkit PDCA) |
| 상태 | Design 완료 |
| Plan 문서 | docs/01-plan/features/organic-channel-distribution.plan.md |
| 선행 설계서 | docs/02-design/features/organic-channel.design.md (Phase 1) |

### 핵심 가치

| 관점 | 설명 |
|------|------|
| 문제 | 441억 매출 실데이터, RAG 664청크, 벤치마크 7,366rows가 bscamp 내부에만 갇혀 있음 |
| 솔루션 | 원본 1개 → AI 변환 → 5채널(이메일/블로그/유튜브/인스타/커뮤니티) 자동 배포 |
| 기능/UX 효과 | Smith님 투입 = 주 1회 원본 작성 + 블로그 첨삭, 나머지 AI 자동화 |
| 핵심 가치 | 오가닉 검색 유입 월 3,000+ → 광고 의존도 탈피 → 지속 가능한 리드 파이프라인 |

### 설계 범위

| 범위 | Phase | 상태 |
|------|-------|------|
| 기존 organic_posts 6 테이블 + 어드민 UI | Phase 1 | ✅ 완료 |
| AI 변환 엔진 + 검색형 채널(블로그/카페/뉴스레터/SEO) | Phase 2 | 본 설계서 |
| 소셜 채널(유튜브/인스타) | Phase 3 | 본 설계서 (인터페이스만) |
| 커뮤니티 + 성과 고도화 | Phase 4 | 본 설계서 (인터페이스만) |

---

## 1. 데이터 모델

### 1-1. 기존 테이블 확장

**organic_posts 추가 컬럼:**

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `original_content_id` | `uuid` | `REFERENCES contents(id)` | bscamp contents 원본 연결 |
| `is_source` | `boolean` | `NOT NULL DEFAULT false` | 채널 배포의 원본 글 여부 |
| `ai_transform_status` | `text` | `CHECK IN ('pending','processing','done','failed')` | AI 변환 진행 상태 |
| `scheduled_at` | `timestamptz` | — | 예약 발행 시각 |
| `word_count` | `integer` | — | 본문 글자 수 (SEO 점수 계산용) |
| `image_urls` | `text[]` | `DEFAULT '{}'` | 첨부 이미지 URL 목록 |
| `geo_markup` | `jsonb` | `DEFAULT '{}'` | Schema.org JSON-LD (FAQ/HowTo/Speakable) |
| `hashtags` | `text[]` | `DEFAULT '{}'` | 인스타/유튜브 해시태그 |

> 원본 포스트(`is_source=true`)를 동일 테이블에 저장하고, channel_distributions가 채널별 파생본을 관리. 기존 코드 단절 최소화.

---

### 1-2. channel_distributions (신규 — 채널별 변환·배포 큐)

원본 1개 → 5채널 변환 결과를 큐로 보관하고, 배포 상태를 추적한다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` | |
| `source_post_id` | `uuid` | `NOT NULL FK → organic_posts(id) ON DELETE CASCADE` | 원본 포스트 ID |
| `channel` | `text` | `NOT NULL CHECK IN ('naver_blog','naver_cafe','newsletter','youtube','instagram','google_seo')` | 대상 채널 |
| `transformed_title` | `text` | — | AI 변환된 채널별 제목 |
| `transformed_body` | `text` | — | AI 변환된 채널별 본문 |
| `transformed_metadata` | `jsonb` | `DEFAULT '{}'` | 채널별 부가 데이터 (해시태그, 카드 배열, GEO markup 등) |
| `status` | `text` | `NOT NULL DEFAULT 'pending' CHECK IN ('pending','review','approved','publishing','published','failed','rejected')` | 배포 상태 |
| `scheduled_at` | `timestamptz` | — | 예약 발행 시각 |
| `published_at` | `timestamptz` | — | 실제 발행 완료 시각 |
| `external_id` | `text` | — | 채널 외부 게시물 ID (네이버 logNo, 유튜브 videoId 등) |
| `external_url` | `text` | — | 실제 게시 URL |
| `error_message` | `text` | — | 배포 실패 사유 |
| `retry_count` | `integer` | `NOT NULL DEFAULT 0` | 재시도 횟수 |
| `reviewer_note` | `text` | — | Smith님 첨삭 메모 |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

**제약:**
```sql
CONSTRAINT channel_distribution_unique UNIQUE (source_post_id, channel)
-- 동일 원본에 동일 채널 중복 배포 방지
```

**관계:** `source_post_id` → `organic_posts.id` (1:N, 최대 6채널)

---

### 1-3. channel_credentials (신규 — 채널 API 인증)

채널별 OAuth 토큰, API 키를 암호화해 저장. 서비스 롤만 접근.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` | |
| `channel` | `text` | `NOT NULL UNIQUE CHECK IN ('naver_blog','naver_cafe','youtube','instagram')` | 채널 식별자 |
| `access_token_enc` | `text` | — | 암호화된 액세스 토큰 (AES-256-GCM) |
| `refresh_token_enc` | `text` | — | 암호화된 리프레시 토큰 |
| `token_expires_at` | `timestamptz` | — | 액세스 토큰 만료 시각 |
| `extra_config` | `jsonb` | `DEFAULT '{}'` | 채널별 부가 설정 |
| `is_active` | `boolean` | `NOT NULL DEFAULT false` | 연결 활성 여부 |
| `last_refreshed_at` | `timestamptz` | — | 마지막 토큰 갱신 시각 |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

**extra_config 구조 예시:**
- 네이버 블로그: `{ "blogId": "1bplusbscamp" }`
- 네이버 카페: `{ "clubId": "12345678", "defaultMenuId": "11" }`
- 유튜브: `{ "channelId": "UC...", "playlistId": "PL..." }`
- 인스타: `{ "igUserId": "17841...", "pageId": "..." }`

**보안:** 토큰 원문은 절대 평문 저장 금지. `CHANNEL_CREDENTIAL_KEY` 환경변수로 AES-256-GCM 암호화 후 저장.

---

### 1-4. content_analytics (신규 — 채널별 일별 성과)

`channel_distributions` 기준 일별 성과를 통합 집계.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` | |
| `distribution_id` | `uuid` | `NOT NULL FK → channel_distributions(id) ON DELETE CASCADE` | 배포 레코드 |
| `channel` | `text` | `NOT NULL` | 채널 (집계 쿼리 편의) |
| `date` | `date` | `NOT NULL` | 성과 집계 일자 |
| `views` | `integer` | `DEFAULT 0` | 조회수 |
| `unique_visitors` | `integer` | `DEFAULT 0` | 순방문자 |
| `reach` | `integer` | `DEFAULT 0` | 도달 (인스타/유튜브) |
| `impressions` | `integer` | `DEFAULT 0` | 노출수 |
| `engagement_rate` | `numeric(5,2)` | — | 참여율 (%) |
| `likes` | `integer` | `DEFAULT 0` | 좋아요 |
| `comments` | `integer` | `DEFAULT 0` | 댓글 수 |
| `shares` | `integer` | `DEFAULT 0` | 공유 수 |
| `saves` | `integer` | `DEFAULT 0` | 저장 수 |
| `clicks` | `integer` | `DEFAULT 0` | CTA 클릭 수 |
| `avg_duration_sec` | `integer` | — | 평균 체류 시간(초) |
| `subscribers_gained` | `integer` | `DEFAULT 0` | 구독자/팔로워 증가 |
| `bscamp_referrals` | `integer` | `DEFAULT 0` | bscamp.app 유입 수 (UTM) |
| `conversions` | `integer` | `DEFAULT 0` | 전환 이벤트 수 |
| `raw_data` | `jsonb` | `DEFAULT '{}'` | 채널 API 원본 응답 |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

**제약:** `UNIQUE (distribution_id, date)`

---

### 1-5. newsletter_segments (신규 — 구독자 세그먼트)

기존 leads + profiles 통합 수신자 관리에 세그먼트 레이어 추가.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `uuid` | `PK DEFAULT gen_random_uuid()` | |
| `name` | `text` | `NOT NULL UNIQUE` | 세그먼트 이름 |
| `description` | `text` | — | 세그먼트 설명 |
| `filter_rules` | `jsonb` | `NOT NULL DEFAULT '{}'` | 필터 규칙 |
| `is_dynamic` | `boolean` | `NOT NULL DEFAULT true` | 규칙 기반 동적 / 수동 리스트 |
| `member_count` | `integer` | `DEFAULT 0` | 멤버 수 캐시 |
| `last_calculated_at` | `timestamptz` | — | 마지막 계산 시각 |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

**filter_rules 구조:**
```jsonc
{
  "sources": ["leads", "profiles"],
  "profileRoles": ["student", "alumni"],
  "leadStatuses": ["prospect", "nurture"],
  "excludeOptedOut": true,
  "tags": ["webinar_attended"]
}
```

**기본 세그먼트 (초기 시드):**
| name | 설명 |
|------|------|
| `all` | 전체 구독자 (leads + profiles, 중복 제거) |
| `students` | 현재 수강생 (profiles.role = 'student') |
| `prospects` | 잠재 고객 (leads, opted_out 제외) |
| `alumni` | 졸업생 (profiles.role = 'alumni') |

---

### 1-6. RLS 정책

모든 신규 테이블: `admin_only` — `profiles.role = 'admin'`인 사용자만 접근.

```sql
-- channel_distributions, content_analytics, newsletter_segments
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON {table} FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- channel_credentials: 서비스 롤만 접근 (RLS 활성화, 일반 정책 없음)
ALTER TABLE channel_credentials ENABLE ROW LEVEL SECURITY;
-- 의도적으로 사용자 정책 미생성 → service role이 RLS bypass로 접근
```

**트리거:** `updated_at` 자동 갱신 — 기존 `update_updated_at_column()` 함수 재사용 (SECURITY DEFINER + SET search_path = public).

---

### 1-7. 인덱스

```sql
-- channel_distributions
CREATE INDEX idx_cd_source_post_id ON channel_distributions(source_post_id);
CREATE INDEX idx_cd_status ON channel_distributions(status);
CREATE INDEX idx_cd_scheduled ON channel_distributions(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'approved';
CREATE INDEX idx_cd_channel ON channel_distributions(channel);

-- content_analytics
CREATE INDEX idx_ca_distribution_id ON content_analytics(distribution_id);
CREATE INDEX idx_ca_date ON content_analytics(date DESC);
CREATE INDEX idx_ca_channel_date ON content_analytics(channel, date DESC);

-- organic_posts (신규 컬럼)
CREATE INDEX idx_op_is_source ON organic_posts(is_source) WHERE is_source = true;
CREATE INDEX idx_op_scheduled_at ON organic_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

---

## 2. API 설계

### 2-1. AI 변환 엔진 (Server Actions)

**파일: `src/actions/distribution.ts`**

| 함수 | 용도 | 입력 | 반환 |
|------|------|------|------|
| `transformToChannels()` | 원본 → 5채널 AI 변환 | `{ sourcePostId, channels[], forceRetransform? }` | `{ results: TransformResult[], error }` |
| `approveDistribution()` | 첨삭 후 승인 | `{ distributionId, reviewerNote? }` | `{ error }` |
| `scheduleDistribution()` | 예약 발행 설정 | `{ distributionId, scheduledAt }` | `{ error }` |
| `publishDistribution()` | 즉시 배포 트리거 | `{ distributionId }` | `{ externalId, externalUrl, error }` |
| `getDistributions()` | 배포 큐 목록 조회 | `{ sourcePostId?, channel?, status?, page?, limit? }` | `{ data, count, error }` |
| `updateTransformedContent()` | 변환 결과 수동 수정 | `{ distributionId, title?, body?, metadata?, note? }` | `{ error }` |

#### transformToChannels() 상세

```typescript
type TransformChannel =
  | 'naver_blog' | 'naver_cafe' | 'newsletter'
  | 'youtube' | 'instagram' | 'google_seo';

interface TransformRequest {
  sourcePostId: string;          // organic_posts.id (is_source=true)
  channels: TransformChannel[];  // 변환할 채널 목록
  forceRetransform?: boolean;    // 기존 변환 결과 덮어쓰기
}

interface TransformResult {
  channel: TransformChannel;
  distributionId: string;
  status: 'created' | 'skipped' | 'failed';
  error?: string;
}
```

**내부 흐름:**
1. `requireAdmin()` → `organic_posts` 원본 조회
2. Anthropic API (claude-3-5-sonnet) 채널별 프롬프트 호출 → `src/lib/ai-transform.ts`에 위임
3. `channel_distributions` UPSERT

**AI 변환 비용:** 채널당 별도 호출, 원본 2,000자 기준 총 ~$0.05. 어드민 UI에서 채널 선택적 변환 지원.

#### publishDistribution() 상세

**내부 흐름:**
1. `channel_credentials`에서 토큰 복호화 로드
2. 만료 시 refresh_token으로 갱신 후 DB 업데이트
3. 채널 API 클라이언트 호출
4. `channel_distributions` status/external_id/external_url 업데이트

---

### 2-2. AI 변환 엔진 상세

**파일: `src/lib/ai-transform.ts`**

| 함수 | 용도 |
|------|------|
| `transformForBlog(content, keywords)` | 네이버 블로그 포맷 (2,000자+, 이모지 소제목, SEO) |
| `transformForCafe(content)` | 카페 포맷 (800~1,200자, 구어체, 댓글 유도) |
| `transformForNewsletter(content)` | 뉴스레터 포맷 (500~800자, 핵심 요약, CTA) |
| `transformForYoutube(content)` | 유튜브 스크립트 (대화체, 오프닝 후크, CTA) |
| `transformForInstagram(content)` | 인스타 카드뉴스 (5~8 카드, 핵심 문장) |
| `transformForGoogleSEO(content, keywords)` | 구글 SEO (H1→H2→H3, Schema.org, OG 태그) |

**채널별 변환 프롬프트 핵심:**

| 채널 | 톤 | 길이 | 형태 | CTA | 배포 시차 |
|------|-----|------|------|-----|----------|
| 블로그 | 친근+전문 | 2,000자+ | HTML, 이모지 소제목 | bscamp 링크 | D+0 |
| 카페 | 구어체 | 800~1,200자 | 텍스트, 질문 마무리 | 댓글 유도 | D+1~2 |
| 뉴스레터 | 핵심 요약 | 500~800자 | 이메일 HTML | 클릭 버튼 | D+1 |
| 유튜브 | 대화체 | 8~15분 분량 | 스크립트+자막 | 설명란 링크 | D+3~4 |
| 인스타 | 핵심 문장 | 5~8 카드 | 이미지+텍스트 | 프로필 링크 | D+1 |

---

### 2-3. 채널 배포 API

**파일: `src/lib/channel-api/` 하위**

#### 공통 인터페이스

```typescript
// src/lib/channel-api/types.ts
interface ChannelPostRequest {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

interface ChannelPostResult {
  externalId: string;
  externalUrl: string;
}

interface ChannelApiClient {
  publish(req: ChannelPostRequest): Promise<ChannelPostResult>;
  delete(externalId: string): Promise<void>;
  getStats(externalId: string): Promise<Record<string, number>>;
}
```

#### 네이버 블로그 (`naver-blog.ts`)
- **API**: `POST https://openapi.naver.com/blog/writePost.json` (OAuth 2.0)
- **환경변수**: `NAVER_BLOG_CLIENT_ID`, `NAVER_BLOG_CLIENT_SECRET`
- **metadata**: `{ tags[], categoryNo, publishOpen: 'all'|'neighbor'|'private' }`
- **externalId** = `logNo`, **externalUrl** = `https://blog.naver.com/{blogId}/{logNo}`
- **인증 흐름**: channel_credentials 토큰 복호화 → 만료 시 refresh → `Authorization: Bearer` 호출

#### 네이버 카페 (`naver-cafe.ts`)
- **API**: `POST https://openapi.naver.com/v1/cafe/{clubId}/articles`
- **metadata**: `{ clubId, menuId, isNotice? }`
- **externalId** = `articleId`, **externalUrl** = `https://cafe.naver.com/{cafeUrl}/{articleId}`

#### 유튜브 (`youtube.ts`)
- **API**: YouTube Data API v3 (OAuth 2.0)
- **metadata**: `{ description, tags[], categoryId: '27', playlistId, scheduledAt, thumbnailUrl }`
- **Phase 2**: 스크립트+메타데이터 생성까지만 자동화, 실제 영상 업로드는 수동
- **Phase 3**: API 업로드 자동화

#### 인스타그램 (`instagram.ts`)
- **API**: Instagram Graph API (Meta)
- **metadata**: `{ imageUrls[], caption, isCarousel, locationId? }`
- **Phase 3 구현**: 캐러셀은 공개 접근 가능 이미지 URL 필요 (Storage 공개 버킷 or signed URL)

#### 뉴스레터 (`newsletter.ts`)
- 기존 `email_logs` + `email_sends` 파이프라인 래핑
- **metadata**: `{ segmentName, subject, ctaText, ctaUrl, abTestVariant? }`
- `getRecipients(segmentName)` → `email_logs` INSERT → `email_sends` 배치

---

### 2-4. 성과 추적 API

**파일: `src/actions/analytics.ts` (신규)**

| 함수 | 용도 | 입력 | 반환 |
|------|------|------|------|
| `collectChannelAnalytics()` | 채널 API 성과 수집 → content_analytics UPSERT | `{ channel, dateRange? }` | `{ upsertedCount, error }` |
| `getAnalyticsSummary()` | 기간별 채널 통합 성과 | `{ sourcePostId?, channel?, dateFrom, dateTo }` | `{ data[], error }` |
| `getKeywordRankings()` | 키워드 순위 조회 | `{ keyword?, channel?, dateFrom?, dateTo? }` | `{ data[], error }` |

**채널별 수집 소스:**
| 채널 | 수집 API |
|------|---------|
| `naver_blog` | 네이버 블로그 통계 API (조회수, 댓글) |
| `naver_cafe` | 네이버 카페 글 통계 API |
| `newsletter` | 기존 `email_sends` 테이블 집계 (open, click) |
| `youtube` | YouTube Analytics API v2 |
| `instagram` | Instagram Insights API (Graph API) |
| `google_seo` | Google Search Console API (Phase 4) |

**cron 엔드포인트:** `src/app/api/cron/collect-organic-analytics/route.ts`
- Vercel cron: `0 3 * * *` (매일 03:00 UTC)
- 인증: `CRON_SECRET` 헤더

---

### 2-5. 뉴스레터 세그먼트 API

**파일: 기존 `src/actions/recipients.ts` 확장**

| 함수 | 용도 | 입력 | 반환 |
|------|------|------|------|
| `getNewsletterSegments()` | 세그먼트 목록 | — | `{ data[], error }` |
| `calculateSegmentMembers()` | 세그먼트 수신자 계산 | `{ segmentId }` | `{ members[], count, error }` |
| `createNewsletterSegment()` | 세그먼트 생성 | `{ name, description?, filterRules, isDynamic? }` | `{ id, error }` |
| `sendNewsletterToSegment()` | 세그먼트 대상 발송 | `{ distributionId, segmentId, dryRun? }` | `{ recipientCount, emailLogId, error }` |

---

## 3. 컴포넌트 구조

### 3-1. 페이지 구성 (기존 확장 + 신규)

```
/admin/organic (기존 3탭 → 5탭으로 확장)
├── 대시보드 (기존 OrganicDashboard 확장)
│   ├── 통계카드 6개 (기존 유지)
│   ├── 최근 발행 테이블 (기존 유지)
│   └── 채널별 배포 현황 요약 카드 (신규)
├── 발행 관리 (기존 OrganicPostsTab)
│   ├── 채널 필터 + 상태 필터 (채널 옵션에 youtube/instagram 추가)
│   └── 발행 목록 테이블
├── AI 배포 (신규 — DistributionTab)
│   ├── 원본 선택 드롭다운 (발행완료/검토중 글 목록)
│   └── DistributionPanel
│       ├── 원본 미리보기 (읽기 전용)
│       ├── AI 변환 버튼 → 5채널 PreviewModal
│       └── 배포 상태 트래커 (5채널 뱃지)
├── 캘린더 (신규 — DistributionCalendar)
│   ├── 주간 뷰 (월~일 × 5채널 그리드)
│   └── 예약 항목 클릭 → 편집/발행 취소
└── 키워드 (기존 OrganicKeywordsTab)

/admin/organic/[id] (기존 에디터 확장)
├── OrganicPostEditor (기존 — 제목/본문/채널/레벨/키워드)
├── AI 변환 패널 (신규 — AITransformPanel, 사이드바 하단)
│   ├── "5채널 변환하기" 버튼
│   └── 변환 진행 상태
└── 배포 상태 패널 (신규 — DistributionStatusPanel, 사이드바 하단)
    └── 채널별 배포 기록 (채널명 + 상태뱃지 + 발행일/예약일)
```

---

### 3-2. 신규 컴포넌트 상세

#### DistributionTab (`distribution-tab.tsx`)
- **역할**: `/admin/organic` AI 배포 탭 — 원본 선택 후 5채널 배포 관리
- **상태**: `selectedPostId`, `selectedPost`, `showPreview`
- **하위**: `Select` (원본 선택) → `DistributionPanel` → `PreviewModal`

#### DistributionPanel (`distribution-panel.tsx`)
- **역할**: 원본 1개에 대한 5채널 배포 전체 흐름 (변환 → 미리보기 → 발행)
- **Props**: `{ post: OrganicPost, onOpenPreview: (transforms) => void }`
- **상태**: `transforming`, `distributions[]`, `scheduleMode: 'immediate'|'scheduled'`, `scheduledAt`
- **레이아웃**: 2단 (좌: 원본 미리보기 + 변환 버튼, 우: 채널별 상태 트래커)

#### PreviewModal (`preview-modal.tsx`)
- **역할**: AI 변환 5채널 결과를 탭별 미리보기 + 수동 수정 + 채널별 배포 승인
- **Props**: `{ open, onClose, postId, transforms: ChannelTransform[], onConfirm }`
- **상태**: `activeChannel`, `editedTransforms[]`, `confirming`
- **레이아웃**: `Dialog` (max-w-4xl) + 내부 `Tabs` 5개
  - 각 탭: 채널명 + 글자수, `Textarea` (수정 가능), "이 채널 배포 승인" 체크박스
  - 푸터: "선택 채널 배포하기" 버튼 (승인 채널만)

#### DistributionCalendar (`distribution-calendar.tsx`)
- **역할**: 주간 배포 스케줄 시각화 (채널 × 요일 그리드)
- **상태**: `weekOffset`, `selectedItem`
- **레이아웃**:
  ```
  헤더: < 이전 주 | 2026년 3월 23일 ~ 29일 | 다음 주 >

  ┌──────────────┬───┬───┬───┬───┬───┬───┬───┐
  │              │ 월 │ 화 │ 수 │ 목 │ 금 │ 토 │ 일 │
  ├──────────────┼───┼───┼───┼───┼───┼───┼───┤
  │ 📝 블로그    │   │   │ ● │   │ ● │   │   │
  │ ☕ 카페      │   │ ● │ ● │ ● │ ● │   │ ● │
  │ 📧 뉴스레터  │   │ ● │   │ ◐ │   │   │   │
  │ ▶ 유튜브    │   │   │   │ ● │ ● │   │   │
  │ 📷 인스타   │ ● │ ● │ ● │ ● │ ● │ ● │   │
  └──────────────┴───┴───┴───┴───┴───┴───┴───┘
  ● 발행완료  ◐ 예약됨  ○ 대기중  ✕ 실패
  ```
- 셀 클릭 → `/admin/organic/[id]` 이동

#### ChannelAnalyticsDashboard (`channel-analytics-dashboard.tsx`)
- **역할**: 채널별 통합 성과 비교 — 기존 OrganicDashboard 하단에 섹션 추가
- **상태**: `period: '7d'|'30d'|'90d'`
- **레이아웃**: 기간 선택 버튼 + 채널별 카드 5개 (조회수/유입/전환) + BarChart (recharts)

#### AITransformPanel (`ai-transform-panel.tsx`)
- **역할**: `/admin/organic/[id]` 에디터 사이드바 — 현재 글을 5채널 AI 변환 요청
- **Props**: `{ postId, postStatus, hasContent }`
- **레이아웃**: `Card` + 안내 문구 + "5채널 변환하기" 버튼 → 완료 시 PreviewModal

#### DistributionStatusPanel (`distribution-status-panel.tsx`)
- **역할**: `/admin/organic/[id]` 에디터 사이드바 — 현재 글의 채널별 배포 이력
- **Props**: `{ postId }`
- **레이아웃**: `Card` + 5채널 리스트 (채널명 + 상태뱃지 + 발행일)

---

### 3-3. 상태 관리

**페이지 레벨**
- 탭 상태: URL 쿼리 `?tab=dashboard|posts|distribution|calendar|keywords` (기존 패턴)
- 각 탭 독립 SWR 캐시

**DistributionPanel 흐름**
```
원본 선택 → getDistributions(postId) SWR
→ "5채널 변환" 클릭 → transforming:true → transformToChannels() Server Action
→ 성공: PreviewModal 오픈 / 실패: toast.error()
→ PreviewModal에서 수정 → "배포하기" → publishDistribution()
→ 성공: SWR mutate() + 모달 닫기 / 실패: toast.error()
```

**SWR 키 규칙**
```typescript
`action:organic-distributions:${postId}`    // 특정 글 배포 기록
`action:organic-schedule:${weekOffset}`      // 주간 캘린더
`action:organic-channel-stats:${period}`     // 채널별 성과
```

---

### 3-4. 배포 상태 뱃지

| status | 라벨 | 색상 (Tailwind) |
|--------|------|----------------|
| `pending` | 대기중 | `bg-gray-100 text-gray-600` |
| `review` | 검토중 | `bg-yellow-50 text-yellow-700` |
| `approved` | 승인됨 | `bg-blue-50 text-blue-700` |
| `publishing` | 발행중 | `bg-yellow-50 text-yellow-700` |
| `published` | 발행완료 | `bg-green-50 text-green-700` |
| `failed` | 실패 | `bg-red-50 text-red-600` |
| `rejected` | 반려 | `bg-red-50 text-red-400` |

---

## 4. 에러 처리

### 4-1. 에러 코드 정의

| 상황 | 에러 코드 | 사용자 메시지 | 처리 |
|------|-----------|-------------|------|
| AI 변환 — 본문 없음 | `TRANSFORM_NO_CONTENT` | "본문을 먼저 작성해주세요." | 버튼 disabled |
| AI 변환 — API 오류 | `TRANSFORM_AI_ERROR` | "AI 변환에 실패했습니다. 잠시 후 다시 시도해주세요." | toast.error + 재시도 버튼 |
| AI 변환 — 타임아웃 (30초) | `TRANSFORM_TIMEOUT` | "변환 시간이 초과되었습니다." | toast.error |
| AI 변환 — 할당량 초과 | `TRANSFORM_QUOTA_EXCEEDED` | "오늘 AI 변환 횟수를 모두 사용했습니다." | toast.error + 잔여 횟수 |
| 네이버 블로그 — 인증 만료 | `NAVER_AUTH_EXPIRED` | "네이버 블로그 연동이 만료되었습니다. 설정에서 재연동해주세요." | toast.error + 재연동 링크 |
| 네이버 블로그 — 발행 실패 | `NAVER_PUBLISH_ERROR` | "네이버 블로그 발행에 실패했습니다. ({detail})" | toast.error + 재시도 |
| 네이버 카페 — 발행 실패 | `NAVER_CAFE_ERROR` | "네이버 카페 게시에 실패했습니다." | toast.error |
| 뉴스레터 — 구독자 없음 | `NEWSLETTER_NO_SUBSCRIBERS` | "발송 대상 구독자가 없습니다. 세그먼트를 확인해주세요." | toast.error + 발행 중단 |
| 유튜브 — 인증 만료 | `YOUTUBE_AUTH_EXPIRED` | "유튜브 연동이 만료되었습니다." | toast.error + 재연동 링크 |
| 인스타 — 권한 오류 | `INSTAGRAM_PERMISSION_ERROR` | "인스타그램 게시 권한이 없습니다." | toast.error |
| 예약 — 과거 시간 | `SCHEDULE_PAST_TIME` | "예약 시간은 현재 시각 이후여야 합니다." | 인라인 에러 + 버튼 disabled |
| 네트워크 오류 | `NETWORK_ERROR` | "네트워크 연결을 확인해주세요." | toast.error + 자동 재시도 1회 |
| 발행 중 중복 요청 | `DUPLICATE_REQUEST` | "이미 발행 중입니다." | 버튼 disabled |

### 4-2. 채널별 부분 실패 처리

5채널 중 일부만 성공한 경우, 전체를 실패 처리하지 않고 **채널별 독립 상태 관리**.

```
예시:
  블로그    ✅ 발행완료
  카페      ✅ 발행완료
  뉴스레터  ❌ 실패 (인증 만료)
  유튜브    ⏭ 건너뜀
  인스타    ⏭ 건너뜀

→ toast.success("2개 채널 발행 완료") + toast.error("1개 채널 실패 — 재시도 가능")
→ 실패 채널만 재시도 버튼 표시
```

### 4-3. 에러 UI 복구 원칙

1. **낙관적 업데이트 금지**: 채널 API는 외부 의존성 → 응답 확인 후 상태 변경
2. **분산 에러 표시**: toast.error (즉각 알림) + status='failed' 뱃지 (영구 기록) 둘 다 사용
3. **실패 후 버튼 복구**: 에러 시 자동 재활성화 (`confirming: false`)
4. **인증 만료**: 재연동 링크를 toast 액션 버튼으로 제공
5. **모달 닫기 보호**: 배포 진행 중 모달 닫기 차단 + 인라인 경고

---

## 5. 구현 순서

### Phase 2: 검색형 채널 자동화 (4~5월) — 본 설계서 핵심

#### backend-dev (선행)

- [ ] DB 마이그레이션: `organic_posts` 컬럼 추가 (is_source, ai_transform_status 등)
- [ ] DB 마이그레이션: `channel_distributions` 테이블 생성
- [ ] DB 마이그레이션: `channel_credentials` 테이블 생성
- [ ] DB 마이그레이션: `newsletter_segments` 테이블 생성 + 시드 데이터
- [ ] `src/types/distribution.ts` — 타입 정의 (ChannelDistribution, TransformChannel 등)
- [ ] `src/lib/ai-transform.ts` — AI 포맷 변환 엔진 (Anthropic API, 채널별 프롬프트)
- [ ] `src/lib/channel-api/types.ts` — 공통 인터페이스
- [ ] `src/lib/channel-api/naver-blog.ts` — 네이버 블로그 OAuth + writePost
- [ ] `src/lib/channel-api/naver-cafe.ts` — 네이버 카페 글쓰기 API
- [ ] `src/lib/channel-api/newsletter.ts` — 기존 email 파이프라인 래핑
- [ ] `src/actions/distribution.ts` — Server Actions 6개
- [ ] `src/actions/recipients.ts` 확장 — 세그먼트 API 4개 추가
- [ ] OAuth 콜백 라우트: `/api/auth/naver/callback` (네이버 OAuth 토큰 수신)

#### frontend-dev (backend 완료 후)

- [ ] `src/components/organic/distribution-tab.tsx` — AI 배포 탭
- [ ] `src/components/organic/distribution-panel.tsx` — 배포 패널
- [ ] `src/components/organic/preview-modal.tsx` — 5채널 미리보기 모달
- [ ] `src/components/organic/distribution-calendar.tsx` — 주간 캘린더
- [ ] `src/components/organic/ai-transform-panel.tsx` — 에디터 사이드바 변환 패널
- [ ] `src/components/organic/distribution-status-panel.tsx` — 에디터 사이드바 배포 상태
- [ ] `src/app/(main)/admin/organic/page.tsx` 수정 — 5탭 확장
- [ ] `src/app/(main)/admin/organic/[id]/page.tsx` 수정 — 사이드바 패널 추가

### Phase 3: 소셜 채널 확장 (6~7월)

#### backend-dev
- [ ] `src/lib/channel-api/youtube.ts` — YouTube Data API v3
- [ ] `src/lib/channel-api/instagram.ts` — Instagram Graph API
- [ ] OAuth 콜백: `/api/auth/google/callback` (YouTube), `/api/auth/meta/callback` (Instagram)
- [ ] DB 마이그레이션: `content_analytics` 테이블 생성
- [ ] `src/actions/analytics.ts` — 성과 추적 API
- [ ] `src/app/api/cron/collect-organic-analytics/route.ts` — 일일 성과 수집 cron

#### frontend-dev
- [ ] `src/components/organic/channel-analytics-dashboard.tsx` — 채널별 성과 대시보드
- [ ] OrganicDashboard에 성과 섹션 추가

### Phase 4: 커뮤니티 + 고도화 (7~8월)

- [ ] 네이버 카페 댓글 모니터링 → 슬랙 알림
- [ ] 오픈카톡방 봇 (카카오 오픈빌더)
- [ ] Google Search Console API 연동
- [ ] A/B 테스트 프레임워크 (뉴스레터 제목)
- [ ] 콘텐츠 분석 엔진 (금칙어 감지, TOP3 벤치마킹)

---

## 6. 파일 경계 (팀원 배정)

### backend-dev 소유
```
src/actions/distribution.ts (신규)
src/actions/analytics.ts (신규)
src/actions/recipients.ts (확장)
src/lib/ai-transform.ts (신규)
src/lib/channel-api/ (신규 디렉토리)
src/types/distribution.ts (신규)
src/app/api/auth/naver/ (신규)
src/app/api/cron/collect-organic-analytics/ (신규)
supabase/migrations/ (신규 마이그레이션)
```

### frontend-dev 소유
```
src/components/organic/distribution-tab.tsx (신규)
src/components/organic/distribution-panel.tsx (신규)
src/components/organic/preview-modal.tsx (신규)
src/components/organic/distribution-calendar.tsx (신규)
src/components/organic/ai-transform-panel.tsx (신규)
src/components/organic/distribution-status-panel.tsx (신규)
src/components/organic/channel-analytics-dashboard.tsx (신규)
src/app/(main)/admin/organic/page.tsx (수정)
src/app/(main)/admin/organic/[id]/page.tsx (수정)
```

### qa-engineer 소유
```
docs/03-analysis/organic-channel-distribution.analysis.md
```
