# 오가닉 Phase 2 — 콘텐츠 분석 엔진 Gap 분석

## Match Rate: 96%

---

## 일치 항목

### API 설계 (2.1 ~ 2.4)

- **2.1 금칙어 체크**: POST `/api/admin/forbidden-check` 구현 완료. `requireAdmin()` 인증, 최대 50개 제한, 200ms 딜레이 모두 일치. 응답 형식 `{ results: ForbiddenCheckResult[] }` 일치.
- **2.2 키워드 분석**: POST `/api/admin/keyword-analysis` 구현 완료. HMAC-SHA256 서명(`generateSignature`), `getPublishedCount`로 포화도 계산, 환경변수 미설정 시 `{ keyword: null, relatedKeywords: [], error: "API 키가 설정되지 않았습니다." }` 반환. 설계와 일치.
- **2.3 포스팅 진단**: POST `/api/admin/post-diagnosis` 구현 완료. `DiagnosisInput` 전체 필드 검증, `overallScore = pass 수 / 전체 수 × 100` 공식 일치, 응답 형식 `{ results, overallScore }` 일치.
- **2.4 블로그 벤치마킹**: GET `/api/admin/blog-benchmark?keyword={keyword}&count=3` 구현 완료. 500ms 딜레이, 응답 형식 `{ blogs, average }` 일치. `average`가 `Omit<BlogBenchmark, 'url' | 'title'>` 타입으로 정확히 구현.

### 타입 정의

- **ForbiddenCheckResult**: `{ keyword, isForbidden, isSuicideWord }` 완전 일치 (naver-forbidden.ts 반환 타입 + route.ts 조합으로 구성).
- **KeywordAnalysis**: 설계 대비 11개 필드 전부 일치. `export interface`로 선언하여 컴포넌트에서 재사용 가능하게 구성.
- **ProfanityEntry**: `word, category, severity` 3개 필드 일치. 설계에 명시된 `pattern?: RegExp`는 의도적으로 제외 (단순 문자열 매칭으로 충분히 구현).
- **ProfanityResult**: `word, matched, category, severity` 4개 필드 완전 일치.
- **DiagnosisItem / DiagnosisInput**: 설계 필드 완전 일치.
- **BlogBenchmark**: 6개 메트릭 필드 완전 일치.

### 비속어 DB (profanity-db.ts)

- 397개 단어 수록 (설계 목표 300+ 충족).
- 6개 카테고리 모두 구현: `swear`, `adult`, `discrimination`, `crime`, `commercial`, `gambling`.
- `severity` 3단계 구현: `low`, `medium`, `high`.
- `checkProfanity()` 함수: 공백 무시 매칭(`ignoreSpaces` 기본 true), 카테고리 필터, severity 내림차순 정렬 구현.

### 컴포넌트 구조 (3.1 ~ 3.3)

- **keyword-analysis-panel.tsx**: 설계 구조 `키워드 입력 + 분석 버튼 → KeywordInfoCard (4종) → RelatedKeywordsTable (정렬: 검색량/CTR/경쟁도) → TOP3BlogSummary(추후 구현 뱃지)` 완전 일치.
- **post-diagnosis-panel.tsx**: 설계 구조 `입력 폼 (제목/본문/키워드/이미지수) → DiagnosisCard × 6 (pass/warn/fail) → OverallScoreGauge(원형 SVG 게이지)` 완전 일치.
- **organic-keywords-tab.tsx**: 기존 키워드 테이블 + 페이지네이션 유지. 분석 도구 섹션에 3개 탭 추가 (키워드 분석 / 금칙어 체크 / 벤치마킹). 설계와 일치.

### 에러 처리

- 환경변수 미설정: `{ keyword: null, relatedKeywords: [], error: "API 키가 설정되지 않았습니다." }` 반환. UI에서 API 키 관련 안내 메시지 표시.
- 네이버 API rate limit: 200ms(forbidden-check), 500ms(blog-benchmark) 딜레이 적용. 재시도 없음.
- 네이버 API 응답 파싱 실패: `console.error` + null/빈 배열 반환.
- 크롤링 대상 없음: `{ blogs: [], average: emptyAverage }` 반환.
- 비속어 DB 매칭 없음: 빈 배열 반환.
- 인증 실패: `requireAdmin()` → 401/403 JSON 응답.

### 구현 순서 체크리스트

- backend-dev 항목 9개 모두 완료.
- frontend-dev 항목 3개 모두 완료.

---

## 불일치 항목

### 1. ProfanityEntry — `pattern?: RegExp` 필드 미구현 (warning)

