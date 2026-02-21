# TASK.md — 콘텐츠 큐레이션 대시보드
> 2026-02-21 | 수집 → AI 분석 → 큐레이션 → 정보공유 자동 생성 → 임베딩

## 목표
1. 크롤러가 수집한 콘텐츠에 Gemini Flash로 핵심 요약 + 중요도(1~5) + 키워드 자동 분석
2. 관리자 콘텐츠 관리 페이지에 "큐레이션" 탭 추가 — 일별 그룹핑 + 중요도 + 요약 표시
3. 큐레이션에서 선택 → Sonnet 4.6이 정보공유 글쓰기 템플릿으로 자동 변환
4. 게시하면 자동으로 임베딩 (source_type: 'info_share', priority: 2)
5. 정보공유 탭(/posts)에는 큐레이션 통과 + 게시된 것만 표시

## 레퍼런스
- 아키텍처 문서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-21-content-curation-architecture.html
- 참고 패턴 (콘텐츠 관리 UI): `src/app/(main)/admin/content/page.tsx`
- 참고 패턴 (임베딩): `src/actions/embed-pipeline.ts` — `embedContentToChunks()`
- 참고 패턴 (Anthropic API 호출): `src/lib/knowledge.ts` — `generate()` 함수
- 참고 패턴 (Gemini API 호출): `src/app/api/admin/content/summarize/route.ts`
- 정보공유 조회: `src/actions/posts.ts` — `getPosts()`
- 청킹: `src/lib/chunk-utils.ts` — `chunkText()`

## 현재 코드

### DB: contents 테이블 (현재)
```sql
-- 주요 컬럼 (마이그레이션 00004 + 00007 + 00013)
id uuid PK, title text, body_md text, summary text,
type text, category text, tags text[], status text (draft|review|ready|published|archived),
source_type text, source_ref text, source_hash text,
embedding_status text (pending|processing|completed|failed),
chunks_count int, embedded_at timestamptz,
view_count int, like_count int, published_at timestamptz,
email_summary text, email_sent_at timestamptz,
-- ※ ai_summary, importance_score, key_topics, curation_status 없음 (신규 추가 필요)
```

### DB: knowledge_chunks 테이블 (현재)
```sql
id uuid PK, lecture_name text, week text, chunk_index int,
content text, embedding vector(768),
source_type text, priority int, content_id uuid FK→contents,
chunk_total int, source_ref text, embedding_model text,
topic_tags text[], search_vector tsvector
-- source_type 종류: lecture, blueprint, crawl, youtube, file, marketing_theory, webinar, papers, meeting
-- priority: 1(강의/블루프린트) → 5(과제). info_share는 2 예정
```

### content_crawler.mjs — insertContent() (현재)
```js
// 위치: ~/.openclaw/workspace/scripts/content_crawler.mjs
async function insertContent(article, source) {
  // Supabase REST API로 INSERT
  body: JSON.stringify({
    title: article.title,
    body_md: `원본: ${article.url}\n\n출처: ${source.name}\n\n(한국어 요약 필요)`,
    status: "draft",
    type: "education",
    category: source.category,
    tags: source.tags,
    source_ref: article.url,
    source_type: "crawl",
    // ← ai_summary, importance_score, key_topics, curation_status 없음
  })
}
```

### youtube_subtitle_collector.mjs — saveToContents() (현재)
```js
// 위치: ~/.openclaw/workspace/scripts/youtube_subtitle_collector.mjs
async function saveToContents(video, subtitleText) {
  body: JSON.stringify({
    title: `YouTube: ${video.channelName} - ${video.title}`,
    body_md: `Channel: ${video.channelName}\nDate: ${video.published}\nSource: ${videoUrl}\n\n${subtitleText.substring(0, 55000)}`,
    status: "draft",
    type: "education",
    source_type: "youtube",
    source_ref: `youtube:${video.videoId}`,
    tags: ["youtube", ...],
    embedding_status: "pending",
    // ← ai_summary, importance_score, key_topics, curation_status 없음
  })
}
```

### admin/content/page.tsx — 탭 구조 (현재)
```tsx
// 위치: src/app/(main)/admin/content/page.tsx
<Tabs defaultValue="contents">
  <TabsList variant="line">
    <TabsTrigger value="contents">콘텐츠</TabsTrigger>
    <TabsTrigger value="posts">정보공유</TabsTrigger>
    <TabsTrigger value="email">이메일</TabsTrigger>
  </TabsList>
  // ← "큐레이션" 탭 없음. 첫 번째 탭으로 추가 필요
</Tabs>
```

