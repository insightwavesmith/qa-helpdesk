# Gap Analysis: qa-curation-quality-t1t6

> 작성: 2026-03-05
> 비교 대상: `docs/02-design/features/qa-curation-quality-t1t6.design.md` vs 실제 구현
> 분석 파일: domain-intelligence.ts, knowledge.ts, post-body.tsx, route.ts

---

## 종합 결과

| 항목 | 설계 항목 수 | 일치 | 부분 일치 | 불일치 | Match Rate |
|------|-------------|------|-----------|--------|------------|
| T1 — 도메인 인텔리전스 Brave 용어 정의 | 6 | 5 | 1 | 0 | 91.7% |
| T2 — QA_SYSTEM_PROMPT 3단 구조 | 2 | 2 | 0 | 0 | 100% |
| T3 — Few-shot 톤 예시 | 2 | 2 | 0 | 0 | 100% |
| T5 — 이미지 제거 로직 + HTML 태그 금지 | 3 | 3 | 0 | 0 | 100% |
| T6 — 글자수 기준 변경 | 4 | 4 | 0 | 0 | 100% |
| **전체** | **17** | **16** | **1** | **0** | **97.1%** |

---

## T1: DomainAnalysis 인터페이스 + Brave Search 용어 정의

### T1-1. DomainAnalysis 인터페이스 확장 (termDefinitions 필드)

**파일**: `src/lib/domain-intelligence.ts` (L23~L32)

**설계**:
```typescript
termDefinitions: Array<{ term: string; definition: string }>; // NEW T1
```

**구현**:
```typescript
termDefinitions: Array<{ term: string; definition: string }>; // T1: Brave 용어 정의
```

**판정**: MATCH -- 타입 시그니처 동일. 주석 문구만 미세 차이 (기능 무관).

---

### T1-2. searchBrave import 추가

**파일**: `src/lib/domain-intelligence.ts` (L4)

**설계**:
```typescript
import { searchBrave } from "@/lib/brave-search";
```

**구현**:
```typescript
import { searchBrave } from "@/lib/brave-search";
```

**판정**: MATCH -- 정확히 일치.

---

### T1-3. analyzeDomain() 내 Brave Search 용어 정의 조회 로직

**파일**: `src/lib/domain-intelligence.ts` (L154~L188)

**설계 주요 사항**:
- `normalizedTerms.length > 0 && process.env.BRAVE_API_KEY` 조건 체크
- `keyTerms = normalizedTerms.slice(0, 2)` (최대 2개)
- `searchBrave({ query: \`${t.normalized} 뜻\`, count: 2, country: "KR" })`
- `results[0].description.slice(0, 300)`
- `Promise.race` with 5초 타임아웃
- `catch` 블록에서 `console.warn` + 빈 배열 유지

**구현 vs 설계 비교**:

| 항목 | 설계 | 구현 | 일치 |
|------|------|------|------|
| 조건 체크 | `normalizedTerms.length > 0 && process.env.BRAVE_API_KEY` | 동일 | O |
| keyTerms 추출 | `.slice(0, 2)` | 동일 | O |
| searchBrave 호출 파라미터 | `query: \`${t.normalized} 뜻\`, count: 2, country: "KR"` | 동일 | O |
| description 길이 제한 | `.slice(0, 300)` | 동일 | O |
| 타임아웃 메커니즘 | `Promise.race` + 5초 `setTimeout` | 동일 | O |
| 에러 처리 | `console.warn` + 빈 배열 | 동일 | O |

**PARTIAL MATCH -- 타임아웃 fallback 타입 미세 차이**:

설계:
```typescript
new Promise<null[]>((resolve) =>
  setTimeout(() => resolve(keyTerms.map(() => null)), 5000)
)
```

구현:
```typescript
new Promise<({ term: string; definition: string } | null)[]>((resolve) =>
  setTimeout(() => resolve(keyTerms.map(() => null)), 5000)
)
```

구현이 더 정확한 타입을 사용하고 있다. 설계의 `null[]`은 `Promise.race`에서 `Promise.all`의 반환 타입과 union될 때 타입 추론이 약할 수 있으므로, 구현 쪽이 타입 안전성 면에서 개선된 형태이다. 런타임 동작은 동일하다.

**판정**: PARTIAL MATCH (타입 시그니처 개선 -- 기능 동일, 타입만 더 정확)

---

### T1-4. return 문에 termDefinitions 포함

**파일**: `src/lib/domain-intelligence.ts` (L190~L207)

**설계**:
```typescript
return {
  // ... 기존 필드 ...
  termDefinitions, // NEW T1
};
```

**구현**:
```typescript
return {
  normalizedTerms,
  intent: String(parsed.intent || question),
  questionType: /* ... */,
  complexity: /* ... */,
  suggestedSearchQueries: /* ... */,
  skipRAG: Boolean(parsed.skipRAG),
  directAnswer: parsed.directAnswer ? String(parsed.directAnswer) : undefined,
  termDefinitions,
};
```

