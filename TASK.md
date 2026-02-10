# TASK.md — Phase B-4: 새 콘텐츠 생성 4카드 모달

## 목표
"새 콘텐츠" 버튼 클릭 시 4가지 생성 옵션을 제공하는 모달 표시.
현재: 빈 콘텐츠 바로 생성 → 상세 페이지 이동.
변경: 4카드 선택 모달 → 옵션별 처리 → 상세 페이지 이동.

## 디자인

### 모달 레이아웃
```
┌─────────────────────────────────────────┐
│  새 콘텐츠 만들기                          │
│                                         │
│  ┌─────────┐  ┌─────────┐              │
│  │ 🔗       │  │ 🤖       │              │
│  │ URL에서   │  │ AI로     │              │
│  │ 가져오기  │  │ 작성     │              │
│  └─────────┘  └─────────┘              │
│  ┌─────────┐  ┌─────────┐              │
│  │ 📄       │  │ ✍️       │              │
│  │ 파일     │  │ 직접     │              │
│  │ 업로드   │  │ 작성     │              │
│  └─────────┘  └─────────┘              │
│                                         │
└─────────────────────────────────────────┘
```

### 4카드 상세

#### 1. URL에서 가져오기 🔗
- 카드 클릭 → URL 입력 필드 표시
- URL 입력 후 "가져오기" 버튼
- 서버 API로 URL 크롤링 → 마크다운 변환
- 크롤링된 내용으로 새 콘텐츠 생성 (draft) → 상세 페이지 이동
- API: `POST /api/admin/content/crawl` (새로 생성)
  - cheerio/readability로 본문 추출
  - turndown으로 마크다운 변환
  - title, body_md 반환

#### 2. AI로 작성 🤖
- 카드 클릭 → 주제/키워드 입력 필드 표시
- "AI 작성" 버튼
- Gemini Flash로 정보공유 글 생성 (content-writing 스킬 프롬프트 적용)
- 생성된 내용으로 새 콘텐츠 생성 (draft) → 상세 페이지 이동
- API: `POST /api/admin/content/generate` (새로 생성)
  - body_md + email_summary 동시 생성
  - content-writing 스킬의 구조/톤/패턴 프롬프트 내장

#### 3. 파일 업로드 📄
- 카드 클릭 → 파일 드래그&드롭 영역 표시
- .md, .txt, .docx 지원
- 파일 내용 읽어서 body_md에 삽입
- 새 콘텐츠 생성 (draft) → 상세 페이지 이동
- 프론트엔드에서 처리 (FileReader API)
- .docx → mammoth.js로 변환 (npm 패키지 추가)

#### 4. 직접 작성 ✍️
- 카드 클릭 → 빈 콘텐츠 생성 (현재 동작과 동일) → 상세 페이지 이동
- 가장 단순: createContent({ title: "새 콘텐츠", ... })

## 파일 구조

### 새 파일
- `src/components/content/new-content-modal.tsx` — 4카드 모달 컴포넌트
- `src/app/api/admin/content/crawl/route.ts` — URL 크롤링 API
- `src/app/api/admin/content/generate/route.ts` — AI 글 생성 API

### 수정 파일
- `src/app/(main)/admin/content/page.tsx` — handleNewContent를 모달 열기로 변경

### 패키지 추가
- `cheerio` — HTML 파싱 (크롤링)
- `@mozilla/readability` — 본문 추출
- `mammoth` — .docx → HTML 변환

## 기존 구조 영향 분석

### 콘텐츠 파이프라인 보존 (중요!)
- 모든 옵션의 최종 결과: `createContent({ title, body_md, status: "draft", ... })` → 상세 페이지 이동
- 기존 편집/게시/뉴스레터 플로우에 영향 없음
- DB 스키마 변경 없음
- 단순히 "초기 body_md를 어떻게 채울 것인가"의 차이만 있음

### content-editor-dialog.tsx
- 이 파일은 "새 콘텐츠" 다이얼로그로 쓰이고 있었으나, 현재 page.tsx에서는 직접 사용하지 않음 (handleNewContent가 API 호출 후 라우팅)
- 삭제하지 않고 유지 (다른 곳에서 참조될 수 있음)

## 완료 기준
- [ ] 4카드 모달이 열리고 각 카드 클릭 시 해당 UI 표시
- [ ] "URL에서 가져오기": URL 입력 → 크롤링 → 콘텐츠 생성 → 상세 페이지
- [ ] "AI로 작성": 주제 입력 → AI 생성 → 콘텐츠 생성 → 상세 페이지
- [ ] "파일 업로드": 파일 선택 → 내용 읽기 → 콘텐츠 생성 → 상세 페이지
- [ ] "직접 작성": 빈 콘텐츠 생성 → 상세 페이지 (기존 동작)
- [ ] 기존 편집/게시/뉴스레터 플로우 정상 작동
- [ ] `npm run build` 성공