### embed-pipeline.ts — embedContentToChunks() (현재)
```ts
// 위치: src/actions/embed-pipeline.ts
export async function embedContentToChunks(contentId: string): Promise<EmbedResult> {
  // 1. contents에서 id, title, body_md, source_type, source_ref 조회
  // 2. getPriority(sourceType) → priority 매핑
  // 3. chunkText(bodyMd) → chunks 분할
  // 4. generateEmbedding(chunk) → Gemini 768d
  // 5. knowledge_chunks INSERT (lecture_name, week=sourceType, embedding, source_type, priority, content_id)
  // 6. contents.embedding_status = 'completed'
}

function getPriority(sourceType: string | null): number {
  switch (sourceType) {
    case "lecture": case "blueprint": case "papers": return 1;
    case "qa": case "feedback": return 2;
    case "crawl": case "marketing_theory": case "webinar": return 3;
    case "meeting": case "youtube": return 4;
    case "assignment": return 5;
    default: return 3;
  }
  // ← "info_share" 없음. priority 2로 추가 필요
}
```

### posts.ts — getPosts() (현재)
```ts
// 위치: src/actions/posts.ts
// 정보공유 페이지(/posts)에서 사용. contents 테이블에서 status='published' 조회.
// 현재 crawl 96개는 status='draft'이라 안 보임 → OK
// 큐레이션 통과 → published 하면 자연스럽게 표시됨
let query = supabase.from("contents").select("*", { count: "exact" })
  .eq("status", "published")
  .order("is_pinned", { ascending: false })
  .order("published_at", { ascending: false, nullsFirst: false });
```

### Anthropic API 호출 패턴 (knowledge.ts 참고)
```ts
// 위치: src/lib/knowledge.ts
const API_URL = "https://api.anthropic.com/v1/messages";
const key = process.env.ANTHROPIC_API_KEY; // .env.local에 존재
// model: "claude-sonnet-4-6" 사용 가능
// fetch(API_URL, { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: ... })
```

### Gemini API 호출 패턴 (summarize/route.ts 참고)
```ts
// 위치: src/app/api/admin/content/summarize/route.ts
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // .env.local에 존재
const GENERATION_MODEL = "gemini-2.0-flash";
// fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, ...)
```

### Content 타입 (현재)
```ts
// 위치: src/types/content.ts
export interface Content {
  id: string; title: string; body_md: string; summary: string | null;
  type: ContentType; category: ContentCategory; tags: string[];
  status: 'draft' | 'review' | 'ready' | 'published' | 'archived';
  source_type: string | null; source_ref: string | null;
  embedding_status: string | null; chunks_count: number | null;
  view_count: number; created_at: string; updated_at: string;
  // ... email 관련 필드들 ...
  // ← ai_summary, importance_score, key_topics, curation_status 없음
}
```

## 제약
- **Gemini Flash** — 큐레이션 분석(요약+중요도+키워드)에만 사용. model: `gemini-2.0-flash`
- **Sonnet 4.6** — 정보공유 최종 글 생성에만 사용. model: `claude-sonnet-4-6`
- **Gemini Embedding** — 벡터 임베딩은 기존 파이프라인(768d) 유지
- **기존 콘텐츠 탭/정보공유 탭/이메일 탭 동작 유지** — 깨지면 안 됨
- **정보공유(/posts)에는 curation_status='published'인 것만** — draft 96개 절대 노출 금지
- **수집 스크립트는 `~/.openclaw/workspace/scripts/`에 위치** — qa-helpdesk 레포 밖
- **슬랙 알림은 #비서채널(C0ADQEF21T4)** — 수집 스크립트에서 직접 보내지 않음 (크론이 처리)
- **기존 getPosts() 쿼리 수정 금지** — status='published'로만 필터하면 큐레이션 통과한 것만 보임
- **body_md 필드 하나로 관리** — 원문 보관은 별도 필드 or 정보공유 생성 시 새 contents 행 생성

## 태스크

