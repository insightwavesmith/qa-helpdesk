# Q&A 답변 개선 + 정보공유 생성 품질 복구 — 설계서

> 작성: 2026-03-05
> 참조: TASK.md (T1~T6, T4 제외)
> Plan: `docs/01-plan/features/qa-curation-quality-t1t6.plan.md`

---

## 1. 데이터 모델

- DB 변경 없음
- TypeScript 인터페이스 변경 1건:

### DomainAnalysis 인터페이스 확장 (T1)

**파일**: `src/lib/domain-intelligence.ts` (L21~29)

```typescript
// Before
export interface DomainAnalysis {
  normalizedTerms: NormalizedTerm[];
  intent: string;
  questionType: QuestionType;
  complexity: Complexity;
  suggestedSearchQueries: string[];
  skipRAG: boolean;
  directAnswer?: string;
}

// After — termDefinitions 필드 추가
export interface DomainAnalysis {
  normalizedTerms: NormalizedTerm[];
  intent: string;
  questionType: QuestionType;
  complexity: Complexity;
  suggestedSearchQueries: string[];
  skipRAG: boolean;
  directAnswer?: string;
  termDefinitions: Array<{ term: string; definition: string }>; // NEW T1
}
```

---

## 2. API 설계

- 외부 API 엔드포인트 변경 없음
- Brave Search API 호출 추가 (T1):

### T1: Brave Search 용어 정의 조회

**호출 흐름:**
```
analyzeDomain()
  → Sonnet 응답 파싱
  → normalizedTerms 중 핵심 1~2개 추출
  → searchBrave({ query: "{term} 뜻", count: 2, country: "KR" })  // 기존 brave-search.ts 재사용
  → 결과 description → termDefinitions 배열 구성
  → return DomainAnalysis (with termDefinitions)
```

**기존 `searchBrave()` 재사용:**
- `src/lib/brave-search.ts`의 `searchBrave()` 함수를 import하여 사용
- freshness 파라미터: 미설정 (용어 정의는 최신성 불필요)
- count: 2 (결과 2건만)

---

## 3. 컴포넌트 구조

### 3-1. T1: domain-intelligence.ts 변경 상세

**파일**: `src/lib/domain-intelligence.ts`

#### 3-1-1. import 추가 (파일 최상단)

```typescript
import { searchBrave } from "@/lib/brave-search";
```

#### 3-1-2. 용어 정의 조회 함수 추가

`analyzeDomain()` 함수 내부, JSON 파싱 + 유효성 검증 후 (L136 이후), return 전에 삽입:

```typescript
// T1: 핵심 용어 Brave Search 정의 조회
let termDefinitions: Array<{ term: string; definition: string }> = [];
const normalizedTerms = Array.isArray(parsed.normalizedTerms) ? parsed.normalizedTerms : [];

if (normalizedTerms.length > 0 && process.env.BRAVE_API_KEY) {
  try {
    // 핵심 용어 최대 2개 추출
    const keyTerms = normalizedTerms.slice(0, 2);
    const definitionPromises = keyTerms.map(async (t: NormalizedTerm) => {
      const results = await searchBrave({
        query: `${t.normalized} 뜻`,
        count: 2,
        country: "KR",
      });
      if (results.length > 0) {
        // 첫 번째 결과의 description을 정의로 사용
        return {
          term: t.normalized,
          definition: results[0].description.slice(0, 300),
        };
      }
      return null;
    });

    const results = await Promise.race([
      Promise.all(definitionPromises),
      new Promise<null[]>((resolve) =>
        setTimeout(() => resolve(keyTerms.map(() => null)), 5000)
      ),
    ]);

    termDefinitions = results.filter(
      (r): r is { term: string; definition: string } => r !== null
    );
  } catch (err) {
    console.warn("[DomainIntelligence] 용어 정의 조회 실패:", err);
    // 실패 시 빈 배열 — 기존 동작 유지
  }
}
```

#### 3-1-3. return 문에 termDefinitions 추가 (L147~165)

```typescript
return {
  normalizedTerms: /* ... 기존 코드 ... */,
  intent: /* ... */,
  questionType: /* ... */,
  complexity: /* ... */,
  suggestedSearchQueries: /* ... */,
  skipRAG: /* ... */,
  directAnswer: /* ... */,
  termDefinitions, // NEW T1
};
```

#### 3-1-4. null 반환 경로에도 기본값 (선택적)

`analyzeDomain()`이 null을 반환하는 경우는 `knowledge.ts`에서 `domainAnalysis?.termDefinitions`로 optional 접근하므로 별도 처리 불필요.

---

### 3-2. T1: knowledge.ts — termDefinitions 컨텍스트 주입

