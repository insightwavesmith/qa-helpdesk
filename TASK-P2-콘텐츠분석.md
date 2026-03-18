# TASK: 오가닉 Phase 2 — 콘텐츠 분석 엔진

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
blai.co.kr이 제공하는 키워드 분석/포스팅 진단 기능을 bscamp 자체 구현한다.
기존에 네이버 검색광고 API 키가 발급되어 있고, 키워드 검색량 조회 스크립트도 있다.
**기존 코드 건드리지 말고 신규 파일 추가 위주로.**
Python 의존성 없이 TypeScript/Node.js로만 구현한다.

## 참고 파일 (반드시 읽어라)
- `docs/blai-reverse-engineering.md` — blai 역분석 전체 (진단 항목, 형태소 분석, 비속어 등)
- `docs/blog-seo/keyword-tiers.md` — 키워드 티어/구조/7일 주기 프로세스
- `src/actions/organic.ts` — 기존 오가닉 서버 액션
- `src/types/organic.ts` — 기존 타입 정의
- `src/components/organic/organic-keywords-tab.tsx` — 기존 키워드 탭 UI

## 환경변수 (이미 설정됨)
- `NAVER_AD_CUSTOMER_ID` — 네이버 검색광고 고객 ID
- `NAVER_AD_ACCESS_LICENSE` — API 라이센스 키
- `NAVER_AD_SECRET_KEY` — HMAC 시크릿 키

---

## Task 1: 네이버 금칙어 실시간 체크 API

### 파일 생성
- `src/lib/naver-forbidden.ts`
- `src/app/api/admin/forbidden-check/route.ts`

### 로직
네이버 블로그 섹션 검색 API로 금칙어 여부 판별:
```
GET https://section.blog.naver.com/ajax/SearchList.naver
  ?countPerPage=7&currentPage=1&keyword={word}&orderBy=sim&type=post
```
- 응답 `result.searchDisplayInfo.displayType`이 null → 금칙어
- `result.searchDisplayInfo.existSuicideWord`가 true → 자살 관련 금칙어

### 함수
```typescript
checkForbiddenWord(keyword: string): Promise<{
  isForbidden: boolean;
  isSuicideWord: boolean;
}>

checkForbiddenWords(keywords: string[]): Promise<Array<{
  keyword: string;
  isForbidden: boolean;
  isSuicideWord: boolean;
}>>
```

### API 라우트
- POST `/api/admin/forbidden-check`
- body: `{ keywords: string[] }`
- 응답: `{ results: Array<{ keyword, isForbidden, isSuicideWord }> }`
- 요청 간 200ms 딜레이 (네이버 rate limit 방지)

---

## Task 2: 키워드 분석 API + UI

### 파일 생성
- `src/lib/naver-keyword.ts` — 네이버 검색광고 API 래퍼
- `src/app/api/admin/keyword-analysis/route.ts`
- `src/components/organic/keyword-analysis-panel.tsx`

### 네이버 검색광고 API 연동
기존 스크립트 `scripts/blog-seo/keyword-search-volume.mjs` 참고하여 TypeScript로 재구현:
```
GET https://api.searchad.naver.com/keywordstool
  ?hintKeywords={keyword}&showDetail=1
Headers:
  X-Timestamp: {timestamp}
  X-API-KEY: {ACCESS_LICENSE}
  X-Customer: {CUSTOMER_ID}
  X-Signature: HMAC-SHA256(SECRET_KEY, "{timestamp}.{method}.{uri}")
```

### 반환 데이터
- 연관 키워드 목록
- PC/모바일 검색량 (monthlyPcQcCnt, monthlyMobileQcCnt)
- 합산 검색량
- CTR (monthlyAvePcCtr, monthlyAveMobileCtr)
- 경쟁도 (compIdx: 높/중/낮)
- 광고 입찰가

### 포화도 계산 (발행량/검색량)
- 발행량: 네이버 블로그 검색 결과 수 (section.blog.naver.com 검색 count)
- 포화도 = 발행량 / 월간 검색량 × 100

### UI 컴포넌트 (keyword-analysis-panel.tsx)
- 키워드 입력 필드 + 분석 버튼
- 키워드 정보 카드: 평균 검색량, 입찰가(PC/모바일), 경쟁도, 포화도
- 연관 키워드 테이블: 키워드명, PC검색, 모바일검색, 합계, CTR, 경쟁도
  - 정렬 가능 (검색량순/CTR순/경쟁도순)
- TOP 3 블로그 요약 (글자수/이미지수 평균) → "추후 구현" 뱃지로 표시
- 이 패널을 `organic-keywords-tab.tsx`에 연결

---

## Task 3: 비속어/금칙어 DB

### 파일 생성
- `src/lib/profanity-db.ts`

### 초기 DB 구성
오픈소스 한국어 비속어 DB에서 수집 (최소 300개):
- 카테고리: 욕설(swear), 성인(adult), 차별(discrimination), 범죄(crime), 상업성(commercial), 도박(gambling)
- GitHub `korean-profanity-resources`, `badwords-ko` 등 참고
- 네이버 특화 상업성 키워드 포함: 무료, 공짜, 최저가, 쿠폰, 100%, 이벤트 등