**설계**: `ProfanityEntry` 인터페이스에 `pattern?: RegExp` 필드 명시.
**구현**: 해당 필드 없음. 단순 문자열 contains 방식으로 매칭 처리.
**영향**: 변형 매칭(예: "ㅅ.ㅂ" 패턴 등) 불가. 현재 공백 무시(`ignoreSpaces`) 방식으로 일부 커버.
**판단**: 300+ 단어 DB + ignoreSpaces 매칭으로 실용적 기능 충족. 기능 저하 없음.

### 2. ForbiddenCheckSection 에러 처리 누락 (warning)

**설계**: 에러 처리 섹션에 인증 실패 외 에러 처리 명시.
**구현**: `organic-keywords-tab.tsx`의 `ForbiddenCheckSection` 및 `BlogBenchmarkSection` 모두 catch 블록에서 에러를 무시(`// 에러 시 무시`). 사용자에게 에러 메시지 미표시.
**영향**: API 호출 실패 시 사용자가 이유를 알 수 없음. `KeywordAnalysisPanel`은 에러 메시지 UI가 구현되어 있어 일관성 부재.
**판단**: `ForbiddenCheckSection`과 `BlogBenchmarkSection`은 인라인 컴포넌트라 별도 errorState 추가 필요.

### 3. post-diagnosis-panel.tsx — DiagnosisInput의 `externalLinks` 입력 UX 변경 (info)

**설계**: `externalLinks: string[]` 배열 타입으로 입력.
**구현**: `externalLinksText` 상태로 Textarea에 줄바꿈 입력 → `parseExternalLinks()`로 `http` 시작 문자열 필터링. 실질적으로 동일한 기능이나 UI 입력 방식이 설계 명세보다 유연하게 구현.
**영향**: 없음. 설계 의도 충족.

---

## 수정 필요

### critical

없음.

### warning

1. **ForbiddenCheckSection / BlogBenchmarkSection 에러 처리 추가** (`organic-keywords-tab.tsx` 내 인라인 컴포넌트)
   - catch 블록에서 `setErrorMsg` 상태를 추가하여 사용자에게 실패 이유 표시 필요.
   - `KeywordAnalysisPanel`과 동일한 패턴으로 통일.

### info

1. `ProfanityEntry.pattern?: RegExp` 미구현 — 현재 기능에 영향 없음. 추후 정교한 변형 매칭 필요 시 추가.
2. `keyword-analysis-panel.tsx`의 `KeywordAnalysis` 인터페이스가 `naver-keyword.ts`의 `export interface KeywordAnalysis`와 중복 선언 — 코드 중복. 공유 타입은 `@/lib/naver-keyword`에서 import하여 재사용 권장 (현재 두 파일 간 필드 일치하므로 런타임 문제는 없음).
3. `organic-keywords-tab.tsx`의 `BlogBenchmark` / `BlogBenchmarkAverage` 인터페이스도 `naver-blog-scraper.ts`의 `export interface BlogBenchmark`와 중복 선언.

---

## 빌드 검증

- **tsc**: 통과 (타입 에러 0개)
- **lint (신규 파일)**: 통과 — `naver-forbidden.ts`, `naver-keyword.ts`, `profanity-db.ts`, `post-diagnosis.ts`, `naver-blog-scraper.ts`, 4개 route.ts, `keyword-analysis-panel.tsx`, `post-diagnosis-panel.tsx`, `organic-keywords-tab.tsx` 모두 lint 에러 없음. (기존 파일 25개 에러는 이번 Phase 2 범위 외)
- **build**: 통과 (`✓ Compiled successfully`) — 4개 신규 API 라우트 모두 빌드 확인
  - `/api/admin/blog-benchmark`
  - `/api/admin/forbidden-check`
  - `/api/admin/keyword-analysis`
  - `/api/admin/post-diagnosis`

---

## 종합 평가

| 영역 | 일치율 | 비고 |
|------|--------|------|
| API 설계 (4개 엔드포인트) | 100% | 메서드/인증/요청·응답 형식 전부 일치 |
| 타입 정의 (6개 인터페이스) | 95% | ProfanityEntry.pattern 1개 필드 누락 |
| 컴포넌트 구조 (3개) | 100% | 설계 트리 구조 완전 일치 |
| 에러 처리 | 85% | ForbiddenCheck·Benchmark 인라인 섹션 에러 UI 누락 |
| 구현 체크리스트 (12개 항목) | 100% | backend 9개 + frontend 3개 전부 완료 |
| 빌드 | 통과 | tsc 0 에러, 신규 파일 lint 0 에러, build 성공 |

**전체 Match Rate: 96%** — 90% 기준 초과. 완료 조건 충족.
Critical 이슈 없음. Warning 1개(에러 처리 UI 일관성) 수정 권장.
