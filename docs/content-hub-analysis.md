# 콘텐츠 관리 허브 구조 분석

> 분석일: 2026-03-13
> 목적: 오가닉 채널 독립 메뉴 추가를 위한 기존 구조 파악

---

## 1. 의존성 맵 (탭 → 컴포넌트 → 액션 → API → DB)

### 진입점
`src/app/(main)/admin/content/page.tsx` — 4개 탭 Hub (쿼리파라미터 `?tab=`)

```
콘텐츠 관리 (AdminContentPage)
├── 큐레이션 탭 (tab=curation)
│   ├── PipelineSidebar ─────────────── getPipelineStats(), getCurationSummaryStats()
│   │                                    └── DB: contents (source_type별 집계), knowledge_chunks (source_type별 집계)
│   ├── CurriculumView (blueprint/lecture) ── getCurriculumContents()
│   │   └── CurriculumItem                    └── DB: contents (source_type=blueprint|lecture)
│   ├── CurationView (그 외 소스) ──── getCurationContents(), getCurationStatusCounts()
│   │   ├── CurationTab                       batchUpdateCurationStatus(), softDeleteContents()
│   │   │   └── CurationCard                  └── DB: contents, content_relations
│   │   ├── TopicMapView
│   │   │   └── CurationCard
│   │   └── DeletedSection ────────── getDeletedContents(), restoreContents()
│   │                                 └── DB: contents (deleted_at IS NOT NULL)
│   └── GeneratePreviewModal ───────── POST /api/admin/curation/generate
│       └── createInfoShareDraft() ──── embedContentToChunks() (after)
│                                        └── DB: contents (INSERT), content_relations (INSERT), knowledge_chunks (INSERT)
│
├── 콘텐츠 탭 (tab=contents)
│   ├── 통계 카드 (전체/게시완료/초안/발송됨)
│   ├── 필터 (소스/유형/상태)
│   ├── 테이블 (클릭 → /admin/content/[id])
│   └── NewContentModal ────────────── createContent()
│   └── 데이터: getContents() ──────── DB: contents
│
├── 정보공유 탭 (tab=posts)
│   └── InfoShareTab ──────────────── getInfoShareContents()
│                                      └── DB: contents (source_type=info_share, curation_status IN [published, selected])
│
└── 이메일 탭 (tab=email)
    └── 미구현 (Phase D 예정)
```

---

## 2. 컴포넌트 상세 매핑

### `src/components/curation/` (9개 파일)

| 파일 | 용도 | 의존 액션 | 의존 타입 |
|------|------|-----------|-----------|
| `pipeline-sidebar.tsx` | 소스별 학습 파이프라인 현황 사이드바 | `getPipelineStats()`, `getCurationSummaryStats()` | `PipelineStat` |
| `curriculum-view.tsx` | blueprint/lecture 커리큘럼 트리뷰 | `getCurriculumContents()` | `Content` |
| `curation-view.tsx` | 큐레이션 인박스/토픽맵 뷰 + 필터 + 벌크 액션 | `getCurationContents()`, `getCurationStatusCounts()`, `batchUpdateCurationStatus()`, `softDeleteContents()` | `CurationContentWithLinks`, `CurationStatusCounts` |
| `curation-tab.tsx` | 날짜별 그룹 리스트 (인박스 모드) | - (props 전달) | `CurationContentWithLinks` |
| `curation-card.tsx` | 개별 큐레이션 카드 (AI요약, 중요도, 토픽) | - (props 전달) | `LinkedInfoShare` |
| `topic-map-view.tsx` | 토픽별 그룹 뷰 | - (props 전달) | `CurationContentWithLinks` |
| `info-share-tab.tsx` | 정보공유 게시 목록 테이블 | `getInfoShareContents()` | `Content` |
| `generate-preview-modal.tsx` | AI 정보공유 생성 프리뷰+편집 모달 | `POST /api/admin/curation/generate`, `createInfoShareDraft()` | - |
| `deleted-section.tsx` | 소프트 삭제 콘텐츠 복원 UI | `getDeletedContents()`, `restoreContents()` | - |

---

## 3. Server Actions 상세

### `src/actions/curation.ts`