**파일**: `src/lib/knowledge.ts`

#### 3-2-1. buildDomainContext() 함수 확장 (L481~496)

```typescript
// Before
function buildDomainContext(analysis: DomainAnalysis): string {
  const parts: string[] = [];

  if (analysis.normalizedTerms.length > 0) {
    const terms = analysis.normalizedTerms
      .map((t) => `- ${t.original} → ${t.normalized}: ${t.definition}`)
      .join("\n");
    parts.push(`## 도메인 용어 정규화\n${terms}`);
  }

  if (analysis.intent) {
    parts.push(`## 질문 의도\n${analysis.intent}`);
  }

  return parts.join("\n\n");
}

// After — termDefinitions 섹션 추가
function buildDomainContext(analysis: DomainAnalysis): string {
  const parts: string[] = [];

  if (analysis.normalizedTerms.length > 0) {
    const terms = analysis.normalizedTerms
      .map((t) => `- ${t.original} → ${t.normalized}: ${t.definition}`)
      .join("\n");
    parts.push(`## 도메인 용어 정규화\n${terms}`);
  }

  // T1: 용어 정의 (Brave Search 결과)
  if (analysis.termDefinitions && analysis.termDefinitions.length > 0) {
    const defs = analysis.termDefinitions
      .map((d) => `- ${d.term}: ${d.definition}`)
      .join("\n");
    parts.push(`## 용어 정의\n${defs}`);
  }

  if (analysis.intent) {
    parts.push(`## 질문 의도\n${analysis.intent}`);
  }

  return parts.join("\n\n");
}
```

---

### 3-3. T2: QA_SYSTEM_PROMPT — 3단 구조 포맷

**파일**: `src/lib/knowledge.ts` — `QA_SYSTEM_PROMPT` (L92~168)

**삽입 위치**: L93 (`메타 광고 10년 차...`) 뒤, "말투 규칙:" 앞

**추가 텍스트 (정확한 문자열):**

```
답변 구조 (반드시 지켜라):
**핵심:** [1-2문장으로 질문의 답]

[상세 설명 - 강의 자료 기반]

**정리하면:**
- [실행 가능한 포인트 1]
- [실행 가능한 포인트 2]

- "핵심:"으로 반드시 시작해라. 요약 없이 바로 설명하지 마라.
- "정리하면:"으로 반드시 끝내라. 실행 가능한 포인트를 불릿으로.

```

**Edit 연산:**
```
old_string: "말투 규칙:"
new_string: "답변 구조 (반드시 지켜라):\n**핵심:** [1-2문장으로 질문의 답]\n\n[상세 설명 - 강의 자료 기반]\n\n**정리하면:**\n- [실행 가능한 포인트 1]\n- [실행 가능한 포인트 2]\n\n- \"핵심:\"으로 반드시 시작해라. 요약 없이 바로 설명하지 마라.\n- \"정리하면:\"으로 반드시 끝내라. 실행 가능한 포인트를 불릿으로.\n\n말투 규칙:"
```

---

### 3-4. T3: QA_SYSTEM_PROMPT — few-shot 톤 예시

**파일**: `src/lib/knowledge.ts` — `QA_SYSTEM_PROMPT`

**삽입 위치**: "톤 레퍼런스 (이 톤을 따라해라):" 섹션 뒤, "셀프 검수" 섹션 앞

**추가 텍스트:**

```
답변 예시 (이 톤을 따라해라):

좋은 답변 예시:
**핵심:** 기여기간의 '클릭'이 링크 클릭만으로 바뀐 거다.

기존에는 이미지 확대, 좋아요, 댓글 같은 모든 인터랙션이 '클릭'으로 잡혔거든.
그래서 클릭 후 7일 기여에 과대 집계가 있었다.
이제 CTA 버튼이나 링크를 눌러서 자사몰에 실제로 도착한 사람만 센다.

**정리하면:**
- 전환 숫자가 줄어들어도 실제 매출이 줄어든 건 아닐 수 있다
- 광고관리자 보고된 전환과 실제 매출 대조해서 확인해라

나쁜 답변 예시 (절대 이렇게 쓰지 마라):
안녕하세요! 좋은 질문을 해주셨네요.
기여기간에 대해 알아보도록 하겠습니다.
메타의 기여기간은 광고 성과를 측정하는 기간을 의미합니다...