## 실행 순서
1. 패키지 설치 (cheerio, @mozilla/readability, mammoth)
2. new-content-modal.tsx 생성
3. crawl API 생성
4. generate API 생성
5. page.tsx 수정 (handleNewContent → 모달 열기)
6. 빌드 확인
7. git commit & push

---

## 리뷰 결과

### 1. 기존 콘텐츠 파이프라인 충돌 여부: 충돌 없음 ✅

- 4가지 옵션 모두 최종 결과가 `createContent({ title, body_md, status: "draft" })` → 상세 페이지 이동으로 수렴. 기존 편집/게시/뉴스레터 플로우에 영향 없음.
- DB 스키마 변경 없고, `content-editor-dialog.tsx` 보존 판단도 적절.
- `source_type`/`source_ref` 필드를 활용하면 생성 출처 추적 가능 (예: `source_type: "url"`, `source_ref: "https://..."`) — TASK에 명시되진 않았으나 기존 스키마가 이미 지원.

### 2. 패키지 선택 검토

#### `@mozilla/readability` — jsdom 누락 ⚠️ (블로커)
- readability는 DOM `document` 객체를 요구함. cheerio는 jQuery-like API이지 DOM이 아님.
- **cheerio만으로는 readability를 사용할 수 없음.** `jsdom`을 추가 설치하거나, 대안으로 `@extractus/article-extractor` (readability + jsdom 번들) 사용 필요.
- 권장: `jsdom`을 패키지 목록에 추가하거나, cheerio + 자체 본문 추출 로직 사용.

#### `cheerio` — 적절 ✅
- 서버사이드 HTML 파싱에 적합. 가볍고 유지보수 활발.
- jsdom보다 메모리/속도 효율적이나, readability 연동 시 결국 jsdom도 필요.

#### `mammoth` — 적절하나 번들 크기 주의 ⚠️
- .docx → HTML 변환 표준 라이브러리. 대안(docx, docx-preview)보다 서버/브라우저 양쪽 지원이 우수.
- TASK에서 "프론트엔드에서 처리 (FileReader API)"라고 명시 → **클라이언트 번들에 포함됨.**
- mammoth는 ~280KB (gzip)으로 Next.js 클라이언트 번들 크기에 영향. `next/dynamic`으로 lazy import 권장.

#### `turndown` — 이미 설치됨 ✅
- `package.json`에 `"turndown": "^7.2.2"` 존재. `src/lib/html-to-markdown.ts`에서 사용 중.
- crawl API에서 `ensureMarkdown()` 재활용 가능 — 신규 변환 로직 불필요.

#### 패키지 추가 최종 권장
```
필수: cheerio, jsdom (또는 @extractus/article-extractor), mammoth
불필요: turndown (이미 설치), @mozilla/readability (jsdom 없이 사용 불가)
타입: @types/jsdom (devDependencies)
```

### 3. API 설계 — 기존 패턴 일관성

#### 인증 패턴: 일관 ✅
- 기존 Route Handler 패턴 (`/api/admin/content/summarize/route.ts` 참조):
  ```
  createClient() → getUser() → 401
  createServiceClient() → profiles.role → 403
  ```
- `crawl`, `generate` 두 API 모두 동일 패턴 적용 가능.

#### 에러 응답 패턴: 일관 ✅
- 기존: `NextResponse.json({ error: "한국어 메시지" }, { status: 4xx/5xx })`
- 새 API도 동일 패턴 따르면 됨.

#### Gemini API 호출: 중복 우려 ⚠️
- `generate` API에서 Gemini를 호출할 때, 기존 `src/lib/gemini.ts`의 인프라를 재활용해야 함.
- `summarize/route.ts`는 Gemini API를 **직접 fetch**하고 있어 이미 중복 존재. 새 API 추가 시 `lib/gemini.ts`에 `generateContent(prompt, config)` 범용 함수를 추출하는 것이 바람직하나, 기존 패턴 유지가 우선이면 직접 fetch도 수용 가능.
- 모델 불일치 주의: `gemini.ts`는 `gemini-2.5-flash-preview-05-20`, `summarize`는 `gemini-2.0-flash` 사용 중. 새 API는 어느 모델을 쓸지 명시 필요.

### 4. 빠진 엣지 케이스

