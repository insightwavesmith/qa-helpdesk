# 콘텐츠 허브 UX 리디자인 계획서

## 1. 개요
- 콘텐츠 관리 UX 전면 개편 (Smith님 피드백 2026-02-10)
- 행 클릭 → 원문 소스 다이얼로그 → 전용 상세 페이지로 변경
- 이메일 발송을 콘텐츠 안으로 통합
- MDXEditor 교체 포함

## 2. 현재 문제
1. 콘텐츠 관리 행 클릭 → 원문 HTML 소스가 textarea에 그대로 나옴 (편집 불가)
2. 이메일 발송은 리치 에디터+미리보기+발송이력 있지만 정보공유는 관리 전용 화면 없음
3. 편집 컬럼의 "정보공유|뉴스레터" 링크가 분산
4. 포스트 카드 excerpt에 raw HTML 태그 노출

## 3. 범위

### 포함

**허브 3탭 (목록 레벨)**
- 콘텐츠 탭: 전체 목록 + 상태 배지, 행 클릭→상세 페이지
- 정보공유 탭: 게시 순서 드래그 변경, 조회수 성과, 발행/비공개 관리
- 이메일 탭: 발송 이력, 오픈율/클릭률 성과, 추이 차트, 독립 이메일 작성

**상세 3탭 (편집 레벨)**
- 정보공유 탭: MDXEditor + 미리보기 + 게시 관리
- 뉴스레터 탭: 이메일 에디터 + 미리보기 + 발송
- 설정 탭: 메타 정보 (카테고리/태그/썸네일/상태)

**AI 콘텐츠 생성 (새 콘텐츠 플로우)**
- "새 콘텐츠" 버튼 → 입력 방식 선택:
  - URL 입력 → 내용 수집 → AI 가공 → draft
  - 주제/지시 입력 → AI 글 작성 → draft
  - 파일 업로드 (PDF) → 텍스트 추출 → AI 가공 → draft
  - 직접 작성 → 빈 에디터
- AI 가공: 마켓핏랩 스타일, 헤더 이미지 자동 생성
- 정보공유(긴 글) + 뉴스레터(함축) 동시 생성

**기타**
- 이메일 발송 메뉴 → 콘텐츠 이메일 탭으로 통합
- 사이드바 "이메일 발송" 메뉴 제거
- MDXEditor 적용 (TipTap 교체)
- excerpt HTML 태그 노출 버그 수정

### 제외
- 수강생 가입 페이지 (별도 기능)
- leads 전환 추적 (별도 기능)
- 외부 크롤링 자동화 크론 (Phase 4)

## 4. 성공 기준
- [ ] 허브 3탭 정상 동작 (콘텐츠/정보공유/이메일)
- [ ] 행 클릭 → 상세 페이지 이동 (다이얼로그 아님)
- [ ] 정보공유 탭: 게시 순서 드래그 변경 + 저장
- [ ] 이메일 탭: 발송 이력 + 오픈율/클릭률 표시
- [ ] 상세 정보공유 탭: MDXEditor 마크다운 편집 + 포맷 보존
- [ ] 상세 뉴스레터 탭: 이메일 작성 + 미리보기 + 발송
- [ ] 새 콘텐츠: URL/주제/PDF → AI 가공 → draft 저장
- [ ] 새 콘텐츠: 정보공유 + 뉴스레터 동시 생성
- [ ] 사이드바 "이메일 발송" 메뉴 제거
- [ ] excerpt에 HTML 태그 미노출

## 5. 의존성
- content-pipeline (contents 테이블 구조)
- inline-editor (기존 편집 UI 기반)

## 6. 목업
- `docs/mockup/content-hub-mockup.html` — 인터랙티브 목업
- `docs/mockup/content-hub-mockup.jpg` — 스크린샷