| 함수 | 용도 | DB 테이블 | 비고 |
|------|------|-----------|------|
| `getCurationContents()` | 큐레이션 대상 콘텐츠 조회 (소스/상태/기간/중요도 필터) | `contents`, `content_relations` | `info_share` 제외 |
| `getCurationCount()` | 신규+선택됨 건수 (탭 뱃지) | `contents` | |
| `getCurationStatusCounts()` | 상태별 카운트 (전체/신규/선택/스킵/발행) | `contents` | |
| `updateCurationStatus()` | 단건 상태 변경 | `contents` | |
| `batchUpdateCurationStatus()` | 벌크 상태 변경 | `contents` | |
| `createInfoShareDraft()` | 정보공유 초안 생성 + 관계 기록 + 자동 임베딩 | `contents`, `content_relations` | `after()` 비동기 임베딩 |
| `getInfoShareContents()` | 정보공유 콘텐츠 목록 | `contents` | source_type=info_share |
| `getPipelineStats()` | 소스별 콘텐츠/청크 통계 | `contents`, `knowledge_chunks` | |
| `getCurriculumContents()` | blueprint/lecture 콘텐츠 | `contents` | |
| `getCurationSummaryStats()` | AI 요약 완료/미처리 통계 | `contents` | |
| `softDeleteContents()` | 소프트 삭제 (deleted_at 설정) | `contents` | |
| `restoreContents()` | 삭제 복원 | `contents` | |
| `getDeletedContents()` | 삭제된 콘텐츠 조회 | `contents` | |
| `backfillAiSummary()` | AI 요약 일괄 생성 | `contents` | Gemini Flash |
| `backfillImportanceScore()` | 중요도 점수 일괄 생성 | `contents` | Gemini Flash |

### `src/actions/contents.ts`

| 함수 | 용도 | DB 테이블 | 비고 |
|------|------|-----------|------|
| `getContents()` | 콘텐츠 목록 (유형/상태/소스 필터) | `contents` | 콘텐츠 탭 기본 데이터 |
| `getContentById()` | 단건 조회 | `contents` | 상세 페이지 |
| `createContent()` | 콘텐츠 생성 (수동/AI) | `contents` | 자동 임베딩 (특정 source_type) |
| `updateContent()` | 콘텐츠 수정 | `contents` | |
| `deleteContent()` | 하드 삭제 + FK 정리 | `contents`, `knowledge_chunks`, `email_logs`, `email_sends` | |
| `publishContent()` | 게시 + distribution 기록 | `contents`, `distributions` | |
| `generateNewsletterFromContents()` | 뉴스레터 HTML 생성 | `contents` | 이메일 발송용 |
| `getContentAsEmailHtml()` | 이메일 HTML 변환 | `contents` | |
| `updateContentEmailSentAt()` | 발송 시각 기록 | `contents` | |
| `embedContent()` | 단건 임베딩 (레거시) | `contents` | |
| `embedAllContents()` | 전체 임베딩 (레거시) | `contents` | |
| `crawlUrl()` | URL 크롤링 → 마크다운 변환 | - | cheerio + turndown |
| `generateEmailSummary()` | 뉴스레터 이메일 요약 AI 생성 (JSON+Zod) | `contents` | KS (knowledge.ts) 호출 |
| `reviseContentWithAI()` | AI 본문/이메일 수정 | `contents` | KS 호출 |
| `generateContentWithAI()` | AI 콘텐츠 생성 | - | KS 호출 |

### `src/actions/embed-pipeline.ts`

| 함수 | 용도 | DB 테이블 | 비고 |
|------|------|-----------|------|
| `embedContentToChunks()` | 콘텐츠 → 청크 분할 → Gemini 임베딩 → INSERT | `contents`, `knowledge_chunks` | blueprint는 기존 chunks 연결만 |
| `embedAllPending()` | 대기중 전체 임베딩 | `contents`, `knowledge_chunks` | |

---

## 4. API 엔드포인트 목록