**판정**: MATCH -- `termDefinitions` 필드가 return 객체에 포함됨. 기존 필드 모두 보존됨.

---

### T1-5. buildDomainContext() 함수 확장 (knowledge.ts)

**파일**: `src/lib/knowledge.ts` (L511~L534)

**설계**:
```typescript
// T1: 용어 정의 (Brave Search 결과)
if (analysis.termDefinitions && analysis.termDefinitions.length > 0) {
  const defs = analysis.termDefinitions
    .map((d) => `- ${d.term}: ${d.definition}`)
    .join("\n");
  parts.push(`## 용어 정의\n${defs}`);
}
```

**구현** (L521~L527):
```typescript
// T1: 용어 정의 (Brave Search 결과)
if (analysis.termDefinitions && analysis.termDefinitions.length > 0) {
  const defs = analysis.termDefinitions
    .map((d) => `- ${d.term}: ${d.definition}`)
    .join("\n");
  parts.push(`## 용어 정의\n${defs}`);
}
```

**판정**: MATCH -- 코드 완전 일치. 기존 `normalizedTerms` 및 `intent` 섹션 보존됨.

---

### T1-6. 기존 코드 보존 확인

- `normalizedTerms` 매핑 로직: 보존됨 (L514~L518)
- `intent` 섹션: 보존됨 (L529~L531)
- `DomainAnalysis` 기존 필드 7개: 모두 보존됨 (L24~L30)

**판정**: MATCH -- 기존 기능 삭제 없음.

---

## T2: QA_SYSTEM_PROMPT 3단 구조 포맷

### T2-1. 3단 구조 텍스트 삽입

**파일**: `src/lib/knowledge.ts` (L95~L106)

**설계 삽입 위치**: "메타 광고 10년 차..." 뒤, "말투 규칙:" 앞

**설계 텍스트**:
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

**구현** (L95~L106):
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

**판정**: MATCH -- 텍스트 완전 일치. "말투 규칙:" 직전 위치에 삽입됨 (L107).

---

### T2-2. 기존 "말투 규칙:" 섹션 보존

**구현**: L107 이후 "말투 규칙:" 섹션이 온전히 유지됨.

**판정**: MATCH -- 기존 규칙 삭제 없음.

---

## T3: Few-shot 톤 예시 (좋은 답변 + 나쁜 답변)

### T3-1. Few-shot 예시 텍스트 삽입

**파일**: `src/lib/knowledge.ts` (L169~L186)

**설계 삽입 위치**: "톤 레퍼런스" 뒤, "셀프 검수" 앞

**설계 텍스트**:
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

**구현** (L169~L185):
동일 텍스트가 정확한 위치에 삽입됨.

**판정**: MATCH -- 텍스트 완전 일치. "셀프 검수" 섹션(L187) 직전 위치.

---

### T3-2. 기존 "셀프 검수" 및 이후 섹션 보존

**구현**: L187 "셀프 검수 (답변 완성 후 반드시 수행):" 이후 4개 체크리스트 항목 + 후속 규칙 모두 보존됨.

**판정**: MATCH -- 기존 규칙 삭제 없음.

---

## T5: 이미지 제거 로직 변경 + HTML 태그 금지

### T5-1. img.closest("figure")?.remove() --> img.remove() (2곳)

**파일**: `src/components/posts/post-body.tsx` (L179~L184)

**설계 변경 1 (data.url이 없을 때)**:
```typescript
// Before: img.closest("figure")?.remove();
// After:  img.remove();
```

**구현** (L179~L180):
```typescript
// 이미지 못 찾으면 img 태그만 제거 (figure 내 텍스트 보존)
img.remove();
```

**설계 변경 2 (catch 블록)**:
```typescript
// Before: img.closest("figure")?.remove();
// After:  img.remove();
```

**구현** (L183~L184):
```typescript
// 에러 시 img 태그만 제거 (figure 내 텍스트 보존)
img.remove();
```

**판정**: MATCH -- 2곳 모두 `img.remove()`로 변경됨. 주석도 설계의 의도대로 수정됨.

---

### T5-2. route.ts HTML 태그 금지 규칙 추가

**파일**: `src/app/api/admin/curation/generate/route.ts` (L192)

**설계**:
```
- 이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성.
- <figure>, <img>, <picture> HTML 태그 생성 절대 금지. 텍스트 콘텐츠만 작성해라.
```

**구현** (L191~L192):
```
- 이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성.
- <figure>, <img>, <picture> HTML 태그 생성 절대 금지. 텍스트 콘텐츠만 작성해라.
```

**판정**: MATCH -- 기존 줄 보존 + 새 줄 추가. 텍스트 완전 일치.

---

## T6: 글자수 기준 변경

### T6-1. 프롬프트 글자수 규칙 변경

**파일**: `src/app/api/admin/curation/generate/route.ts` (L118~L122)

**설계**:
```
## 글자수 (절대 규칙)
- 최소 5,000자 이상 (공백 포함). 5,000자 미만 절대 금지.
- 1개 콘텐츠: 5,000~7,000자
- 2~4개 묶음: 7,000~10,000자
```

**구현** (L118~L121):
```
## 글자수 (절대 규칙)
- 최소 5,000자 이상 (공백 포함). 5,000자 미만 절대 금지.
- 1개 콘텐츠: 5,000~7,000자
- 2~4개 묶음: 7,000~10,000자
```

**판정**: MATCH -- 글자수 규칙 정확히 변경됨.

---

### T6-2. 코드 검증 하한 변경

**파일**: `src/app/api/admin/curation/generate/route.ts` (L300)

**설계**: `if (bodyMd.length < 5000) {`
**구현**: `if (bodyMd.length < 5000) {`

**판정**: MATCH

---

### T6-3. 코드 검증 상한 변경

**파일**: `src/app/api/admin/curation/generate/route.ts` (L302)

**설계**: `} else if (bodyMd.length > 10000) {`
**구현**: `} else if (bodyMd.length > 10000) {`

**판정**: MATCH

---

### T6-4. 경고 메시지 변경 (하한 + 상한)

**파일**: `src/app/api/admin/curation/generate/route.ts` (L301, L303)

**설계 하한**: `` console.warn(`정보공유 생성 결과가 짧음: ${bodyMd.length}자 (기준 5,000자 이상)`); ``
**구현 하한**: `` console.warn(`정보공유 생성 결과가 짧음: ${bodyMd.length}자 (기준 5,000자 이상)`); ``

**설계 상한**: `` console.warn(`정보공유 생성 결과가 김: ${bodyMd.length}자 (기준 10,000자 이하)`); ``
**구현 상한**: `` console.warn(`정보공유 생성 결과가 김: ${bodyMd.length}자 (기준 10,000자 이하)`); ``

**판정**: MATCH -- 4개 경고 메시지 모두 설계대로 변경됨.

---

## 기존 기능 보존 검증

| 영역 | 설계 지시 | 실제 보존 여부 |
|------|----------|---------------|
| CONSUMER_CONFIGS | 변경 금지 | 보존됨 (L200~L303) |
| searchChunks / buildSearchResults | 변경 불필요 | 보존됨 |
| generate() 함수 본체 | T1은 buildDomainContext()만 수정 | 보존됨 |
| brave-search.ts | 기존 searchBrave() 재사용 | import만 추가, 원본 미변경 |
| post-body.tsx markdownToHtml() | IMAGE_PLACEHOLDER 파싱 유지 | 보존됨 (L37~L47) |
| route.ts thumbnailUrl 로직 | Unsplash 검색 유지 | 보존됨 (L313~L336) |
| actions/questions.ts | 변경 없음 | 변경 없음 확인 |

---

## Gap 상세 요약

| # | 항목 | 판정 | 상세 |
|---|------|------|------|
| 1 | T1 DomainAnalysis.termDefinitions 필드 | MATCH | 타입 시그니처 동일 |
| 2 | T1 searchBrave import | MATCH | 정확히 일치 |
| 3 | T1 analyzeDomain() Brave 조회 로직 | PARTIAL MATCH | 타임아웃 Promise 타입을 `null[]` 대신 union 타입으로 개선. 런타임 동작 동일 |
| 4 | T1 return문 termDefinitions 포함 | MATCH | 정확히 포함 |
| 5 | T1 buildDomainContext() termDefinitions 섹션 | MATCH | 코드 완전 일치 |
| 6 | T1 기존 코드 보존 | MATCH | 삭제 없음 |
| 7 | T2 3단 구조 포맷 텍스트 | MATCH | 텍스트/위치 완전 일치 |
| 8 | T2 기존 말투 규칙 보존 | MATCH | 삭제 없음 |
| 9 | T3 좋은/나쁜 예시 텍스트 | MATCH | 텍스트/위치 완전 일치 |
| 10 | T3 기존 셀프 검수 보존 | MATCH | 삭제 없음 |
| 11 | T5 img.remove() 변경 (2곳) | MATCH | 2곳 모두 변경됨 |
| 12 | T5 HTML 태그 금지 규칙 추가 | MATCH | 텍스트 완전 일치 |
| 13 | T6 프롬프트 글자수 규칙 | MATCH | 5,000/7,000/10,000 반영 |
| 14 | T6 코드 검증 하한 | MATCH | 5000 반영 |
| 15 | T6 코드 검증 상한 | MATCH | 10000 반영 |
| 16 | T6 경고 메시지 (하한+상한) | MATCH | 텍스트 완전 일치 |
| 17 | 기존 기능 보존 (전체) | MATCH | 삭제/변경 없음 |

---

## 결론

**전체 Match Rate: 97.1% (16/17 MATCH, 1/17 PARTIAL MATCH, 0/17 MISMATCH)**

유일한 PARTIAL MATCH 항목(T1-3)은 설계 대비 타입 안전성이 **개선**된 방향의 차이이며, 런타임 동작에는 영향이 없다. 설계서의 모든 요구 사항이 구현에 반영되었고, 기존 기능의 삭제나 손상은 발견되지 않았다.