#### URL 크롤링 (crawl API)
| 엣지 케이스 | 현재 TASK 대응 | 권장 |
|------------|---------------|------|
| **타임아웃** | 미언급 | fetch에 AbortController + 10초 timeout |
| **비HTML 응답** (PDF, 이미지 등) | 미언급 | Content-Type 체크 후 에러 반환 |
| **인코딩 문제** (EUC-KR 등) | 미언급 | charset 감지 후 UTF-8 변환 |
| **리다이렉트 체인** | 미언급 | fetch는 기본 follow, 최대 5회 제한 |
| **JavaScript 렌더링 페이지** (SPA) | 미언급 | cheerio 한계 명시 — 에러 메시지로 안내 |
| **robots.txt 준수** | 미언급 | 관리자용이므로 선택적이나, 에러 시 안내 |
| **빈 본문 추출** | 미언급 | readability 결과가 빈 경우 fallback 또는 에러 |
| **매우 긴 페이지** | 미언급 | body_md 최대 길이 제한 (예: 50,000자) |

#### AI 생성 (generate API)
| 엣지 케이스 | 현재 TASK 대응 | 권장 |
|------------|---------------|------|
| **Gemini API 장애/timeout** | 미언급 | try-catch + 사용자 친화적 에러 메시지 |
| **빈 응답/safety 필터 차단** | 미언급 | `candidates[0]` null 체크 |
| **토큰 한도 초과** | 미언급 | maxOutputTokens 설정 + 길이 검증 |
| **GEMINI_API_KEY 미설정** | 미언급 | 500 에러 반환 (summarize 패턴 참조) |

#### 파일 업로드
| 엣지 케이스 | 현재 TASK 대응 | 권장 |
|------------|---------------|------|
| **대용량 .docx** (10MB+) | 미언급 | 파일 크기 제한 (프론트 검증 5MB 권장) |
| **손상된 파일** | 미언급 | mammoth 에러 catch + 에러 토스트 |
| **비지원 형식 위장** (.exe→.docx) | 미언급 | MIME 타입 + 확장자 이중 검증 |
| **.md/.txt 인코딩** | 미언급 | FileReader에 encoding 옵션 명시 |

### 5. 보안 이슈

#### SSRF (Server-Side Request Forgery) — 심각도: 높음 🔴
- `crawl` API가 관리자 입력 URL을 서버에서 fetch → **SSRF 공격 벡터.**
- 공격 시나리오:
  - `http://169.254.169.254/latest/meta-data/` → 클라우드 메타데이터 탈취
  - `http://localhost:5432` → 내부 서비스 스캔
  - `http://10.0.0.x/admin` → 내부망 접근
- **필수 방어책:**
  1. URL 파싱 후 private IP 대역 차단 (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1)
  2. DNS rebinding 방어: resolve 후 IP 체크 → 해당 IP로 직접 요청
  3. 프로토콜 제한: `http://`, `https://`만 허용 (file://, ftp://, gopher:// 차단)
  4. 리다이렉트 시 매 hop마다 IP 재검증

```typescript
// 권장 구현 예시
function isPrivateUrl(url: string): boolean {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) return true;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) return true;
  if (!["http:", "https:"].includes(parsed.protocol)) return true;
  return false;
}
```

#### 파일 업로드 보안 — 심각도: 낮음 🟢
- 파일 처리가 프론트엔드(FileReader)에서만 수행되므로 서버 파일 업로드 취약점 없음.
- mammoth는 매크로를 실행하지 않으므로 .docx 매크로 공격 무관.
- 다만 mammoth 출력 HTML에 악의적 태그가 포함될 수 있으므로, turndown 변환 후 저장 시 markdown 수준에서 안전.

#### Stored XSS — 심각도: 중간 🟡
- 크롤링된 HTML → turndown → body_md 저장 → 나중에 렌더링 시 XSS 가능.
- turndown이 `<script>` 등을 제거하지만 100% 보장은 아님.
- **권장:** turndown 전 DOMPurify로 HTML sanitize, 또는 turndown 후 markdown에서 raw HTML 태그 제거.

#### Rate Limiting — 심각도: 중간 🟡
- crawl/generate API에 rate limit 없음. 관리자 전용이지만 토큰 탈취 시 Gemini API 과금 남용 가능.
- 권장: 분당 10회 등 기본 rate limit 적용.

### 종합 판정

| 항목 | 판정 | 비고 |
|------|------|------|
| 파이프라인 충돌 | ✅ 안전 | 기존 플로우 영향 없음 |
| 패키지 선택 | ⚠️ 수정필요 | jsdom 누락 (readability 의존성) |
| API 일관성 | ✅ 양호 | 기존 패턴과 일치 |
| 엣지 케이스 | ⚠️ 보완필요 | 타임아웃, 대용량, 빈 응답 등 |
| 보안 | 🔴 SSRF 대응 필수 | private IP 차단 로직 필수 |

**구현 진행 전 필수 조치:**
1. 패키지 목록에 `jsdom` + `@types/jsdom` 추가 (또는 `@extractus/article-extractor`로 대체)
2. crawl API에 SSRF 방어 함수 포함
3. 각 API에 타임아웃 + 에러 핸들링 명시
