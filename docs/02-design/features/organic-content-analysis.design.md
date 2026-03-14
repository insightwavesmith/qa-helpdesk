# 오가닉 Phase 2 — 콘텐츠 분석 엔진 설계서

## 1. 데이터 모델

DB 변경 없음. 모든 데이터는 API 응답으로 실시간 처리.

### 타입 정의 (각 lib 파일 내부 정의)

```typescript
// naver-forbidden.ts
interface ForbiddenCheckResult {
  keyword: string;
  isForbidden: boolean;
  isSuicideWord: boolean;
}

// naver-keyword.ts
interface KeywordAnalysis {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  totalSearchCount: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  compIdx: string;          // 높음/중간/낮음
  plAvgDepth: number;       // 평균 노출 순위
  pcPLAvgBid?: number;      // PC 입찰가
  mobilePLAvgBid?: number;  // 모바일 입찰가
  saturationRate?: number;  // 포화도 (발행량/검색량×100)
  publishedCount?: number;  // 블로그 발행량
}

// profanity-db.ts
interface ProfanityEntry {
  word: string;
  category: 'swear' | 'adult' | 'discrimination' | 'crime' | 'commercial' | 'gambling';
  severity: 'low' | 'medium' | 'high';
  pattern?: RegExp;  // 변형 매칭용
}

interface ProfanityResult {
  word: string;
  matched: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
}

// post-diagnosis.ts
interface DiagnosisItem {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: number | string;
  message: string;
  recommendation?: string;
}

interface DiagnosisInput {
  title: string;
  content: string;
  targetKeyword: string;
  imageCount: number;
  externalLinks: string[];
}

// naver-blog-scraper.ts
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
```

## 2. API 설계

### 2.1 금칙어 체크
- **POST** `/api/admin/forbidden-check`
- 인증: admin only (`requireAdmin()`)
- 요청: `{ keywords: string[] }` (최대 50개)
- 응답: `{ results: ForbiddenCheckResult[] }`
- 네이버 API 호출 간 200ms 딜레이
- 환경변수 불필요 (비인증 API)

### 2.2 키워드 분석
- **POST** `/api/admin/keyword-analysis`
- 인증: admin only
- 요청: `{ keyword: string }`
- 응답: `{ keyword: KeywordAnalysis, relatedKeywords: KeywordAnalysis[] }`
- HMAC-SHA256 서명 필요
- 포화도 계산: 별도로 section.blog.naver.com에서 발행량 조회
- 환경변수 없으면 `{ keyword: null, relatedKeywords: [], error: "API 키 미설정" }`

### 2.3 포스팅 진단
- **POST** `/api/admin/post-diagnosis`
- 인증: admin only
- 요청: `DiagnosisInput`
- 응답: `{ results: DiagnosisItem[], overallScore: number }`
- overallScore = pass 수 / 전체 수 × 100

### 2.4 블로그 벤치마킹
- **GET** `/api/admin/blog-benchmark?keyword={keyword}&count=3`
- 인증: admin only
- 응답: `{ blogs: BlogBenchmark[], average: Omit<BlogBenchmark, 'url' | 'title'> }`
- 크롤링 간 500ms 딜레이

## 3. 컴포넌트 구조

### 3.1 keyword-analysis-panel.tsx
```
KeywordAnalysisPanel
├── 키워드 입력 + 분석 버튼
├── KeywordInfoCard (검색량, 입찰가, 경쟁도, 포화도)
├── RelatedKeywordsTable (정렬 가능: 검색량/CTR/경쟁도)
└── TOP3BlogSummary (추후 구현 뱃지)
```
- 상태: keyword(string), results(KeywordAnalysis[]), isLoading(boolean)
- fetch: POST `/api/admin/keyword-analysis`

### 3.2 post-diagnosis-panel.tsx
```
PostDiagnosisPanel
├── 입력 폼 (제목, 본문 textarea, 타겟 키워드, 이미지 수)
├── DiagnosisResultCards × 6 (pass/warn/fail)
└── OverallScoreGauge (원형 게이지)
```
- 상태: input(DiagnosisInput), results(DiagnosisItem[]), score(number)
- fetch: POST `/api/admin/post-diagnosis`

### 3.3 organic-keywords-tab.tsx (수정)
기존 키워드 목록 아래에 Tabs 추가:
```
OrganicKeywordsTab (기존)
├── 기존 키워드 테이블 + 페이지네이션
└── 분석 도구 섹션 (새로 추가)
    ├── Tab: 키워드 분석 → KeywordAnalysisPanel
    ├── Tab: 금칙어 체크 → ForbiddenCheckSection (인라인)
    └── Tab: 벤치마킹 → BlogBenchmarkSection (인라인)
```

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| 환경변수 미설정 | 빈 결과 반환 + UI에 "API 키 미설정" 안내 |
| 네이버 API rate limit | 200~500ms 딜레이 + 재시도 없음 |
| 네이버 API 응답 파싱 실패 | null 반환 + console.error |
| 크롤링 대상 없음 | 빈 배열 반환 |
| 비속어 DB 매칭 없음 | 빈 배열 반환 (정상) |
| 인증 실패 | 401/403 JSON 응답 |

## 5. 구현 순서 체크리스트

### backend-dev
- [ ] T1: `src/lib/naver-forbidden.ts` — checkForbiddenWord, checkForbiddenWords
- [ ] T1: `src/app/api/admin/forbidden-check/route.ts`
- [ ] T3: `src/lib/profanity-db.ts` — 300+ 단어, checkProfanity
- [ ] T2: `src/lib/naver-keyword.ts` — HMAC 서명, getKeywordAnalysis, getPublishedCount
- [ ] T2: `src/app/api/admin/keyword-analysis/route.ts`
- [ ] T5: `src/lib/naver-blog-scraper.ts` — benchmarkTopBlogs
- [ ] T5: `src/app/api/admin/blog-benchmark/route.ts`
- [ ] T4: `src/lib/post-diagnosis.ts` — diagnosePost (profanity-db 의존)
- [ ] T4: `src/app/api/admin/post-diagnosis/route.ts`

### frontend-dev
- [ ] T2-UI: `src/components/organic/keyword-analysis-panel.tsx`
- [ ] T4-UI: `src/components/organic/post-diagnosis-panel.tsx`
- [ ] T6: `src/components/organic/organic-keywords-tab.tsx` 수정 (3개 분석 탭 추가)

### 공통
- [ ] tsc --noEmit 통과
- [ ] next lint 통과
- [ ] npm run build 성공