| 경로 | Method | 용도 | 인증 | 호출 액션/라이브러리 |
|------|--------|------|------|---------------------|
| `/api/admin/curation/generate` | POST | AI 정보공유 생성 (Opus) | admin/assistant | `searchChunks()`, Anthropic API 직접 호출 |
| `/api/admin/curation/backfill` | POST | AI 요약/중요도 일괄 생성 | admin | `backfillAiSummary()`, `backfillImportanceScore()` |
| `/api/admin/content/summarize` | POST | 뉴스레터 요약 생성 (Gemini) | admin | Gemini API 직접 호출 |
| `/api/admin/content/[id]/newsletter` | PATCH | 뉴스레터 디자인 JSON/HTML 저장 | admin | Supabase 직접 update |
| `/api/admin/embed` | POST | 개별/전체 임베딩 실행 | admin 또는 서비스키 | `embedContentToChunks()`, `embedAllPending()` |
| `/api/admin/style-learn` | POST | 말투 학습 파이프라인 실행 | admin | `runStyleLearning()` |
| `/api/admin/email/send` | POST | 이메일 발송 | admin | - |
| `/api/admin/email/preview` | POST | 이메일 미리보기 | admin | - |
| `/api/admin/email/upload` | POST | 이메일 이미지 업로드 | admin | - |
| `/api/admin/email/ai-write` | POST | AI 이메일 작성 | admin | - |
| `/api/admin/email/recipients` | GET/POST | 수신자 관리 | admin | - |
| `/api/admin/email/analytics` | GET | 이메일 성과 분석 | admin | - |

---

## 5. DB 테이블 의존성

| 테이블 | 주요 기능 연결 | 핵심 컬럼 |
|--------|---------------|-----------|
| `contents` | 모든 콘텐츠 (큐레이션+정보공유+수동+이메일) | `source_type`, `curation_status`, `status`, `embedding_status`, `deleted_at`, `ai_summary`, `importance_score`, `key_topics`, `email_summary`, `email_design_json` |
| `content_relations` | 큐레이션 소스 → 생성물 연결 | `source_id`, `generated_id` |
| `knowledge_chunks` | RAG 벡터 저장 (임베딩) | `content_id`, `source_type`, `embedding`, `lecture_name`, `priority` |
| `distributions` | 콘텐츠 배포 기록 (게시) | `content_id`, `channel`, `status` |
| `email_logs` | 이메일 발송 로그 | `content_id` |
| `email_sends` | 이메일 발송 기록 | `content_id` |
| `style_profiles` | 말투 학습 프로필 | `profile`, `style_text`, `answer_count` |

### `contents.source_type` 값 분류

| source_type | 분류 | 설명 |
|-------------|------|------|
| `blueprint` | 커리큘럼 소스 | Meta Blueprint 인증 교육 |
| `lecture` | 커리큘럼 소스 | 자사몰사관학교 강의 |
| `crawl` | 큐레이션 소스 | 블로그 크롤링 |
| `youtube` | 큐레이션 소스 | YouTube 콘텐츠 |
| `marketing_theory` | 큐레이션 소스 | 마케팅원론 |
| `webinar` | 큐레이션 소스 | 웨비나 |
| `papers` | 큐레이션 소스 | 논문 |
| `file` | 큐레이션 소스 | 파일 업로드 |
| `info_share` | 생성물 (정보공유) | 큐레이션에서 AI 생성된 콘텐츠 |
| `manual` | 직접 작성 | 관리자 수동 작성 |

### `contents.curation_status` 상태 흐름

```
new → selected → published
 │                   ↑
 └→ dismissed ───→ (되돌리기)
```

---

## 6. 학습 파이프라인 흐름

### 6-1. 커리큘럼 뷰 (curriculum-view + pipeline-sidebar)

```
PipelineSidebar                          CurriculumView
┌─────────────────┐                     ┌──────────────────────┐
│ 커리큘럼 소스    │ ──onSourceSelect──→ │ blueprint/lecture     │
│  ├─ 블루프린트   │                     │ ├─ 레벨별 그룹 정렬   │
│  └─ 사관학교     │                     │ │  ├─ 입문             │
│ 큐레이션 소스    │                     │ │  ├─ 실전             │
│  ├─ 전체         │                     │ │  └─ 분석             │
│  ├─ 블로그       │                     │ ├─ 발행 진행률 바      │
│  ├─ YouTube      │                     │ └─ 순차 발행 (순서 잠금)│
│  └─ 마케팅원론   │                     └──────────────────────┘
│ 통계             │
│  ├─ 전체 건수    │
│  ├─ AI 요약 완료 │
│  └─ 미처리       │
└─────────────────┘
```