### 함수
```typescript
interface ProfanityResult {
  word: string;
  matched: string;   // 실제 매칭된 원본 텍스트
  category: string;
  severity: 'low' | 'medium' | 'high';
}

checkProfanity(text: string, options?: {
  ignoreSpaces?: boolean;  // 띄어쓰기 무시 매칭
  categories?: string[];   // 특정 카테고리만
}): ProfanityResult[]
```
- 정규식 기반 매칭
- 띄어쓰기 무시 옵션 (변형 비속어: "시 발", "ㅅ ㅂ" 등)
- severity: high=즉시 누락, medium=주의, low=과다 사용 시 누락

---

## Task 4: 포스팅 진단 엔진

### 파일 생성
- `src/lib/post-diagnosis.ts`
- `src/app/api/admin/post-diagnosis/route.ts`
- `src/components/organic/post-diagnosis-panel.tsx`

### 진단 항목 (형태소 분석 없이 가능한 6개)
blai 8항목 중 형태소 의존 2개 제외, 6개 구현:

| # | 항목 | 적합 기준 | 개선 기준 |
|---|------|----------|----------|
| 1 | 본문 글자수 | 1,500자 이상 | 500자 미만 |
| 2 | 비속어/부적절 단어 | 0개 | 1개 이상 |
| 3 | 19금/성인 단어 | 0개 | 1개 이상 |
| 4 | 외부 링크 수 | 0개 | 3개 이상 |
| 5 | 이미지 수 | 5장 이상 | 2장 미만 |
| 6 | 키워드 반복 수 | 5~15회 | 3회 미만 or 20회 초과 |

### 함수
```typescript
interface DiagnosisItem {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: number | string;
  message: string;
  recommendation?: string;
}

diagnosePost(input: {
  title: string;
  content: string;
  targetKeyword: string;
  imageCount: number;
  externalLinks: string[];
}): DiagnosisItem[]
```

### API 라우트
- POST `/api/admin/post-diagnosis`
- body: `{ title, content, targetKeyword, imageCount, externalLinks }`
- 응답: `{ results: DiagnosisItem[], overallScore: number }`
- overallScore: pass 항목 수 / 전체 항목 수 × 100

### UI 컴포넌트 (post-diagnosis-panel.tsx)
- 제목 입력 + 본문 textarea + 타겟 키워드 + 이미지 수 입력
- 진단 결과 카드 6개 (✅ 적합 / ⚠️ 주의 / ❌ 개선)
- 전체 점수 표시 (원형 게이지)
- 이 패널을 오가닉 글 작성/수정 페이지에서 사이드바로 표시

---

## Task 5: TOP 3 블로그 벤치마킹

### 파일 생성
- `src/lib/naver-blog-scraper.ts`
- `src/app/api/admin/blog-benchmark/route.ts`

### 로직
1. 네이버 블로그 검색 API (또는 section.blog.naver.com 크롤링)로 키워드 검색
2. 상위 3개 블로그 URL 추출
3. 각 블로그 글 크롤링:
   - 글자 수 (공백 제외)
   - 이미지 수
   - 외부 링크 수
   - 인용구 수
   - 구분선 수
   - 해시태그 수
4. 3개 평균값 반환

### 함수
```typescript
interface BlogBenchmark {
  url: string;
  title: string;
  charCount: number;
  imageCount: number;
  externalLinkCount: number;
  quoteCount: number;
  dividerCount: number;
  hashtagCount: number;
}

benchmarkTopBlogs(keyword: string, count?: number): Promise<{
  blogs: BlogBenchmark[];
  average: Omit<BlogBenchmark, 'url' | 'title'>;
}>
```

### API 라우트
- GET `/api/admin/blog-benchmark?keyword={keyword}&count=3`
- 응답: `{ blogs, average }`
- 크롤링 간 500ms 딜레이 (rate limit 방지)

---

## Task 6: 키워드 분석 탭 통합

### 수정 파일
- `src/components/organic/organic-keywords-tab.tsx` — 기존 탭에 분석 패널 추가

### 구성
기존 키워드 탭에 3개 섹션 추가:
1. **키워드 분석**: keyword-analysis-panel.tsx
2. **벤치마킹**: 키워드 입력 → TOP 3 평균값 표시
3. **금칙어 체크**: 키워드 목록 입력 → 금칙어 여부 표시

---

## 제약사항
- **Python 의존성 절대 금지** — 전부 TypeScript/Node.js
- **기존 파일 최소 수정** — organic-keywords-tab.tsx만 허용
- **DB 변경 없음** — 기존 Supabase 테이블 사용
- **환경변수 없으면 graceful fallback** — 빈 결과 반환, 에러 안 남
- **빌드 깨지면 안 됨**: tsc + lint + build 통과 필수
- **네이버 크롤링 시 User-Agent 설정** + 딜레이 넣기
- Task별로 나눠서 커밋 (한 번에 몰아넣지 말 것)

## 완료 기준
1. `npm run build` 성공
2. 금칙어 체크 API: 키워드 10개 배치 체크 동작
3. 키워드 분석: 검색량/경쟁도/포화도 표시
4. 비속어 DB: 300+ 단어, 6개 카테고리
5. 포스팅 진단: 6항목 점수 + UI 표시
6. TOP 3 벤치마킹: 크롤링 + 평균값 반환
