# 콘텐츠 허브 v2 — UX + 백엔드 설계

> 최종 갱신: 2026-02-28 (코드 기준 현행화)
> 스타일 레퍼런스: 마켓핏랩 블로그 + 뉴스레터
> UX 레퍼런스: Ghost CMS 발행 플로우

---

## 0. 레퍼런스 서비스 분석

### Ghost CMS 패턴 (채택)
- 하나의 글 = 웹 게시 + 이메일
- "Publish" 다이얼로그 → 게시/발송 옵션 선택
- 편집 → 저장 → 발행 분리

### 우리 구현의 차이점
- 정보공유(긴 글) ≠ 뉴스레터(1/5 요약) → 두 버전 필요
- 편집은 2탭 (정보공유/뉴스레터), 발행은 1개 통합 다이얼로그

---

## 1. 핵심 원칙

1. **모찌가 완성본을 만든다** — body_md + email_summary + thumbnail_url 전부 DB에 저장된 상태로 전달
2. **Smith님은 수정만 한다** — 편집 → 저장 → 발행
3. **뉴스레터 ≠ 정보공유 복사** — 뉴스레터는 1/5 분량 요약 + 이메일 템플릿
4. **발행은 하나의 다이얼로그** — Ghost 패턴

---

## 2. 백엔드 데이터 구조

### contents 테이블 (구현 완료 필드)
```
기존 필드:
  id              uuid PK
  title           text NOT NULL
  body_md         text          -- 정보공유 전문 (마크다운)
  summary         text          -- 요약
  category        text          -- education, notice, case_study, webinar (text, enum 아님)
  type            text          -- education, notice, case_study, webinar, promo (text, enum 아님)
  status          text          -- draft, review, ready, published
  thumbnail_url   text          -- 헤더 이미지 URL
  view_count      integer
  author_id       uuid (nullable)

이메일 관련 (구현 완료):
  email_summary   text          -- 뉴스레터 요약본 (마크다운)
  email_subject   text          -- 이메일 제목
  email_sent_at   timestamptz   -- 마지막 발송 시간
  email_cta_text  text          -- CTA 버튼 텍스트
  email_cta_url   text          -- CTA URL
  email_design_json jsonb       -- Unlayer 디자인 JSON
  email_html      text          -- Unlayer export HTML
```

> 설계 시 제안되었으나 미구현:
> - ❌ `email_status` (text) — unsent/sending/sent 상태 관리 미구현
> - ❌ `email_sent_count` (integer) — 발송 수신자 수 미구현

### 핵심: 별도 테이블 불필요
- contents 1개 레코드 = 정보공유 글 1개 + 뉴스레터 1통
- body_md = 정보공유 전문, email_summary = 뉴스레터 요약

---

## 3. API 엔드포인트

### 구현 완료 (Server Actions)
```
getContents(filters)           -- 목록
getContentById(id)             -- 상세
createContent(input)           -- 생성
updateContent(id, input)       -- 수정 (email_summary, email_subject, email_cta_* 포함)
deleteContent(id)              -- 삭제
publishContent(id)             -- 발행 (status=published + distributions 레코드)
generateContentWithAI(...)     -- AI 생성 (KnowledgeService 위임)
generateEmailSummary(...)      -- AI 요약 (JSON 스키마 파이프라인)
getContentAsEmailHtml(id)      -- 이메일 HTML 변환
crawlUrl(url)                  -- URL 크롤링
```

### 이메일 발송
```
POST /api/admin/email/send     -- 뉴스레터 일괄 발송 (배치 50건/초)
```

> 설계 시 제안되었으나 미구현:
> - ❌ `POST /api/admin/contents/[id]/email/send` — 콘텐츠별 발송 라우트
> - ❌ `POST /api/admin/contents/[id]/email/test` — 테스트 발송 라우트
> - ❌ `POST /api/admin/contents/[id]/email/summary` — AI 요약 라우트 (Server Action으로 대체)

---

## 4. 이메일 템플릿 구조

