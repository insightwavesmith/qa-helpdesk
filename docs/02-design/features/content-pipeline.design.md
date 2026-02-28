# 콘텐츠 파이프라인 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### contents 테이블 (주요 필드)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| title | text | 제목 |
| body_md | text | 마크다운 본문 (정보공유용) |
| summary | text | 요약 |
| thumbnail_url | text | 헤더 이미지 URL |
| category | text | education, notice, case_study, webinar |
| type | text | education, notice, case_study, webinar, promo |
| tags | text[] | 태그 배열 |
| status | text | draft, review, ready, published |
| published_at | timestamptz | 발행 시각 |
| author_id | uuid | 작성자 FK |
| source_type | text | crawled, manual, ai_generated |
| source_ref | text | 원본 참조 (source_url과 별도) |
| source_url | text | 원문 URL |
| source_hash | text | 원본 해시 |
| ai_source | text | 원본 AI 소스 |
| ai_summary | text | AI 요약 |
| email_summary | text | 뉴스레터용 함축 본문 |
| email_subject | text | 이메일 제목 |
| email_sent_at | timestamptz | 발송 시각 |
| email_cta_text | text | CTA 텍스트 |
| email_cta_url | text | CTA URL |
| email_design_json | jsonb | Unlayer 디자인 JSON |
| email_html | text | Unlayer export HTML |
| embedding_status | text | 임베딩 상태 |
| embedded_at | timestamptz | 임베딩 시각 |
| chunks_count | integer | 청크 수 |
| importance_score | integer | 중요도 점수 |
| priority | integer | 우선순위 |
| is_pinned | boolean | 고정 여부 |
| key_topics | text[] | 핵심 토픽 |
| images | jsonb | 이미지 메타 |
| video_url | text | 비디오 URL |
| curation_status | text | 큐레이션 상태 |
| view_count | integer | 조회수 |
| like_count | integer | 좋아요 수 |

> category/type은 DB에서 text 타입 (enum 아님). 코드에서 문자열로 분기.

### leads 테이블
| 필드 | 타입 | 설명 |
|------|------|------|
| email | text | 이메일 |
| name | text | 이름 |
| email_opted_out | boolean | 수신거부 |

### Supabase Storage
- 버킷: `content-images` (public)
- 경로: `headers/{content_id}.png`

## 2. API 설계

### Server Actions (actions/contents.ts)
| 함수명 | 설명 |
|--------|------|
| getContents | 콘텐츠 목록 조회 (필터: type, category, status) |
| createContent | 새 콘텐츠 생성 |
| updateContent | 콘텐츠 수정 |
| deleteContent | 콘텐츠 삭제 |
| generateContentWithAI | AI 콘텐츠 생성 (KnowledgeService 위임) |
| generateEmailSummary | 이메일 요약 생성 (JSON 스키마 + Zod 검증) |
| updateContentEmailSentAt | 발송 시각 기록 |
| getContentAsEmailHtml | 이메일 HTML 변환 |

### 이메일 발송
- `POST /api/admin/email/send` → 뉴스레터 발송 (배치 50건/초)
- 수신 대상: leads + profiles (email_opted_out=false)

### 구독
- `POST /api/subscribe` → leads INSERT
- `GET /unsubscribe?email=...` → email_opted_out=true

## 3. 컴포넌트 구조

### /admin/content (콘텐츠 관리)
```
ContentManagementPage
├── StatusCards (상태별 카운트)
├── FilterBar (타입/카테고리/상태)
├── ContentTable (목록)
└── NewContentDialog
```

### /admin/email (이메일 발송)
```
EmailManagementPage
├── RecipientStats
├── EmailComposer (Unlayer 에디터)
└── SendHistory
```

## 4. 에러 처리
- SMTP 실패 → 재시도 (3회)
- AI 생성 실패 → 3회 재시도 + fallback 매핑 + raw 저장
- 대용량 발송 → 배치 처리 (50건/1초)

## 5. 구현 상태
- [x] contents 테이블 (37 필드)
- [x] 콘텐츠 관리 페이지 UI
- [x] 이메일 발송 (Unlayer HTML)
- [x] 구독/수신거부 API
- [x] AI 콘텐츠 생성 (KnowledgeService 위임)
- [x] 이메일 요약 생성 (JSON 스키마 파이프라인)