```

**Edit 연산:**
```
old_string: "셀프 검수 (답변 완성 후 반드시 수행):"
new_string: "답변 예시 (이 톤을 따라해라):\n\n좋은 답변 예시:\n**핵심:** 기여기간의 '클릭'이 링크 클릭만으로 바뀐 거다.\n\n기존에는 이미지 확대, 좋아요, 댓글 같은 모든 인터랙션이 '클릭'으로 잡혔거든.\n그래서 클릭 후 7일 기여에 과대 집계가 있었다.\n이제 CTA 버튼이나 링크를 눌러서 자사몰에 실제로 도착한 사람만 센다.\n\n**정리하면:**\n- 전환 숫자가 줄어들어도 실제 매출이 줄어든 건 아닐 수 있다\n- 광고관리자 보고된 전환과 실제 매출 대조해서 확인해라\n\n나쁜 답변 예시 (절대 이렇게 쓰지 마라):\n안녕하세요! 좋은 질문을 해주셨네요.\n기여기간에 대해 알아보도록 하겠습니다.\n메타의 기여기간은 광고 성과를 측정하는 기간을 의미합니다...\n\n셀프 검수 (답변 완성 후 반드시 수행):"
```

---

### 3-5. T5: route.ts — 이미지 금지 프롬프트 강화

**파일**: `src/app/api/admin/curation/generate/route.ts`

기존 3개 이미지 금지 규칙 유지 + 1줄 추가:

**삽입 위치**: L191 (`이미지 관련 마크다운...`) 뒤에 추가

**Edit 연산:**
```
old_string: "- 이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성."
new_string: "- 이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성.\n- <figure>, <img>, <picture> HTML 태그 생성 절대 금지. 텍스트 콘텐츠만 작성해라."
```

---

### 3-6. T5: post-body.tsx — img 태그만 제거

**파일**: `src/components/posts/post-body.tsx` (L166~186, useEffect 내부)

**변경 2곳:**

#### L179~180 (data.url이 없을 때):

```typescript
// Before
img.closest("figure")?.remove();

// After
img.remove();
```

#### L183~184 (catch 블록):

```typescript
// Before
img.closest("figure")?.remove();