### T0. DB 마이그레이션 → backend-dev
- 파일: `supabase/migrations/00023_content_curation.sql`
- 의존: 없음
- 완료 기준:
  - [ ] `contents` 테이블에 `ai_summary TEXT` 컬럼 추가
  - [ ] `contents` 테이블에 `importance_score INT DEFAULT 0` 컬럼 추가
  - [ ] `contents` 테이블에 `key_topics TEXT[] DEFAULT '{}'` 컬럼 추가
  - [ ] `contents` 테이블에 `curation_status TEXT DEFAULT 'new'` 컬럼 추가
  - [ ] `curation_status` CHECK 제약: `new`, `selected`, `dismissed`, `published`
  - [ ] `importance_score` CHECK 제약: 0~5 (0은 미분석)
  - [ ] 인덱스: `idx_contents_curation_status ON contents(curation_status)`
  - [ ] 인덱스: `idx_contents_importance ON contents(importance_score DESC)`
  - [ ] 기존 crawl/youtube 96+14개 데이터에 `curation_status = 'new'` 설정 (UPDATE)
  - [ ] `getPriority()` 함수에 `info_share` → priority 2 추가할 수 있도록 DB 준비

### T1. Content 타입 + 큐레이션 Server Actions → backend-dev
- 파일: `src/types/content.ts`, `src/actions/curation.ts` (신규 — contents.ts 1224줄이라 분리)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `Content` 인터페이스에 `ai_summary`, `importance_score`, `key_topics`, `curation_status` 추가
  - [ ] `getCurationContents()` 신규 함수: curation_status='new' 기준 조회, 일별 그룹핑, 필터(소스/중요도/기간) 지원
  - [ ] `updateCurationStatus(id, status)` 신규 함수: curation_status 변경 (selected/dismissed)
  - [ ] `batchUpdateCurationStatus(ids[], status)` 신규 함수: 다건 일괄 변경
  - [ ] 모든 함수에 `requireAdmin()` 인증 적용 (contents.ts의 requireAdmin 패턴 참고)
  - [ ] **별도 파일 `src/actions/curation.ts`로 생성** (C-01: contents.ts 1224줄 거대 파일 분리)

### T2. 큐레이션 탭 UI → frontend-dev
- 파일: `src/app/(main)/admin/content/page.tsx`, `src/components/curation/` (신규 디렉토리)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] 기존 탭 순서 변경: **큐레이션** | 콘텐츠 | 정보공유 | 이메일
  - [ ] `CurationTab` 컴포넌트: 큐레이션 인박스 메인 UI
  - [ ] `CurationCard` 컴포넌트: 개별 콘텐츠 카드 — 제목, AI 요약, 중요도(★), 소스, 시간, 키워드 태그, 체크박스
  - [ ] 일별 그룹핑: 오늘/어제/이번 주/그 이전으로 날짜 헤더 구분
  - [ ] 중요도 ★ 표시: 1~5 별점 시각화 (색상 구분: 5=빨강, 4=주황, 3=파랑, 2=보라, 1=회색)
  - [ ] 필터: 소스별(전체/블로그/YouTube), 중요도별(전체/3+/4+/5), 기간별(오늘/이번 주/전체)
  - [ ] 체크박스 다중 선택 → 상단 "정보공유 생성" 버튼 활성화
  - [ ] "일괄 스킵" 버튼: 선택한 것 dismissed 처리
  - [ ] 빈 상태: "새로운 콘텐츠가 없습니다" 메시지
  - [ ] 미확인 건수 배지 표시 (큐레이션 탭 레이블에)
  - [ ] 기존 콘텐츠/정보공유/이메일 탭 동작 영향 없음

### T3. 정보공유 생성 API → backend-dev
- 파일: `src/app/api/admin/curation/generate/route.ts` (신규)
- 의존: T0, T1 완료 후
- 완료 기준:
  - [ ] `POST /api/admin/curation/generate` 엔드포인트
  - [ ] Request: `{ contentIds: string[] }` (1~4개)
  - [ ] Anthropic API **직접 호출** (`claude-sonnet-4-6`) — knowledge.ts의 generate() 사용하지 않음 (RAG 검색 불필요)
  - [ ] 프롬프트에 정보공유 글쓰기 템플릿 포함:
    - 한국어 ~해요 말투
    - 훅 1줄 (질문 또는 인사이트)
    - "## 핵심 포인트" 헤더 후 핵심 3개 (각 2~3줄)
    - 실무 적용 팁 1개
    - 한국어 제목 자동 생성
    - 원문 출처 표기
  - [ ] 단건 (1개): 해당 콘텐츠 body_md를 입력으로 정보공유 생성
  - [ ] 묶음 (2~4개): 여러 콘텐츠를 묶어 "이번 주 핵심 뉴스" 형태로 생성
  - [ ] Response: `{ title: string, body_md: string, sourceContents: string[] }`
  - [ ] 관리자 인증 필수 (`requireAdmin()` 또는 쿠키 인증)
  - [ ] `maxDuration = 60` (Sonnet 호출 대기)
  - [ ] env: `ANTHROPIC_API_KEY` (이미 .env.local에 존재)