**데이터 흐름:**
1. `getPipelineStats()` → `contents` + `knowledge_chunks` source_type별 집계
2. `getCurationSummaryStats()` → AI 요약 완료/미처리 비율
3. `getCurriculumContents(sourceType)` → 해당 소스의 전체 콘텐츠
4. 각 항목의 `curation_status` + `ai_summary` 존재 여부로 발행 상태 판정

### 6-2. 말투 학습 파이프라인 (style-learner)

```
POST /api/admin/style-learn
    │
    ▼
runStyleLearning()
    │
    ├─ 1. analyzeApprovedAnswers(50)
    │      └─ DB: answers (is_approved=true), profiles (admin 판별)
    │      └─ 가중치: admin 직접작성(3) > admin 수정 AI(2) > 일반(1)
    │
    ├─ 2. generateStyleProfile(answers)
    │      └─ Claude Sonnet API → JSON {endings, toneRules, examples}
    │
    ├─ 3. buildStyleText(profile)
    │      └─ [말투] 섹션 텍스트 생성 (QA 시스템 프롬프트에 주입)
    │
    └─ 4. saveStyleProfile(profile, styleText)
           └─ DB: style_profiles (INSERT)
```

**자동 트리거:** 답변 승인 10개마다 자동 실행 (feat: 답변 승인 10개마다 말투 자동 학습 트리거)

### 6-3. 도메인 인텔리전스 (domain-intelligence)

```
사용자 질문 입력
    │
    ▼
analyzeDomain(question)
    │
    ├─ 1. Claude Sonnet → 도메인 분석 JSON
    │      ├─ normalizedTerms: 줄임말/오타 정규화
    │      ├─ intent: 실제 의도 파악
    │      ├─ questionType: lecture/platform/troubleshooting/non_technical
    │      ├─ complexity: simple/medium/complex
    │      └─ suggestedSearchQueries: RAG 검색용 최적화 쿼리
    │
    ├─ 2. 용어 정의 조회
    │      ├─ knowledge_chunks (source_type=glossary) 캐시 확인
    │      └─ 미스 → Brave Search API → glossary 자동 저장
    │
    └─ 3. skipRAG 판정
           ├─ true → directAnswer 반환 (RAG 스킵)
           └─ false → suggestedSearchQueries로 RAG 파이프라인 진행
```

### 6-4. 임베딩 파이프라인 (embed-pipeline)

```
콘텐츠 생성/수정
    │
    ▼
embedContentToChunks(contentId)
    │
    ├─ blueprint? → linkBlueprintChunks() (기존 chunks에 content_id 연결만)
    │
    └─ 그 외 →
        ├─ 1. 기존 chunks 삭제
        ├─ 2. chunkText(body_md) — 700자, 100 overlap
        ├─ 3. Gemini embedding-001로 벡터 생성 (배치 3개, 500ms 딜레이)
        ├─ 4. knowledge_chunks INSERT (source_type, priority, content_id 등)
        └─ 5. contents.embedding_status 갱신 (completed/failed)
```

---

## 7. SWR 키 매핑 (`src/lib/swr/keys.ts`)

| SWR 키 | 호출 함수 | 사용 위치 |
|--------|-----------|-----------|
| `ADMIN_CONTENTS(type, status)` | `getContents()` | 콘텐츠 탭 |
| `ADMIN_CURATION_COUNT` | `getCurationCount()` | 큐레이션 탭 뱃지 |
| `curationContents(source, score, period, status)` | `getCurationContents()` + `getCurationStatusCounts()` | CurationView |
| `curriculumContents(sourceType)` | `getCurriculumContents()` | CurriculumView |
| `PIPELINE_STATS` | `getPipelineStats()` | PipelineSidebar |
| `CURATION_SUMMARY_STATS` | `getCurationSummaryStats()` | PipelineSidebar |
| `deletedContents(source)` | `getDeletedContents()` | DeletedSection |