## 7. 완료 상태
- **Phase**: plan → design 진행중 (2026-02-10)
- Smith님 피드백: v2 목업 승인 (허브 3탭 + 상세 3탭 + AI 생성)
- Design 작성 → TASK.md → 에이전트팀 구현 예정

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `GET /api/contents` | `{ tab: "contents" }` | 전체 콘텐츠 목록 + 상태 배지 | 허브 콘텐츠 탭 |
| `GET /api/contents` | `{ tab: "posts" }` | 게시물 목록 + 조회수 + 게시 순서 | 정보공유 탭 |
| `GET /api/contents` | `{ tab: "emails" }` | 이메일 발송 이력 + 오픈율/클릭률 | 이메일 탭 |
| `GET /api/contents/:id` | content ID | 상세 페이지 데이터 (3탭 구성) | 행 클릭 → 상세 페이지 |
| `PATCH /api/contents/:id/order` | `{ order: 3 }` | 게시 순서 변경 | 드래그 앤 드롭 |
| `POST /api/contents/generate` | `{ type: "url", url: "https://..." }` | `{ draft: { title, body_md, email_summary } }` | AI 콘텐츠 생성 (URL) |
| `POST /api/contents/generate` | `{ type: "topic", prompt: "메타 광고 팁" }` | `{ draft: { title, body_md, email_summary } }` | AI 콘텐츠 생성 (주제) |
| `POST /api/contents/generate` | `{ type: "pdf", file: ... }` | `{ draft: { title, body_md, email_summary } }` | AI 콘텐츠 생성 (PDF) |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| 콘텐츠 0건 | 빈 DB | 빈 목록 + "콘텐츠가 없습니다" 메시지 |
| 게시 순서 동점 | 같은 order 값 2건 | 생성일 기준 정렬 |
| AI 생성 URL 접근 불가 | 404/타임아웃 URL | 에러: "URL에 접근할 수 없습니다" |
| PDF 텍스트 추출 실패 | 스캔 이미지 PDF | 에러: "텍스트를 추출할 수 없는 PDF입니다" |
| MDXEditor 마크다운 깨짐 | 특수문자 포함 body_md | 포맷 보존 + 이스케이프 처리 |
| excerpt HTML 태그 노출 | `<p>태그</p>` 포함 | 태그 제거된 순수 텍스트만 표시 |
| 이메일 발송 이력 0건 | 미발송 콘텐츠 | 빈 이력 + "발송 이력이 없습니다" |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/content-hub-redesign/content-list.json
[
  {
    "id": "cnt_001",
    "title": "Meta 광고 A/B 테스트 가이드",
    "source_type": "info_share",
    "status": "published",
    "category": "guide",
    "view_count": 234,
    "order": 1,
    "created_at": "2026-03-15T00:00:00Z"
  },
  {
    "id": "cnt_002",
    "title": "3월 뉴스레터: 봄 시즌 전략",
    "source_type": "manual",
    "status": "draft",
    "category": "newsletter",
    "view_count": 0,
    "order": 2,
    "created_at": "2026-03-20T00:00:00Z"
  }
]

// fixtures/content-hub-redesign/email-history.json
{
  "content_id": "cnt_001",
  "sends": [
    { "sent_at": "2026-03-16T09:00:00Z", "recipients": 45, "opened": 28, "clicked": 12, "open_rate": 0.622, "click_rate": 0.267 }
  ]
}

// fixtures/content-hub-redesign/ai-generate-result.json
{
  "type": "url",
  "source_url": "https://example.com/meta-ads-tips",
  "draft": {
    "title": "메타 광고 최적화 5가지 팁",
    "body_md": "# 메타 광고 최적화\n\n## 1. 타겟팅 세분화\n...",
    "email_summary": "이번 주 핵심: 메타 광고 최적화 5가지 팁을 정리했습니다."
  }
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/content-hub-redesign/hub-tabs.test.ts` | 허브 3탭 (콘텐츠/정보공유/이메일) | vitest |
| `__tests__/content-hub-redesign/detail-page.test.ts` | 상세 3탭 (정보공유/뉴스레터/설정) | vitest |
| `__tests__/content-hub-redesign/ai-generate.test.ts` | AI 콘텐츠 생성 (URL/주제/PDF) | vitest |
| `__tests__/content-hub-redesign/drag-order.test.ts` | 게시 순서 드래그 변경 | vitest |
| `__tests__/content-hub-redesign/excerpt-sanitize.test.ts` | HTML 태그 제거 검증 | vitest |
| `__tests__/content-hub-redesign/fixtures/` | JSON fixture 파일 | - |
