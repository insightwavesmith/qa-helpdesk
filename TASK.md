# TASK.md — 정보공유 생성 v2 (강의 기반 "우리 콘텐츠")
> 2026-02-22 | 외부 크롤링 요약 → Smith님 강의 기반 오리지널 콘텐츠로 전환

## 목표
1. 정보공유 생성 시 RAG 강의 컨텍스트를 "참고"가 아닌 **핵심 기반**으로 전환
2. 프롬프트를 전면 개편하여 강의 관점의 보정/보충/쉬운 표현 적용
3. 출처 표기 제거 (자체 콘텐츠이므로 불필요)
4. 글 구조를 리캐치 스타일 7가지 패턴으로 격상
5. 글자수 기준: 표준 2,500~4,000자 (공백 포함)

## 레퍼런스
- 작성 포맷: `/Users/smith/.openclaw/workspace/skills/content-writing/SKILL.md`
- 콘텐츠 QA: `/Users/smith/.openclaw/workspace/rules/content-qa.md`
- 참고 패턴: 리캐치 블로그 (https://www.recatch.cc/ko/blog)

## 현재 코드

### 정보공유 생성 — `src/app/api/admin/curation/generate/route.ts` (188줄)

```ts
// POST body: { contentIds: string[] } — 1~4개 필수
// Response: { title: string, body_md: string, sourceContents: string[] }

// Sonnet API 직접 호출 (SDK 미사용)
fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }),
});
```

### 현재 System Prompt (문제점 주석 첨부)
```
당신은 자사몰사관학교의 정보공유 글 작성 전문가입니다.
메타(Meta) 광고를 운영하는 자사몰 대표님들을 위한 실용적인 콘텐츠를 작성합니다.

## 작성 규칙
- ~해요 말투 사용
- 한국어만 사용. 영어 단독 제목 금지.
- 전문 용어에는 괄호 설명 추가

## 구조                           ← ❌ 너무 단순. 핵심 포인트 3개 + 팁 1개뿐
1. 훅 1줄
2. "## 핵심 포인트" 헤더 후 핵심 3개 (각 2~3줄)
3. 실무 적용 팁 1개
4. 원문 출처 표기                  ← ❌ 출처 불필요 (강의 기반 자체 콘텐츠)
5. 강의 내용과 비교 섹션 (있으면)    ← ❌ "비교"가 아니라 "기반"이어야 함
```

### 현재 RAG 호출
```ts
// searchChunks(query, limit=5, threshold=0.4, sourceTypes=["lecture","blueprint"])
// 10초 타임아웃, 실패 시 RAG 없이 진행
const ragChunks = await Promise.race([
  searchChunks(searchQuery, 5, 0.4, ["lecture", "blueprint"]),
  new Promise<never>((_, reject) => setTimeout(() => reject(...), 10000)),
]);

// RAG 결과는 User Prompt 하단에 "참고" 섹션으로 추가
// 각 chunk 앞 600자만 포함
```

### RAG 검색 함수 — `src/lib/knowledge.ts` (593줄)
```ts
export async function searchChunks(
  queryText: string,
  limit: number,
  threshold: number,
  sourceTypes?: string[] | null
): Promise<ChunkResult[]>
// 내부: Gemini 임베딩 생성 → supabase.rpc("search_knowledge", {...})
```

### DB 현황
- knowledge_chunks: 1,791건
  - lecture: 547 (강의 스크립트)
  - blueprint: 68 (블루프린트 EP별)
  - crawl: 57 (외부 크롤링)
  - youtube: 7 (유튜브 자막)
  - 기타: file, marketing_theory, webinar, papers 등

## 제약
- Vercel Edge timeout 300초 (maxDuration=300) — RAG 검색 + Sonnet 생성 모두 이 안에
- Anthropic REST API 직접 호출 유지 (SDK 미사용)
- max_tokens 4096 유지 (Sonnet 출력 제한)
- RAG 실패 시에도 생성은 진행해야 함 (graceful degradation)
- 기존 curation.ts의 createInfoShareDraft() 함수 건드리지 말 것

## 태스크

### T1+T3. 프롬프트 전면 개편 + 출처 제거 → Leader
- 파일: `src/app/api/admin/curation/generate/route.ts`
- 의존: 없음
- 완료 기준:
  - [ ] System Prompt를 아래 신규 프롬프트로 교체
  - [ ] "원문 출처 표기" 지시 제거
  - [ ] "강의 내용과 비교" → "강의 기반 재작성" 관점으로 전환
  - [ ] 글자수 가이드 포함 (표준 2,500~4,000자)
  - [ ] 리캐치 7패턴 반영 (숫자 먼저, 볼드 숫자, 인용구, 인라인 CTA, 소셜프루프, 맥락 비교, 구분선)

**신규 System Prompt:**
```
당신은 자사몰사관학교의 콘텐츠 에디터입니다.
외부 트렌드 정보를 기반으로, 자사몰사관학교 강의 관점에서 재해석한 오리지널 콘텐츠를 작성합니다.
독자: 메타(Meta) 광고를 운영하는 자사몰 대표님 (초급~중급)

## 핵심 원칙
- 이 글은 "우리 콘텐츠"다. 외부 글 요약이 아니라 강의 지식 기반의 오리지널 글.
- 강의 내용과 외부 원문이 충돌하면 → 강의 기준으로 수정
- 어려운 용어/표현 → 강의에서 쓰는 쉬운 표현으로 대체
- 사례 → 수강생/자사몰 사례 활용 (강의 컨텍스트에 있으면 적극 활용)
- 강의에서 더 깊게 다루는 부분 → 내용 보충
- 출처/참고 표기 불필요

## 글 구조 (리캐치 패턴)
1. **훅** (1줄): 질문 또는 임팩트 있는 선언
2. **도입부** (2~3문장): 왜 읽어야 하는지, 독자 고민에 공감
3. **목차** (넘버링): 다룰 주제 미리보기

---

4. **본론** (넘버링된 h2 소제목, 2~4개 섹션):
   각 섹션마다:
   - 핵심 숫자 블록 (불릿 + 볼드 숫자) — 숫자 먼저, 설명 나중
   - 본문 — 숫자를 스토리로 풀기. 업계 평균/벤치마크와 비교해서 의미 부여
   - 인용구 (관련 인물이나 수강생 목소리, 있으면)
   - 비유/일상 표현으로 체감시키기
   - 인라인 CTA ("자세히 알아보기 →")는 자사몰사관학교 관련 링크가 있을 때만

---

5. **마치며**: 전체 요약 + 다음 액션 제안

## 글자수
- 표준: 2,500~4,000자 (공백 포함)
- 짧은 글 (단일 팁): 1,500~2,500자
- 긴 글 (종합 가이드): 4,000~6,000자
- 콘텐츠 수에 따라 자동 판단:
  - 1개 콘텐츠 → 표준 (2,500~4,000자)
  - 2~4개 묶음 → 긴 글 (4,000~6,000자)

## 작성 규칙
- ~해요 체 (부드럽고 친근하지만 전문적)
- 한국어 기본. 영어 전문용어는 한글(영어) 병기 (첫 등장만, 이후 한글)
- 숫자로 말하고 스토리로 풀기 — 데이터가 먼저, 감성이 뒤따름
- 문단 짧게 (2~3문장)
- 소제목 넘버링 필수
- 섹션 사이 구분선(---) 필수
- 추측 표현 금지 ("~인 것 같아요")
- 교과서적 정의로 시작 금지 ("~란 ~입니다")

## 강의 컨텍스트 활용법
아래 '강의 컨텍스트'가 제공됩니다. 이것을 글의 기반으로 삼으세요:
- 강의에서 설명한 개념이면 → 강의식 쉬운 표현 사용
- 강의 사례가 있으면 → 구체적으로 인용/각색
- 강의와 외부 원문이 다르면 → 강의 기준으로 쓰되, "최근 업계에서는 ~라는 의견도 있지만" 형태로 언급 가능
- 강의에 없는 새로운 정보면 → 외부 원문 기반으로 쓰되 강의 톤/수준에 맞추기

## 출력 형식
첫 줄: # 한국어 제목 (숫자+임팩트, 예: "ROAS 4배 만드는 ASC 세팅법 3가지")
나머지: 마크다운 본문
```

**신규 User Prompt (단일):**
```
다음 외부 콘텐츠를 참고하여, 자사몰사관학교 강의 관점의 오리지널 정보공유 글을 작성해주세요.

### 외부 콘텐츠: {title}
{body_md 앞 4,000자}

---

### 자사몰사관학교 강의 컨텍스트
아래는 관련 강의/블루프린트 내용입니다. 이것을 글의 기반으로 삼으세요.

{RAG 검색 결과 — 각 chunk}
[{source_type}: {lecture_name}]
{content 앞 800자}

---
```

**신규 User Prompt (다중, 2~4개):**
```
다음 N개 외부 콘텐츠의 공통 주제를 기반으로, 자사몰사관학교 강의 관점의 오리지널 정보공유 글을 작성해주세요.
각 콘텐츠에서 유용한 정보를 뽑되, 강의 내용으로 재해석하고 보충하세요.

[콘텐츠 블록들...]

---

### 자사몰사관학교 강의 컨텍스트
{RAG 검색 결과}
```

### T2. RAG 검색 강화 → Leader
- 파일: `src/app/api/admin/curation/generate/route.ts`
- 의존: T1과 동시 가능 (같은 파일이지만 다른 영역)
- 완료 기준:
  - [ ] RAG 검색 limit 5 → **8**로 증가
  - [ ] 각 chunk content 포함량 600자 → **1,000자**로 증가
  - [ ] sourceTypes에 `"marketing_theory"` 추가: `["lecture", "blueprint", "marketing_theory"]`
  - [ ] 검색 쿼리 개선: title만이 아니라 `key_topics` + `ai_summary`도 포함하여 검색 정확도 향상
  - [ ] RAG 결과가 0건일 때 로그 남기기 (console.warn)

**검색 쿼리 구성 방식:**
```ts
// 현재: 콘텐츠 title만으로 검색 (추정)
// 변경: title + key_topics + ai_summary 첫 200자 조합
const searchQuery = [
  content.title,
  content.key_topics?.join(", ") || "",
  content.ai_summary?.slice(0, 200) || "",
].filter(Boolean).join(" ");
```

### T3. (T1에 통합됨)

## 엣지 케이스

| 상황 | 기대 동작 |
|------|-----------|
| RAG 결과 0건 (강의에 관련 내용 없음) | 외부 원문 기반으로 생성하되, 강의 톤/수준에 맞춤. 로그 남김 |
| RAG 결과 중 외부 원문과 충돌하는 내용 | 강의 기준으로 작성 + "최근 업계에서는 ~" 형태 언급 |
| 외부 원문이 매우 짧음 (<500자) | 강의 컨텍스트를 더 많이 활용하여 보충 |
| 4개 콘텐츠 + 8개 RAG chunk = 토큰 초과 | max_tokens 유지, 입력은 각 콘텐츠 3,000자 + chunk 800자로 조정 |
| ai_tags가 null인 콘텐츠 | title만으로 RAG 검색 (기존 동작 유지) |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-22-info-share-v2.html
- 리뷰 일시:
- 변경 유형: 백엔드 구조 (프롬프트 엔지니어링 + API 로직)
- 피드백 요약:
- 반영 여부:

## 검증
☐ npm run build 성공
☐ 기존 정보공유 생성 기능 정상 동작 (1개 콘텐츠 선택 → 생성)
☐ 다중 콘텐츠(2~4개) 선택 → 생성 정상
☐ 생성된 글이 2,500~4,000자 범위 (단일 콘텐츠 기준)
☐ 생성된 글에 출처 표기 없음
☐ 생성된 글에 강의 내용이 반영됨 (강의 표현/사례 포함)
☐ RAG 결과 0건일 때도 생성 정상 (에러 없음)
☐ 300초 타임아웃 내 완료
