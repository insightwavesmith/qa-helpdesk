# 콘텐츠 허브 UX 리디자인 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### contents 테이블 (현재 구현)
- 37개 필드 (content-pipeline.design.md 참조)
- category/type은 text 타입 (enum 아님)

> 설계 시 제안된 확장 필드 중 미구현:
> - ❌ `display_order` (integer) — 미구현
> - ❌ `ai_prompt` (text) — 미구현
> - ❌ `source_file_url` (text) — 미구현

### email_sends 테이블
> 설계 시 제안된 이메일 성과 트래킹:
> - ❌ `open_count`, `click_count`, `open_rate`, `click_rate` — 미구현
> - 현재 이메일 발송은 일괄 배치 방식 (POST /api/admin/email/send)

## 2. API 설계 (현재 구현)

### Server Actions (actions/contents.ts)
| 함수명 | 설명 |
|--------|------|
| getContents | 목록 조회 (필터: type, category, status, sourceType, 페이지네이션) |
| getContentById | 단건 조회 |
| createContent | 콘텐츠 생성 (자동 임베딩 포함) |
| updateContent | 수정 (email_subject, email_summary, email_cta_text, email_cta_url 포함) |
| deleteContent | 삭제 |
| publishContent | 발행 (status=published + distributions 레코드 생성) |
| generateContentWithAI | AI 콘텐츠 생성 (KnowledgeService 위임) |
| generateEmailSummary | 이메일 요약 생성 (JSON 스키마 파이프라인) |
| getContentAsEmailHtml | 이메일 HTML 변환 |
| updateContentEmailSentAt | 발송 시각 기록 |
| crawlUrl | URL 크롤링 (cheerio + turndown) |
| embedContent | 단건 임베딩 |
| embedAllContents | 미임베딩 전체 배치 |
| generateNewsletterFromContents | 복수 콘텐츠 → 뉴스레터 HTML |

> 설계 시 제안되었으나 미구현:
> - ❌ `POST /api/contents/generate` (3가지 입력 방식) — Server Action으로 대체
> - ❌ `PATCH /api/contents/[id]/reorder` — display_order 미구현
> - ❌ `GET /api/email/stats` — 이메일 성과 API 미구현

## 3. 컴포넌트 구조 (현재 구현)

### /admin/content (콘텐츠 관리)
```
ContentManagementPage
├── StatusCards (상태별 카운트)
├── FilterBar (타입/카테고리/상태)
├── ContentTable (목록)
└── NewContentDialog
```

### /admin/content/[id] (상세 편집)
```
ContentDetailPage
├── MDXEditor (정보공유 마크다운 WYSIWYG)
├── Sidebar (썸네일/게시정보)
└── 뉴스레터 탭 (email_summary 편집)
```

> 설계 시 제안되었으나 미구현:
> - ❌ HubTabs (콘텐츠 | 정보공유 | 이메일) 3탭 구조
> - ❌ PostsManagePanel (DraggablePostList, 드래그 순서 변경)
> - ❌ EmailManagePanel (발송 이력 + 성과 차트)
> - ❌ EmailStats (오픈율/클릭률 추이)
> - ❌ ContentSettingsPanel (별도 설정 탭)

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| AI 생성 실패 | 3회 재시도 + fallback |
| URL fetch 실패 | 에러 메시지 표시 |
| 이미지 생성 실패 | 기본 그라데이션 fallback |

## 5. 구현 상태

### 구현 완료
- [x] 콘텐츠 CRUD (Server Actions)
- [x] AI 콘텐츠 생성 (KnowledgeService 위임)
- [x] 이메일 요약 생성 (JSON 스키마 파이프라인)
- [x] MDXEditor 마크다운 에디터
- [x] 콘텐츠 상세 편집 페이지 (/admin/content/[id])
- [x] 이메일 발송 (배치 50건/초)
- [x] URL 크롤링 (cheerio + turndown)
- [x] 자동 임베딩 (createContent 후 hook)

### 미구현 (Phase C~E)
- [ ] 정보공유 관리 탭 (PostsManagePanel, 드래그 순서)
- [ ] 이메일 성과 탭 (EmailManagePanel, 오픈/클릭 트래킹)
- [ ] display_order DB 컬럼 + reorder API
- [ ] 이메일 성과 통계 (open_rate, click_rate)
- [ ] @dnd-kit 드래그 앤 드롭

## 6. 패키지 (현재)
- `@mdxeditor/editor` — 마크다운 WYSIWYG (설치됨)
- `@dnd-kit/core` + `@dnd-kit/sortable` — 미설치