// After
img.remove();
```

**Edit 연산 1 (L179~180):**
```
old_string: "          // 이미지 못 찾으면 figure 요소 자체 제거\n          img.closest(\"figure\")?.remove();"
new_string: "          // 이미지 못 찾으면 img 태그만 제거 (figure 내 텍스트 보존)\n          img.remove();"
```

**Edit 연산 2 (L183~184):**
```
old_string: "        // 에러 시 figure 요소 자체 제거\n        img.closest(\"figure\")?.remove();"
new_string: "        // 에러 시 img 태그만 제거 (figure 내 텍스트 보존)\n        img.remove();"
```

---

### 3-7. T6: route.ts — 글자수 기준 변경

**파일**: `src/app/api/admin/curation/generate/route.ts`

#### 3-7-1. 프롬프트 글자수 규칙 (L118~122)

**Edit 연산:**
```
old_string: "## 글자수 (절대 규칙)\n- 최소 4,000자 이상 (공백 포함). 4,000자 미만 절대 금지.\n- 1개 콘텐츠: 4,000~5,000자\n- 2~4개 묶음: 5,000~7,000자"
new_string: "## 글자수 (절대 규칙)\n- 최소 5,000자 이상 (공백 포함). 5,000자 미만 절대 금지.\n- 1개 콘텐츠: 5,000~7,000자\n- 2~4개 묶음: 7,000~10,000자"
```

#### 3-7-2. 코드 검증 (L299~303)

**Edit 연산 1 (하한):**
```
old_string: "if (bodyMd.length < 2000) {"
new_string: "if (bodyMd.length < 5000) {"
```

**Edit 연산 2 (상한):**
```
old_string: "} else if (bodyMd.length > 7000) {"
new_string: "} else if (bodyMd.length > 10000) {"
```

**Edit 연산 3 (경고 메시지 — 하한):**
```
old_string: "console.warn(`정보공유 생성 결과가 짧음: ${bodyMd.length}자 (기준 2,500자 이상)`);"
new_string: "console.warn(`정보공유 생성 결과가 짧음: ${bodyMd.length}자 (기준 5,000자 이상)`);"
```

**Edit 연산 4 (경고 메시지 — 상한):**
```
old_string: "console.warn(`정보공유 생성 결과가 김: ${bodyMd.length}자 (기준 6,000자 이하)`);"
new_string: "console.warn(`정보공유 생성 결과가 김: ${bodyMd.length}자 (기준 10,000자 이하)`);"
```

---

## 4. 에러 처리

| 태스크 | 시나리오 | 처리 |
|--------|----------|------|
| T1 | BRAVE_API_KEY 미설정 | `termDefinitions: []` 반환, 기존 동작 유지 |
| T1 | Brave Search 타임아웃 (5초) | `termDefinitions: []` 반환, console.warn |
| T1 | Brave Search API 에러 | `termDefinitions: []` 반환, console.warn |
| T2 | AI가 3단 구조를 안 따름 | 프롬프트 규칙이므로 100% 보장 불가 → 모니터링 |
| T3 | AI가 블로그 톤으로 씀 | few-shot 예시로 가이드 + 셀프 검수 규칙으로 보완 |
| T5 | AI가 여전히 figure 태그 생성 | img.remove()로 img만 제거, 텍스트 보존 |
| T5 | figure 안에 img만 있고 텍스트 없음 | 빈 figure 남음 → CSS 상 차지하는 공간 없음 (무해) |
| T6 | 생성 결과 5,000자 미만 | console.warn 경고만 (기존 로직 동일) |
| T6 | 생성 결과 10,000자 초과 | console.warn 경고만 (기존 로직 동일) |

---

## 5. 구현 순서

### Phase 1: Q&A 파이프라인 (T1 → T2 → T3)

- [ ] 1-1. `domain-intelligence.ts` — `searchBrave` import 추가
- [ ] 1-2. `domain-intelligence.ts` — `DomainAnalysis` 인터페이스에 `termDefinitions` 필드 추가
- [ ] 1-3. `domain-intelligence.ts` — `analyzeDomain()` 내 Brave Search 용어 정의 조회 로직 추가
- [ ] 1-4. `domain-intelligence.ts` — return 문에 `termDefinitions` 포함
- [ ] 1-5. `knowledge.ts` — `buildDomainContext()` 에 `termDefinitions` 처리 추가
- [ ] 1-6. `knowledge.ts` — `QA_SYSTEM_PROMPT`에 3단 구조 포맷 규칙 추가 (T2)
- [ ] 1-7. `knowledge.ts` — `QA_SYSTEM_PROMPT`에 few-shot 좋은/나쁜 예시 추가 (T3)
- [ ] 1-8. 빌드 확인 (`npx tsc --noEmit --quiet`)

### Phase 2: 정보공유 품질 복구 (T5 → T6)

- [ ] 2-1. `route.ts` — systemPrompt에 HTML 이미지 태그 금지 규칙 추가 (T5)
- [ ] 2-2. `post-body.tsx` — `img.closest("figure")?.remove()` → `img.remove()` 변경 2곳 (T5)
- [ ] 2-3. `route.ts` — 프롬프트 글자수 규칙 변경 (T6)
- [ ] 2-4. `route.ts` — 코드 검증 하한/상한 변경 (T6)
- [ ] 2-5. 빌드 확인 (`npx tsc --noEmit --quiet`)

### Phase 3: 최종 검증

- [ ] 3-1. `npm run build` 성공
- [ ] 3-2. `npx next lint --quiet` — lint 에러 0개
- [ ] 3-3. 기존 기능 깨지지 않음 확인

---

## 6. 변경 요약

| 파일 | 변경 유형 | 태스크 | 위험도 |
|------|----------|--------|--------|
| `src/lib/domain-intelligence.ts` | 인터페이스 확장 + Brave 호출 추가 | T1 | 낮음 (실패 시 빈 배열) |
| `src/lib/knowledge.ts` | QA_SYSTEM_PROMPT 텍스트 추가 + buildDomainContext 확장 | T1, T2, T3 | 낮음 (프롬프트 텍스트만) |
| `src/app/api/admin/curation/generate/route.ts` | systemPrompt 수정 + 코드 검증 수치 변경 | T5, T6 | 낮음 |
| `src/components/posts/post-body.tsx` | useEffect 내 img 제거 로직 변경 | T5 | 낮음 |

**총 변경 파일**: 4개
**DB 변경**: 없음
**패키지 추가**: 없음
**API 엔드포인트 변경**: 없음

---

## 7. 영향 범위 (변경하지 않는 영역)

| 영역 | 이유 |
|------|------|
| `CONSUMER_CONFIGS` | consumer 설정 변경 금지 |
| `searchChunks` / `buildSearchResults` | RAG 로직 변경 불필요 |
| `generate()` 함수 본체 | T1은 buildDomainContext()만 수정 |
| `brave-search.ts` | 기존 `searchBrave()` 함수 그대로 재사용 |
| `unsplash/search/route.ts` | T5에서 불필요 (TASK.md 범위 외) |
| `post-body.tsx` markdownToHtml() | 기존 IMAGE_PLACEHOLDER 파싱 로직 유지 (기존 글 호환) |
| `route.ts` thumbnailUrl 로직 | 커버 이미지 Unsplash 검색 유지 |
| `actions/questions.ts` | createAIAnswerForQuestion 변경 없음 |