마켓핏랩 스티비 레퍼런스 기반:
1. 브랜드 헤더 (BS CAMP 로고, #F75D5D 배경)
2. 제목 (email_subject)
3. 요약 본문 (email_summary → 마크다운 렌더링)
4. CTA 버튼 (email_cta_text, email_cta_url)
5. 푸터 (수신거부 링크)

### email_summary 작성 가이드
- 분량: 정보공유 전문의 1/5 ~ 1/3
- 구조: 훅/인트로 → 핵심 포인트 3-5개 → CTA 유도
- ~해요 톤 유지

---

## 5. UX 상세 설계

### 5-1. 콘텐츠 목록 (/admin/content)
- StatusCards (상태별 카운트)
- FilterBar (타입/카테고리/상태)
- ContentTable (행 클릭 → 상세 편집)

### 5-2. 정보공유 탭 (상세 편집)
- MDXEditor (마크다운 WYSIWYG — 편집 = 렌더링)
- Sidebar (썸네일, 게시정보, 뉴스레터 상태)
- 저장/발행 분리

### 5-3. 뉴스레터 탭 (상세 편집)
- email_summary 마크다운 에디터
- AI 요약 생성 + "정보공유에서 가져오기" 버튼
- 이메일 미리보기 (템플릿 실시간 렌더링)

### 5-4. 발행 다이얼로그 (Ghost 패턴)
- 정보공유 게시 체크 + 이메일 발송 체크
- email_summary 비어있으면 발송 비활성화

---

## 6. 버그 수정 이력

| # | 버그 | 상태 |
|---|------|------|
| B1 | 저장 버튼 항상 disabled | 수정 완료 (isDirty 구현) |
| B2 | 게시완료/임시저장 버튼 없음 | 수정 완료 |
| B3 | 새 콘텐츠 생성 실패 | 수정 완료 |
| B4 | 뉴스레터 전문 복사 | 수정 완료 (AI 요약 호출로 변경) |
| B5 | 이메일 템플릿 미표시 | 수정 완료 |
| B7 | email_summary 컬럼 없음 | 수정 완료 (마이그레이션 적용) |

---

## 7. 구현 상태

### 구현 완료
- [x] DB 마이그레이션 (email_summary, email_subject, email_cta_*)
- [x] 콘텐츠 CRUD Server Actions
- [x] 정보공유 탭 (MDXEditor + isDirty 변경 감지)
- [x] 뉴스레터 탭 (email_summary 로드/저장 + AI 요약)
- [x] 이메일 템플릿 렌더링 (브랜드 헤더 + CTA + 수신거부)
- [x] 이메일 미리보기
- [x] URL 크롤링 (cheerio + turndown → 마크다운 변환)
- [x] AI 콘텐츠 생성 (KnowledgeService 5종 타입 프롬프트)
- [x] 이메일 일괄 발송 (배치 50건/초)

### 미구현
- [ ] email_status (unsent/sending/sent) 상태 관리
- [ ] email_sent_count (발송 수신자 수) 추적
- [ ] 콘텐츠별 발송 API 라우트 (/api/admin/contents/[id]/email/*)
- [ ] 테스트 발송 라우트
- [ ] 이메일 성과 트래킹 (오픈/클릭)
- [ ] 자동 저장 (현재 명시적 저장만)
- [ ] 발송 대상 세분화 (현재 전체만)

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `createContent({ title, body_md, ... })` | 유효한 콘텐츠 입력 | `{ id: "uuid", status: "draft" }` | 기본 상태 draft로 생성 |
| `updateContent(id, { email_summary, email_subject })` | 이메일 관련 필드 업데이트 | 업데이트된 콘텐츠 | email_summary, email_subject 저장 확인 |
| `publishContent(id)` | status="ready"인 콘텐츠 | `status: "published"` + distributions 레코드 생성 | 발행 상태 전환 + 배포 레코드 |
| `generateEmailSummary(body_md)` | 긴 마크다운 본문 (5000자) | 1/5~1/3 분량 요약 | 요약 분량 적정성 |
| `getContentAsEmailHtml(id)` | email_summary가 있는 콘텐츠 | HTML 문자열 (브랜드 헤더 + CTA + 푸터) | 이메일 템플릿 구조 |
| `crawlUrl(url)` | 유효한 URL | `{ title, body_md }` (마크다운 변환) | cheerio + turndown 파이프라인 |
| `getContents({ status: "published" })` | 필터 조건 | published 상태 콘텐츠 배열 | 상태 필터 동작 |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | email_summary 비어있을 때 발행 | email_summary=null + 이메일 발송 체크 | 이메일 발송 비활성화 (정보공유만 게시) | P0 |
| E2 | body_md 비어있을 때 AI 요약 | body_md="" | 에러 반환 (요약 대상 없음) | P1 |
| E3 | 이메일 일괄 발송 중 부분 실패 | 50건 배치 중 5건 실패 | 성공 건 정상 전송, 실패 건 로그 기록 | P0 |
| E4 | URL 크롤링 실패 | 존재하지 않는 URL / 타임아웃 | 에러 메시지 반환 (크롤링 실패) | P1 |
| E5 | 콘텐츠 동시 편집 | 2명이 동일 콘텐츠 동시 수정 | 마지막 저장 우선 (last-write-wins) | P2 |
| E6 | email_design_json 파싱 실패 | 잘못된 Unlayer JSON | 기본 템플릿으로 fallback | P1 |
| E7 | 이미지 URL 만료 (thumbnail_url) | GCS signed URL 만료 | 기본 썸네일 표시 또는 빈 상태 | P2 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: content_full — 콘텐츠 전체 필드
{
  "id": "content-uuid-001",
  "title": "메타 광고 A/B 테스트 완벽 가이드",
  "body_md": "# A/B 테스트란?\n\nA/B 테스트는 두 가지 버전의 광고를 비교하여...\n\n## 설정 방법\n\n1. 캠페인 생성...",
  "summary": "A/B 테스트 설정부터 결과 분석까지",
  "category": "education",
  "type": "education",
  "status": "published",
  "thumbnail_url": "https://storage.googleapis.com/bscamp/thumbnails/ab-test.jpg",
  "view_count": 42,
  "email_summary": "이번 주에는 A/B 테스트의 핵심 포인트를 정리했어요.\n\n1. **변수는 하나만** 변경하세요\n2. **최소 7일** 이상 운영하세요\n3. **통계적 유의성** 확인 후 결정하세요",
  "email_subject": "[BS CAMP] A/B 테스트, 이것만 알면 됩니다",
  "email_cta_text": "전문 읽기",
  "email_cta_url": "https://bscamp.app/posts/content-uuid-001"
}
```

```json
// fixture: email_send_batch — 이메일 발송 배치
{
  "content_id": "content-uuid-001",
  "recipients": [
    { "email": "user1@example.com", "name": "김철수" },
    { "email": "user2@example.com", "name": "이영희" }
  ],
  "batch_size": 50,
  "subject": "[BS CAMP] A/B 테스트, 이것만 알면 됩니다"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `contents.ts` Server Actions | `__tests__/content-hub-v2/contents-actions.test.ts` | vitest |
| 이메일 템플릿 렌더링 | `__tests__/content-hub-v2/email-template.test.ts` | vitest |
| AI 요약 생성 | `__tests__/content-hub-v2/generate-email-summary.test.ts` | vitest |
| URL 크롤링 | `__tests__/content-hub-v2/crawl-url.test.ts` | vitest |
| 이메일 발송 API | `__tests__/content-hub-v2/email-send.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| 콘텐츠 생성 | Server Action | `createContent(input)` | `{ title: "테스트", body_md: "...", category: "education" }` | `{ id: "uuid", status: "draft" }` | 200 |
| 콘텐츠 발행 | Server Action | `publishContent(id)` | `id="content-uuid-001"` | status="published" + distributions 생성 | 200 |
| 이메일 요약 AI 생성 | Server Action | `generateEmailSummary(body_md)` | 5000자 마크다운 | 1000~1600자 요약 | 200 |
| 이메일 일괄 발송 | POST | `/api/admin/email/send` | `{ contentId: "uuid", recipientIds: [...] }` | `{ sent: 50, failed: 0 }` | 200 |
| URL 크롤링 | Server Action | `crawlUrl(url)` | `"https://example.com/article"` | `{ title: "...", body_md: "..." }` | 200 |
