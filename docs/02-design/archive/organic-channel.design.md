# 오가닉 채널 관리 — Phase 1 설계서

## 1. 데이터 모델

### 1-1. organic_posts (발행 콘텐츠)
| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK, gen_random_uuid() | |
| title | text | NOT NULL | 제목 |
| content | text | nullable | 본문 (마크다운) |
| channel | text | NOT NULL, CHECK IN ('naver_blog','naver_cafe','youtube','instagram','tiktok') | 발행 채널 |
| keywords | text[] | DEFAULT '{}' | 타겟 키워드 |
| level | text | CHECK IN ('L1'~'L5') | 난이도 레벨 |
| status | text | NOT NULL, DEFAULT 'draft', CHECK IN ('draft','scheduled','review','published','archived') | 상태 |
| external_url | text | nullable | 발행 URL |
| external_id | text | nullable | 플랫폼 ID |
| parent_post_id | uuid | FK → organic_posts(id) | 카페 글의 블로그 원본 |
| seo_score | integer | nullable | SEO 점수 |
| published_at | timestamptz | nullable | 발행일시 |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

### 1-2. organic_analytics (일별 성과)
| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| post_id | uuid | FK → organic_posts ON DELETE CASCADE | |
| date | date | NOT NULL | |
| views | integer | DEFAULT 0 | 조회수 |
| unique_visitors | integer | DEFAULT 0 | 순방문자 |
| reach | integer | DEFAULT 0 | 도달 |
| engagement_rate | numeric(5,2) | nullable | 참여율 |
| saves/shares/comments | integer | DEFAULT 0 | |
| avg_duration | integer | nullable | 평균체류(초) |
| conversions | integer | DEFAULT 0 | 전환수 |
| UNIQUE(post_id, date) | | | |

### 1-3. keyword_stats (키워드 검색량)
| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| keyword | text | NOT NULL | |
| channel | text | DEFAULT 'naver_blog' | |
| pc_search/mobile_search/total_search | integer | nullable | 검색량 |
| competition | text | nullable | 경쟁도 |
| ctr_pc/ctr_mobile | numeric(5,2) | nullable | 클릭률 |
| fetched_at | timestamptz | DEFAULT now() | |

### 1-4. keyword_rankings (순위 추적)
| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| keyword | text | NOT NULL | |
| post_id | uuid | FK → organic_posts ON DELETE CASCADE | |
| channel | text | DEFAULT 'naver_blog' | |
| rank | integer | nullable | 검색 순위 |
| search_date | date | NOT NULL | |
| UNIQUE(keyword, post_id, search_date) | | | |

### 1-5. seo_benchmarks (SEO 벤치마크)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| keyword | text | NOT NULL |
| rank | integer | 순위 |
| blog_name | text | 블로그명 |
| char_count/image_count/keyword_repeat | integer | 분석 항목 |
| format_elements | jsonb | DEFAULT '{}' |
| analyzed_at | timestamptz | DEFAULT now() |

### 1-6. organic_conversions (전환 이벤트)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| post_id | uuid | FK → organic_posts ON DELETE CASCADE |
| channel | text | NOT NULL |
| utm_source/utm_medium/utm_campaign/utm_content | text | UTM 파라미터 |
| event_type | text | CHECK IN ('click','landing','signup') |

### RLS 정책
모든 6개 테이블: `admin_only` — `profiles.role = 'admin'`인 사용자만 접근.

---

## 2. API 설계 (Server Actions)

파일: `src/actions/organic.ts`

| 함수 | 용도 | 입력 | 반환 |
|------|------|------|------|
| `getOrganicPosts(filters)` | 목록 조회 | `{ channel?, status?, page?, limit? }` | `{ posts: OrganicPost[], total: number }` |
| `getOrganicPost(id)` | 단건 조회 | `id: string` | `OrganicPost \| null` |
| `createOrganicPost(data)` | 새 글 생성 | `CreateOrganicPostInput` | `OrganicPost` |
| `updateOrganicPost(id, data)` | 수정 | `id, UpdateOrganicPostInput` | `OrganicPost` |
| `publishOrganicPost(id)` | 발행 | `id: string` | `OrganicPost` |
| `deleteOrganicPost(id)` | 삭제 | `id: string` | `void` |
| `getOrganicStats()` | 대시보드 통계 | 없음 | `OrganicStats` |
| `getKeywordStats(filters)` | 키워드 목록 | `{ channel?, page?, limit? }` | `{ keywords: KeywordStat[], total: number }` |

### 타입 정의 (`src/types/organic.ts`)