### T4. 정보공유 미리보기 + 게시 UI → frontend-dev
- 파일: `src/components/curation/generate-preview-modal.tsx` (신규)
- 의존: T2, T3 완료 후
- 완료 기준:
  - [ ] 모달(Dialog) UI: Sonnet이 생성한 정보공유 미리보기
  - [ ] 제목 + 본문 표시 (마크다운 렌더링)
  - [ ] 제목/본문 인라인 수정 가능 (textarea or TipTap)
  - [ ] 카테고리 선택 드롭다운 (기본: education)
  - [ ] "게시" 버튼 클릭 시:
    1. 새 contents 행 INSERT (title, body_md=Sonnet가공본, status='published', source_type='info_share', category='education', curation_status='published', published_at=now, source_ref=원본content.id)
    2. 원본 contents의 curation_status → 'published'로 업데이트 (묶음인 경우 모든 원본)
    3. 자동 임베딩 트리거 (T5의 embedContentToChunks 호출)
  - [ ] "취소" 버튼: 모달 닫기 (변경 없음)
  - [ ] 로딩 상태: Sonnet 호출 중 스피너 표시
  - [ ] 에러 상태: "생성 실패" 토스트

### T5. 임베딩 파이프라인 확장 → backend-dev
- 파일: `src/actions/embed-pipeline.ts`
- 의존: T0 완료 후 (T4와 병렬 가능)
- 완료 기준:
  - [ ] `getPriority()` 함수에 `case "info_share": return 2;` 추가
  - [ ] `src/lib/knowledge.ts`의 SourceType 타입에 `'info_share'` 추가 (C-08)
  - [ ] 정보공유 게시 후 자동 임베딩 함수: `embedInfoShare(contentId: string)`
    - `embedContentToChunks(contentId)` 래핑 + source_type 확인
    - knowledge_chunks INSERT 시 source_type='info_share', priority=2
  - [ ] 게시 액션에서 임베딩 자동 호출 연결
    - T4의 "게시" 로직에서 contents INSERT 후 `embedContentToChunks(newContentId)` 호출
  - [ ] 임베딩 실패해도 게시는 성공 처리 (fire-and-forget, 에러 로그만)

### T6. 정보공유 탭 빌드아웃 → frontend-dev
- 파일: `src/app/(main)/admin/content/page.tsx` (정보공유 TabsContent 부분)
- 의존: T4 완료 후
- 완료 기준:
  - [ ] 기존 빈 placeholder 대체
  - [ ] curation_status='published'이고 source_type='info_share'인 콘텐츠만 표시
  - [ ] 테이블 컬럼: 제목, 카테고리, 조회수, 임베딩 상태, 게시일
  - [ ] 행 클릭 → 기존 `/admin/content/[id]` 상세 페이지로 이동
  - [ ] 빈 상태: "게시된 정보공유가 없습니다" 메시지

### T7. 수집 스크립트 Gemini Flash 분석 통합 → backend-dev
- 파일: `~/.openclaw/workspace/scripts/content_crawler.mjs`, `~/.openclaw/workspace/scripts/youtube_subtitle_collector.mjs`
- 의존: T0 완료 후 (독립 실행 가능)
- 완료 기준:
  - [ ] `analyzeWithGemini(title, bodyMd)` 공통 함수 생성:
    - Gemini Flash (`gemini-2.0-flash`) 호출
    - 입력: 콘텐츠 제목 + 본문
    - 출력: `{ ai_summary: string, importance_score: number, key_topics: string[] }`
    - 프롬프트: "자사몰 운영자가 메타 광고 실무에 바로 쓸 수 있는가?" 관점으로 분석
    - 중요도 기준: 5=메타광고핵심변경, 4=실무인사이트, 3=트렌드, 2=간접관련, 1=무관
    - JSON 응답 파싱 (responseSchema 또는 JSON 추출)
    - GEMINI_API_KEY는 스크립트 상단 상수로 (기존 패턴 유지)
  - [ ] `content_crawler.mjs` — insertContent()에 분석 결과 추가:
    - 크롤링 후 `analyzeWithGemini(title, bodyText)` 호출
    - INSERT 시 ai_summary, importance_score, key_topics, curation_status='new' 포함
  - [ ] `youtube_subtitle_collector.mjs` — saveToContents()에 분석 결과 추가:
    - 자막 수집 후 `analyzeWithGemini(title, transcript)` 호출
    - INSERT 시 ai_summary, importance_score, key_topics, curation_status='new' 포함
  - [ ] Gemini 호출 실패 시 분석 없이 저장 (ai_summary=null, importance_score=0, curation_status='new')
  - [ ] rate limit 대비: 건당 1초 딜레이

