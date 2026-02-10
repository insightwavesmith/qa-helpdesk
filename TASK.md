# TASK.md — 콘텐츠 허브 리디자인 Phase B (상세 편집)

## 개요
Phase A(허브 구조) 완료. Phase B에서 상세 페이지 편집 기능을 구현한다.
에디터를 MDXEditor로 통일(정보공유 + 뉴스레터), @react-email/markdown으로 이메일 미리보기.

## 현재 상태
- Phase A 완료: 허브 3탭(콘텐츠/정보공유/이메일), [id] 상세 라우트, 사이드바 메뉴 정리, 다이얼로그 제거
- DB: 10개 콘텐츠 (마켓핏랩 스타일 재작성 + 헤더 이미지 완료)
- 알려진 버그: excerpt에 HTML 태그 노출, published 글이 편집모드에서 "초안" 표시

## 필수 참조 문서 (반드시 먼저 읽기)
- `docs/01-plan/features/content-hub-redesign.plan.md` — 요구사항/범위
- `docs/02-design/features/content-hub-redesign.design.md` — 설계서 (DB/API/컴포넌트)
- `docs/mockup/content-hub.html` — 최종 목업 v3 (브라우저로 열어서 확인)

## 핵심 컨셉: 콘텐츠 파이프라인
```
모찌(AI) 생성 → Smith님 MDXEditor 편집 → 원클릭 배포
```
- **에디터 = AI가 생성한 콘텐츠를 수정하는 도구.** 처음부터 직접 작성이 아님.
- **정보공유 탭**: MDXEditor WYSIWYG → body_md 편집 (편집 화면 = 최종 결과물)
- **뉴스레터 탭**: MDXEditor WYSIWYG(동일 에디터) + 오른쪽 이메일 미리보기(@react-email/markdown)
- **TipTap 사용 안 함** — MDXEditor로 완전 통일

## 데이터 연결 구조
```
contents 테이블
├── body_md (text)        ← 정보공유 본문 (마크다운). MDXEditor로 편집.
├── email_summary (text)  ← 뉴스레터 본문 (마크다운). MDXEditor로 편집.
├── title (text)          ← 제목
├── thumbnail_url (text)  ← 헤더 이미지 (Supabase Storage content-images 버킷)
├── category (text)       ← education / notice / case_study
├── type (text)           ← info / promo
├── status (text)         ← draft / published / archived
├── excerpt (text)        ← 카드 미리보기 (body_md에서 자동 추출, HTML 태그 제거)
└── source_type / source_url ← 원본 출처
```

### API 연결
| API | 메서드 | 용도 |
|-----|--------|------|
| `/api/contents/[id]` | GET | 콘텐츠 상세 조회 (body_md, email_summary 포함) |
| `/api/contents/[id]` | PATCH | 콘텐츠 수정 (body_md, email_summary, status 등) |
| `/api/email/send` | POST | 이메일 발송 (email_summary를 @react-email/markdown로 렌더링 → HTML → SMTP) |
| `/api/email/test` | POST | 테스트 발송 (smith.kim@inwv.co로만) |

### 상태 플로우
```
draft → published (정보공유 발행)
draft → sent (이메일 발송)
둘 다 독립적 — 정보공유만 / 이메일만 / 둘 다 가능
```

## 태스크

### B-1. MDXEditor 설치 + 정보공유 탭 [frontend-dev]
- **패키지 설치**: `@mdxeditor/editor`
- **파일**: `src/components/content/post-edit-panel.tsx` (신규)
- **작업**: 
  - MDXEditor로 body_md 마크다운 WYSIWYG 편집
  - toolbar: Bold/Italic/H1-H3/HR/리스트/표/이미지/링크/인용
  - 전체 너비 사용 (에디터 = 최종 렌더링, 별도 미리보기 없음)
  - onChange → body_md 상태 업데이트
  - 저장 버튼 → PATCH `/api/contents/[id]` { body_md, title }
  - 데이터 로딩: GET `/api/contents/[id]` → body_md를 MDXEditor에 바인딩
- **완료 기준**: 마크다운 편집 + 저장 + 포맷 보존 (표/리스트/인용/이미지 등)

### B-2. 사이드바 패널 [frontend-dev]
- **파일**: `src/components/content/detail-sidebar.tsx` (신규)
- **작업**:
  - ThumbnailCard: thumbnail_url 이미지 표시 + "이미지 변경" 버튼
  - PublishInfoCard: status(배지) / category / view_count / created_at
  - NewsletterStatusCard: email_summary 존재 여부 + 발송 상태 + "뉴스레터 탭 →" 버튼
- **데이터**: GET `/api/contents/[id]` 응답에서 thumbnail_url, status, category, view_count 사용
- **완료 기준**: 정보공유 탭 오른쪽에 사이드바 표시, 데이터 바인딩 정확