```typescript
export interface OrganicPost {
  id: string;
  title: string;
  content: string | null;
  channel: 'naver_blog' | 'naver_cafe' | 'youtube' | 'instagram' | 'tiktok';
  keywords: string[];
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | null;
  status: 'draft' | 'scheduled' | 'review' | 'published' | 'archived';
  external_url: string | null;
  external_id: string | null;
  parent_post_id: string | null;
  seo_score: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganicPostInput {
  title: string;
  content?: string;
  channel: OrganicPost['channel'];
  keywords?: string[];
  level?: OrganicPost['level'];
}

export interface UpdateOrganicPostInput {
  title?: string;
  content?: string;
  channel?: OrganicPost['channel'];
  keywords?: string[];
  level?: OrganicPost['level'];
  status?: OrganicPost['status'];
  external_url?: string;
  seo_score?: number;
}

export interface OrganicStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  reviewPosts: number;
  totalViews: number;
  totalKeywords: number;
}

export interface KeywordStat {
  id: string;
  keyword: string;
  channel: string;
  pc_search: number | null;
  mobile_search: number | null;
  total_search: number | null;
  competition: string | null;
  fetched_at: string;
}
```

---

## 3. 컴포넌트 구조

### 3-1. 페이지 구성

```
/admin/organic (page.tsx)
├── Tabs
│   ├── 대시보드 (OrganicDashboard)
│   │   ├── 통계 카드 4개 (전체/발행/초안/검토)
│   │   ├── 총 조회수 카드
│   │   └── 최근 발행 목록 (최근 5개)
│   ├── 발행 관리 (OrganicPostsTab)
│   │   ├── 필터 바 (채널, 상태)
│   │   ├── 테이블 (제목, 채널, 상태, 키워드, 발행일)
│   │   ├── 새 글 작성 버튼 → /admin/organic/new
│   │   └── 행 클릭 → /admin/organic/[id]
│   └── 키워드 (OrganicKeywordsTab)
│       ├── 키워드 테이블 (키워드, PC검색량, 모바일검색량, 경쟁도)
│       └── 채널 필터

/admin/organic/[id] (page.tsx)
├── OrganicPostEditor
│   ├── 제목 입력
│   ├── 채널 선택 (블로그/카페)
│   ├── 레벨 선택 (L1~L5)
│   ├── 키워드 입력 (태그 형태)
│   ├── 본문 편집 (textarea, 마크다운)
│   ├── 상태 뱃지
│   ├── 저장 버튼
│   ├── 발행 버튼 (status → published)
│   └── 카페 요약 생성 버튼 (블로그 글인 경우)
```

### 3-2. 상태 뱃지 매핑
| status | 라벨 | 색상 |
|--------|------|------|
| draft | 초안 | gray |
| review | 검토중 | yellow |
| scheduled | 예약됨 | blue |
| published | 발행완료 | green |
| archived | 보관 | gray |

### 3-3. 채널 아이콘
- naver_blog: 📝 블로그
- naver_cafe: ☕ 카페

---

## 4. 에러 처리

| 상황 | 에러 메시지 | 처리 |
|------|-----------|------|
| 비관리자 접근 | "관리자만 접근할 수 있습니다" | RLS 차단 + redirect |
| 글 생성 실패 | "글 생성에 실패했습니다" | toast 표시 |
| 글 조회 실패 | "글을 찾을 수 없습니다" | notFound() 호출 |
| 발행 실패 | "발행에 실패했습니다" | toast 표시 |

---

## 5. 구현 순서

### backend-dev (선행)
- [ ] `src/types/organic.ts` — 타입 정의
- [ ] `src/actions/organic.ts` — Server Actions 8개
- [ ] `supabase/migrations/organic-channel.sql` — 마이그레이션 참조 SQL

### frontend-dev (backend 완료 후)
- [ ] `src/components/layout/app-sidebar.tsx` — Share2 아이콘 import + adminNavItems 1줄 추가
- [ ] `src/components/organic/organic-dashboard.tsx` — 대시보드 탭
- [ ] `src/components/organic/organic-posts-tab.tsx` — 발행 관리 탭
- [ ] `src/components/organic/organic-keywords-tab.tsx` — 키워드 탭
- [ ] `src/components/organic/organic-post-editor.tsx` — 글 편집기
- [ ] `src/app/(main)/admin/organic/page.tsx` — 메인 페이지 (탭 허브)
- [ ] `src/app/(main)/admin/organic/[id]/page.tsx` — 상세/편집 페이지

### qa-engineer
- [ ] tsc + lint + build 통과 확인
- [ ] Gap 분석 문서 작성