### T8. 기존 콘텐츠 소급 분석 스크립트 → backend-dev
- 파일: `~/.openclaw/workspace/scripts/backfill_curation_analysis.mjs` (신규)
- 의존: T0, T7 완료 후
- 완료 기준:
  - [ ] contents 테이블에서 ai_summary IS NULL인 행 조회
  - [ ] Gemini Flash로 각각 분석 (analyzeWithGemini 재사용)
  - [ ] 분석 결과로 UPDATE (ai_summary, importance_score, key_topics, curation_status='new')
  - [ ] 진행률 로그 출력 ("5/96 분석 완료...")
  - [ ] rate limit: 건당 2초 딜레이
  - [ ] 일회성 실행 스크립트 (node backfill_curation_analysis.mjs)

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| Gemini Flash 분석 실패 (API 에러) | ai_summary=null, importance_score=0으로 저장. 큐레이션에서는 "분석 실패" 배지 표시 |
| Sonnet 4.6 정보공유 생성 실패 | 에러 토스트 표시. 재시도 버튼. 원본 curation_status 변경 없음 |
| body_md가 비어있는 콘텐츠 | 분석 스킵. importance_score=0. 큐레이션에서 "내용 없음" 표시 |
| 같은 콘텐츠로 정보공유 중복 생성 | 허용 (다른 관점으로 가공 가능). 원본의 curation_status는 이미 published |
| 임베딩 실패 (Gemini Embedding 에러) | 정보공유 게시는 성공. embedding_status='failed'. 관리자 알림 |
| 4개 초과 묶음 선택 | 클라이언트에서 4개 제한. 초과 시 토스트 "최대 4개까지 선택 가능" |
| 정보공유 생성 중 페이지 이탈 | 모달 닫기 경고 (unsaved changes). API 호출은 서버에서 완료 |
| 큐레이션 탭에서 이미 dismissed된 콘텐츠 | 기본 필터에서 숨김. "전체 보기" 필터로 확인 가능 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-21-content-curation.html
- 리뷰 일시: 2026-02-21 11:44
- 변경 유형: 혼합 (DB + API + UI + 외부 스크립트)
- 피드백 요약: 우려사항 C-01~C-08. 핵심: (1) contents.ts→curation.ts 분리, (2) page.tsx→컴포넌트 분리, (3) 원본-정보공유 관계 추적(source_ref에 원본ID), (4) Sonnet 직접 호출, (5) 외부 스크립트는 마지막, (6) category='education' 기본값, (7) info_share SourceType 추가
- 반영 여부: 전부 반영함 — T1 curation.ts 분리, T3 직접 호출, T4 source_ref 원본ID, T5 SourceType 추가

## 검증
☐ `npm run build` 성공
☐ 기존 콘텐츠 탭 정상 동작 (필터, 목록, 상세)
☐ 기존 정보공유(/posts) 페이지 정상 동작 (크롤링 96개 안 보임)
☐ 기존 이메일 탭 정상 동작
☐ 큐레이션 탭: admin 로그인 → /admin/content → 큐레이션 탭 → 수집된 콘텐츠 목록 표시
☐ 큐레이션 카드: 제목 + AI 요약 + ★ 중요도 + 소스 + 키워드 태그 표시
☐ 일별 그룹핑: 오늘/어제 날짜 헤더로 구분
☐ 필터: 중요도 4+ 필터 → ★4, ★5만 표시
☐ 선택 + 정보공유 생성: 2개 체크 → "정보공유 생성" → Sonnet이 한국어 글 생성 → 미리보기 표시
☐ 게시: 미리보기에서 "게시" → 정보공유 탭에 표시 + knowledge_chunks에 임베딩 행 생성
☐ 임베딩 확인: knowledge_chunks에 source_type='info_share', priority=2인 행 존재
☐ 스킵: 콘텐츠 스킵 → curation_status='dismissed' → 기본 목록에서 숨김
☐ 수집 스크립트: `node content_crawler.mjs` 실행 → 새 콘텐츠에 ai_summary + importance_score 채워짐
☐ 소급 분석: `node backfill_curation_analysis.mjs` → 기존 콘텐츠에 분석 결과 채워짐