### B-3. 뉴스레터 탭 (MDXEditor 통일) [frontend-dev]
- **패키지 추가**: `@react-email/markdown`, `@react-email/components`
- **파일**: `src/components/content/newsletter-edit-panel.tsx` (신규)
- **작업**:
  - 상단: EmailMeta (수신대상 select, 템플릿 select, 제목 input)
  - 좌: MDXEditor WYSIWYG (정보공유 탭과 동일 에디터) → email_summary 편집
  - 우: 이메일 미리보기 (@react-email/markdown로 email_summary 마크다운 → 이메일 HTML 실시간 렌더링)
  - "정보공유에서 가져오기" 버튼 → body_md 전체를 email_summary로 복사
  - "AI 요약" 버튼 → body_md를 짧은 뉴스레터 요약으로 변환 (향후 AI API 연결, Phase E)
  - "테스트 발송" → POST `/api/email/test` (smith.kim@inwv.co로만)
  - "발송하기" → POST `/api/email/send` (leads 대상, 수신자 수 표시)
  - 저장 → PATCH `/api/contents/[id]` { email_summary }
- **이메일 렌더링 흐름**: email_summary(마크다운) → @react-email/markdown → React Email 컴포넌트 → renderToStaticMarkup → 이메일 HTML
- **참조**: 기존 이메일 발송 로직 `src/components/email/` 폴더 (SMTP, 수신자 조회 등 재사용)
- **완료 기준**: 뉴스레터 마크다운 편집 + 이메일 미리보기 실시간 + 테스트발송 + 실제발송

### B-4. 설정 탭 [frontend-dev]
- **파일**: `src/components/content/content-settings-panel.tsx` (신규)
- **작업**:
  - CategorySelect: education / notice / case_study
  - StatusSelect: draft / published / archived
  - TypeSelect: info / promo
  - SourceInfo: source_type, source_url (읽기 전용 또는 편집)
  - DangerZone: 삭제 버튼 + 확인 다이얼로그
  - 저장 → PATCH `/api/contents/[id]` { category, status, type, source_type, source_url }
- **완료 기준**: 메타 정보 수정 + 저장 + 삭제 동작

### B-5. excerpt HTML 태그 버그 [backend-dev]
- **파일**: 기존 getExcerpt 함수 (위치 확인 후 수정)
- **작업**: excerpt 생성 시 HTML 태그 제거 + body_md에서 plain text 추출
- **참조**: 현재 `<p 메타 광고...` 형태로 노출됨
- **완료 기준**: 포스트 카드에 plain text excerpt 표시

### B-6. 상태 표시 버그 [frontend-dev]
- **작업**: published 글이 편집모드에서 "초안" 표시되는 문제 수정
- **원인**: status 필드 바인딩 확인 (DB 값 vs 하드코딩)
- **완료 기준**: 상태가 DB 값(published/draft)과 일치

## 파일 소유권
| 담당 | 파일 |
|------|------|
| frontend-dev | `src/app/(main)/admin/content/[id]/page.tsx` (수정) |
| frontend-dev | `src/components/content/post-edit-panel.tsx` (신규) |
| frontend-dev | `src/components/content/detail-sidebar.tsx` (신규) |
| frontend-dev | `src/components/content/newsletter-edit-panel.tsx` (신규) |
| frontend-dev | `src/components/content/content-settings-panel.tsx` (신규) |
| backend-dev | excerpt 버그 수정 |
| backend-dev | 이메일 발송 API (@react-email/markdown 렌더링 적용) |
| code-reviewer | 전체 리뷰 |

## 의존성 순서
```
B-1 (MDXEditor + 정보공유) → B-2 (사이드바) → B-3 (뉴스레터) → B-4 (설정) → B-5 (excerpt) + B-6 (상태 버그)
```
- B-3은 B-1의 MDXEditor 컴포넌트를 공유하므로 B-1 먼저 완료 필수
- B-5, B-6은 독립적이므로 병렬 가능

## 디자인 시스템
- Primary: `#F75D5D`, hover: `#E54949`
- 폰트: Pretendard
- 라이트 모드만
- shadcn/ui 컴포넌트 사용 (Tabs, Card, Button, Badge 등)
- 모든 UI 텍스트 한국어

## 완료 조건
- [ ] `npm run build` 성공
- [ ] lint 에러 0개
- [ ] MDXEditor 마크다운 편집/저장/포맷 보존 (정보공유 탭)
- [ ] MDXEditor → @react-email/markdown 이메일 미리보기 실시간 (뉴스레터 탭)
- [ ] "정보공유에서 가져오기" → body_md를 email_summary로 복사 동작
- [ ] 사이드바 패널 표시 (썸네일 + 게시정보 + 뉴스레터 상태)
- [ ] 테스트 발송 + 실제 발송 동작 (이메일 HTML이 마크다운에서 렌더링)
- [ ] 설정 탭 메타 정보 수정/저장/삭제
- [ ] excerpt에 HTML 태그 미노출
- [ ] published 글 상태 정확히 표시
- [ ] 기존 API 연결 정상 (contents CRUD, email send)
- [ ] 완료 시 `openclaw gateway wake --text 'Phase B Done' --mode now` 실행
