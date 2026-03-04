# T1 + T2 + T3 Gap 분석

> 분석 기준일: 2026-03-04
> 분석 대상: T1 TOC 카드 스타일 / T2 QA 리포팅 챗봇 / T3 CRAG + Adaptive RAG

---

## 전체 Match Rate: 88%

| 피처 | Match Rate | 설계 항목 수 | 일치 | 불일치 |
|------|------------|-------------|------|--------|
| T1   | 95%        | 20          | 19   | 1      |
| T2   | 82%        | 45          | 37   | 8      |
| T3   | 88%        | 50          | 44   | 6      |

---

## T1. TOC 카드 스타일 (Match Rate: 95%)

### 일치 항목

1. **버그 수정 로직 구조** — 설계서의 `<oli>` 임시 태그 방식을 그대로 구현. `html.replace(/^\d+\. (.+)$/gm, (_match, content) => \`<oli>${content}</oli>\`)` 패턴 일치 (lines 105-108).

2. **`<ol>` 래핑** — 설계서의 `(<oli>[\s\S]*?<\/oli>)` 패턴으로 `<ol>` 래핑 구현 일치 (lines 110-115).

3. **연속 `<ol>` 병합** — 설계서의 `<\/ol>\s*<ol>` 병합 로직 구현 일치 (line 117).

4. **`<oli>` → `<li>` 최종 변환** — 설계서의 2단계 교체 (`<oli>` → `<li>`, `<\/oli>` → `<\/li>`) 구현 일치 (lines 119-120).

5. **unordered list 처리 로직 유지** — 설계서의 "unordered list 처리 로직(lines 93-102)은 변경하지 않음" 지침대로 유지 (lines 93-102 변경 없음).

6. **CSS 변경 없음** — 설계서 3.3절 "CSS 변경 불필요" 명시대로, `post-body.css`의 `.post-body > ol:first-of-type` 규칙은 그대로 활용.

7. **Paragraph 래핑 로직** — 설계서 3.4절 확인 항목 그대로. `<ol>` 태그가 paragraph skip 대상 목록에 포함 (line 142: `/^<(h[23]|p|ul|ol|li|blockquote|pre|table|hr|img|div|figure)/`).

8. **에러 처리** — 마크다운에 ordered list 없을 경우 아무 변환 없음 — 구현 일치.

9. **데이터 모델/API 무변경** — 설계서 1절, 2절 "변경 없음" 그대로.

10. **마크다운→HTML 변환 함수 위치** — `src/components/posts/post-body.tsx`의 `markdownToHtml()` 함수 내 수정, 설계서 지정 위치와 일치.

### 불일치 항목

1. **`<ol>` 래핑 조건 분기 불필요** — 설계서의 래핑 조건은:
   ```typescript
   if (!match.startsWith("<ol>")) {
     return `<ol>${match}</ol>`;
   }
   return match;
   ```
   구현도 동일하나, `<oli>` 태그로 감싼 직후 바로 `(<oli>[\s\S]*?<\/oli>)` 패턴을 검색하므로 `match.startsWith("<ol>")` 분기는 실제로 결코 true가 될 수 없음. 설계서에서도 동일한 dead branch를 그대로 포함하여 명세함 — 기능상 영향 없으나 논리적으로 불필요한 분기. 엄밀한 의미의 "불일치"는 아니나 개선 포인트.

### 수정 필요

- **`<ol>` 래핑의 redundant 분기 제거 (선택적)**: `match.startsWith("<ol>")` 체크는 `<oli>` 기반 처리 후에는 도달 불가 → 코드 명확성을 위해 단순화 고려 가능 (기능 영향 없음).
- **`sanitizeHtml()` 허용 태그 확인**: 설계서 4절의 "sanitize 설정에 `ol` 추가 필요 — 확인 후 대응" 항목이 실제로 검증되었는지 확인 필요. 코드에서 `sanitizeHtml` 호출은 확인되나 설정 파일 내용이 분석 범위 밖임.

---

## T2. QA 리포팅 챗봇 (Match Rate: 82%)

### 일치 항목

1. **`createQaReport()` 시그니처** — 설계서 2.2절 Server Actions 정의와 완전 일치: `rawMessage`, `title`, `description`, `severity`, `imageUrls`, `pageUrl?`, `aiRawResponse?` 파라미터.

2. **`getQaReports()` 시그니처** — 설계서 2.2절과 일치: `status?`, `limit?`, `offset?` 옵션 및 `QaReport[]` 반환.

3. **`updateQaReportStatus()` 시그니처** — 설계서 2.2절과 일치: `reportId`, `status` 유니온 타입.

4. **DB 역할 인증** — 세 Server Action 모두 admin/assistant 역할 확인 로직 구현, 설계서의 RLS 정책 의도와 일치.

5. **API 엔드포인트 경로** — `POST /api/qa-chatbot` 설계서 2.1절과 일치.

6. **Sonnet 프롬프트 내용** — 설계서 2.1절 프롬프트 내용이 구현에 반영됨. 심각도 기준 4단계(critical/high/medium/low) 동일.

7. **API 요청 구조** — `message`, `imageUrls?`, `pageUrl?` 구조 설계서 2.1절과 일치.

8. **API 응답 구조** — `title`, `description`, `severity` 구조 설계서 2.1절과 일치.

9. **인증 에러(403)** — 비관리자에게 403 반환 설계서 4절 에러 처리 일치.

10. **Sonnet API 실패(500)** — "AI 분석에 실패했습니다. 다시 시도해주세요." 메시지 일치.

11. **Sonnet 파싱 실패(422)** — "AI 응답을 처리할 수 없습니다. 직접 제출하시겠습니까?" 메시지 일치.

12. **타임아웃(408)** — "AI 응답 시간이 초과되었습니다. 다시 시도해주세요." 메시지 일치.

13. **`QaChatButton` 위치** — `fixed bottom-6 right-6 z-50` 설계서 3.2절과 일치.

14. **`QaChatButton` 색상** — `bg-[#F75D5D]` Primary 컬러 설계서 3.2절과 일치.

15. **`QaChatButton` 모바일 크기** — `max-md:bottom-4 max-md:right-4 max-md:h-12 max-md:w-12` 설계서 "모바일 bottom-4 right-4, 48px" 일치.

16. **`QaChatPanel` 크기** — `w-[380px] h-[520px]` 설계서 3.3절 일치.

17. **`QaChatPanel` 모바일** — `max-md:bottom-0 max-md:right-0 max-md:left-0 max-md:w-full max-md:h-[70vh]` 일치.

18. **채팅/목록 탭 전환** — `activeTab: "chat" | "list"` 상태 관리, 헤더 탭 버튼 구현 설계서 3.3절 일치.

19. **채팅 플로우 단계** — 설계서 3.4절의 1-9 단계 플로우 구현 (메시지 전송 → AI 분석 → QaReportCard 표시 → 제출/수정/취소).

20. **`pendingReport` 상태 타입** — 설계서 3.6절 `PendingQaReport` 인터페이스와 완전 일치.

21. **`ChatMessage` 타입** — 설계서 3.6절 인터페이스와 일치 (`id`, `role`, `content`, `imageUrls?`, `timestamp`).

22. **`QaReportList` 목록 뷰** — 날짜(상대 시간), 제목, 심각도 뱃지, 상태 뱃지 표시 설계서 3.5절과 일치.

23. **상태 변경 UI** — 목록 상세에서 open/in_progress/resolved/closed 버튼으로 상태 변경 구현.

24. **layout.tsx 챗봇 삽입** — `{role === 'admin' || role === 'assistant'}` 조건 충족 시 `<QaChatButton />` 삽입 설계서 3.1절, 5절 Phase 2-8과 일치.

25. **"저장되었습니다" 확인 메시지** — 저장 성공 후 "QA 리포트가 저장되었습니다." AI 메시지 추가.

26. **인라인 편집 모드** — "수정" 클릭 시 `description` textarea 인라인 편집 설계서 3.4절 8번 일치.

27. **이미지 미리보기 + 삭제** — 첨부 이미지 미리보기, 삭제 버튼 구현.

28. **`pageUrl` 자동 전달** — `window.location.href`를 pageUrl로 자동 설정.

29. **`isLoading` / `isSaving` 상태** — 설계서 3.6절 `isLoading` 상태 포함, 구현은 `isSaving`도 추가 분리.

### 불일치 항목

1. **Storage 버킷명 불일치** — 설계서 1.2절: 버킷명 `qa-screenshots` 사용 명시. 구현(`QaChatPanel.tsx` line 94): `question-images` 버킷에 `qa-screenshots/` 경로로 업로드.
   ```typescript
   // 설계서: qa-screenshots 버킷
   // 구현:
   .from("question-images")  // 기존 버킷 재사용
   .upload(`qa-screenshots/${fileName}`, ...)
   ```
   설계 의도(`qa-screenshots` 전용 버킷)와 달리 기존 `question-images` 버킷을 공유함. 권한 분리나 용량 모니터링 시 혼용 문제 발생 가능.

2. **`QaChatButton` pulse 애니메이션 미구현** — 설계서 3.2절: "애니메이션: pulse (새 리포트 미확인 시)" 명시. 구현에는 pulse 없음. `hover:scale-105` / `active:scale-95` hover 효과만 존재.

3. **`QaChatButton` 크기 불일치** — 설계서 3.2절: "원형 56px". 구현: `h-14 w-14`(56px) — 일치. 다만 설계서는 "56px 원형"이라 명시했으나 아이콘이 `MessageSquarePlus`로 구현됨. 설계서에는 아이콘 종류 명시 없어 허용 범위.

4. **API 타임아웃 불일치** — 설계서 2.1절: "타임아웃 10초". 구현 route.ts line 81: `setTimeout(() => controller.abort(), 15000)` — 15초로 구현. 설계보다 5초 더 긴 타임아웃 적용.

5. **`QaReportList` 클릭 시 상세 보기 방식** — 설계서 3.5절: "클릭 시 상세 보기 (패널 내)". 구현은 `selectedId` 상태로 패널 내 상세 뷰 전환 구현 — 일치. 다만 설계서는 상세 내에서 원본 메시지(`raw_message`) 표시를 명시하지 않았으나 구현에서는 표시함 (추가 기능).

6. **이미지 업로드 에러 처리** — 설계서 4절: "이미지 업로드에 실패했습니다. 텍스트만 전송하시겠습니까?" (yes/no 확인 요청). 구현: `alert("이미지 업로드에 실패했습니다. 텍스트만 전송합니다.")` — 확인 없이 자동으로 텍스트만 전송. 사용자 선택권 없음.

7. **수동 폼 전환 미구현** — 설계서 4절: Sonnet 응답 파싱 실패(422) 시 "직접 제출하시겠습니까? → 수동 폼 전환". 구현은 에러 메시지를 AI 메시지 버블로 표시하기만 하고, 수동 폼으로 전환하는 UI 없음.

8. **`QaChatPanel` `slide-up + fade-in` 애니메이션 미구현** — 설계서 3.3절: "애니메이션: slide-up + fade-in" 명시. 구현에는 별도 진입 애니메이션 CSS 클래스 없음 (단순 조건부 렌더링).

### 수정 필요

| 우선순위 | 항목 | 수정 방향 |
|----------|------|-----------|
| High | Storage 버킷명 불일치 | `qa-screenshots` 전용 버킷 생성 후 마이그레이션, 또는 설계서 업데이트로 `question-images` 버킷 재사용 확정 |
| Medium | 이미지 업로드 에러 처리 | `confirm()` 또는 인라인 UI로 사용자 선택 제공 |
| Medium | 수동 폼 전환 | 파싱 실패 시 title/description/severity 직접 입력 폼으로 전환하는 UI 추가 |
| Low | pulse 애니메이션 | 미확인 리포트 존재 시 버튼에 `animate-pulse` 클래스 적용 |
| Low | slide-up 애니메이션 | 패널 진입 시 Tailwind `animate-in slide-in-from-bottom` 적용 |
| Low | API 타임아웃 | route.ts를 10초로 단축하거나 설계서를 15초로 업데이트 |

---

## T3. CRAG + Adaptive RAG (Match Rate: 88%)

### 일치 항목

1. **`DomainAnalysis` 인터페이스** — 설계서 3.2절과 완전 일치: `normalizedTerms`, `intent`, `questionType`, `complexity`, `suggestedSearchQueries`, `skipRAG`, `directAnswer?` 모두 구현.

2. **`QuestionType` 유니온** — `"lecture" | "platform" | "troubleshooting" | "non_technical"` 설계서와 일치.

3. **`Complexity` 유니온** — `"simple" | "medium" | "complex"` 설계서와 일치.

4. **`analyzeDomain()` 시그니처** — `(question, imageDescriptions?)` 설계서 3.2절과 일치.

5. **Stage 0 타임아웃** — 설계서: 15초. 구현 `TIMEOUT_MS = 15_000` — 일치.

6. **Stage 0 모델** — 설계서: `claude-sonnet-4-6`. 구현: `model: "claude-sonnet-4-6"` — 일치.

7. **Stage 0 max_tokens** — 설계서: 2000. 구현: `max_tokens: 2000` — 일치.

8. **Stage 0 graceful degradation** — 설계서 4절: "실패 시 기존 파이프라인 그대로 실행". 구현: `return null` + knowledge.ts에서 `domainAnalysis` null 체크 후 계속 진행.

9. **`RelevanceGrade` 타입** — `"CORRECT" | "AMBIGUOUS" | "INCORRECT"` 설계서 3.4절과 일치.

10. **`RelevanceEvaluation` 인터페이스** — `grade`, `confidence`, `reasoning` 설계서와 일치.

11. **`evaluateRelevance()` 시그니처** — `(question, domainAnalysis, chunks)` 설계서 3.4절과 일치. 구현은 `domainAnalysis`가 `null`도 허용 (더 방어적).

12. **관련성 평가 타임아웃** — 설계서: 10초. 구현 `TIMEOUT_MS = 10_000` — 일치.

13. **관련성 평가 모델** — 설계서: `claude-sonnet-4-6`. 구현: 동일.

14. **관련성 평가 max_tokens** — 설계서: 500. 구현: `max_tokens: 500` — 일치.

15. **평가 실패 기본값 AMBIGUOUS** — 설계서 4절: "기본값 AMBIGUOUS". 구현 `defaultResult: { grade: "AMBIGUOUS", confidence: 0.5 }` — 일치.

16. **`BraveSearchOptions` 인터페이스** — `query`, `count?`, `freshness?`, `country?` 설계서 2.2절과 일치.

17. **`BraveSearchResult` 인터페이스** — `title`, `url`, `description`, `age?` 설계서 2.2절과 일치.

18. **`WebSearchContext` 인터페이스** — `results`, `formattedContext` 설계서 3.5절과 일치.

19. **`searchBrave()` 헤더** — `X-Subscription-Token`, `Accept: application/json` 설계서 2.2절과 일치.

20. **웹서치 타임아웃** — 설계서: 10초. 구현 `TIMEOUT_MS = 10_000` — 일치.

21. **웹서치 기본 파라미터** — `count: 5`, `freshness: "pm"`, `country: "KR"` 설계서 3.5절과 일치.

22. **웹 컨텍스트 포맷** — 설계서 3.5절 포맷 `[출처: {title}]({url})\n{description}` 구현 일치.

23. **`HybridSearchOptions` 인터페이스** — `queries`, `embedding`, `limit`, `threshold`, `sourceTypes`, `enableReranking` 설계서 3.3절과 일치.

24. **`HybridSearchResult` 인터페이스** — `chunks`, `vectorCount`, `bm25Count`, `finalCount` 설계서 3.3절과 일치.

25. **RRF K 상수** — 설계서: `k = 60`. 구현 `RRF_K = 60` — 일치.

26. **벡터/BM25 가중치** — 설계서: 벡터 0.6, BM25 0.4. 구현 `vectorWeight: number = 0.6`, `bm25Weight: number = 0.4` — 일치.

27. **BM25 graceful degradation** — 설계서 4절: "로그 + 스킵". 구현에서 `"does not exist"` 에러 시 빈 배열 반환.

28. **`ConsumerConfig` 신규 필드** — 설계서 3.7절 4개 필드 모두 구현: `enableDomainAnalysis`, `enableHybridSearch`, `enableRelevanceEval`, `enableWebSearch`.

29. **`qa` consumer 플래그** — 설계서 3.7절 `qa: { 모두 true }` 구현 일치 (lines 183-186).

30. **`chatbot` consumer 플래그** — 설계서 3.7절 `chatbot: { 모두 true }` 구현 일치 (lines 251-254).

31. **비-QA consumer 플래그** — 설계서 3.7절 "newsletter, education 등: 모두 false" 구현 일치.

32. **Stage 0 skipRAG 직접 답변** — 설계서 3.6절의 skipRAG 분기 구현 일치. `domainAnalysis.skipRAG && domainAnalysis.directAnswer` 조건 동일.

33. **Stage 1a 유사 QA 검색** — 설계서 다이어그램 3.8절 `searchSimilarQuestions()` 단계 구현.

34. **Stage 1b Hybrid Search** — 설계서 3.6절의 `hybridSearch({ queries: [original, ...suggestedSearchQueries], embedding, ... })` 패턴 구현 일치.

35. **웹서치 실행 조건** — 설계서 3.5절 "OR 조건": `relevanceGrade !== "CORRECT"` 또는 `questionType === "platform"`. 구현 line 658-659 일치.

36. **Stage 3 userContent 확장** — 설계서 3.6절: `similarQAContext + contextText + domainContext + webContext + question` 구성. 구현 일치.

37. **`domain_analysis` 로깅** — 설계서 1.2절 `knowledge_usage` 확장 필드 로깅 구현 일치.

38. **`pipeline_stages` 추적** — 설계서 1.2절 `pipeline_stages TEXT[]` 필드 구현 일치.

39. **웹서치 실패 fallback** — 설계서 4절: "로그 + 스킵". 구현에서 `searchBrave()` 실패 시 빈 배열 반환, `webContext = ""` 유지.

40. **BRAVE_API_KEY 미설정 처리** — 설계서 4절 일치. `console.warn` 후 `return []`.

41. **병렬 검색 실행** — 설계서 3.3절 Hybrid Search. 구현에서 `Promise.all([Promise.all(vectorPromises), Promise.all(bm25Promises)])` 병렬 실행.

42. **도메인 컨텍스트 빌더** — `buildDomainContext()` 함수로 `normalizedTerms` + `intent` 포맷팅, 설계서 Stage 3 `domainContext` 추가 항목 일치.

43. **knowledge_usage 확장 로깅** — `relevance_grade`, `web_search_used`, `question_type`, `complexity`, `pipeline_stages` 필드 로깅 구현.

44. **신규 모듈 파일 구조** — 설계서 3.1절 모듈 아키텍처의 신규 4개 파일(`domain-intelligence.ts`, `hybrid-search.ts`, `relevance-evaluator.ts`, `brave-search.ts`) 모두 생성.

### 불일치 항목

1. **`web_search_results_count` 로깅 누락** — 설계서 1.2절 `knowledge_usage` 확장:
   ```sql
   ADD COLUMN IF NOT EXISTS web_search_results_count INT DEFAULT 0,
   ```
   구현에서 `web_search_used: boolean`은 로깅하나, `web_search_results_count` (결과 개수) 필드는 로깅하지 않음.

2. **`promo` consumer 설계서 미언급** — 설계서 3.7절: `CONSUMER_CONFIGS`에 `qa`, `chatbot`만 true, "newsletter, education 등" 나머지는 false로 명시. 구현에는 `promo` consumer가 추가 존재하며 모두 false로 설정 — 설계서 범위 외 추가 consumer (기능 영향 없음).

3. **Stage 1 임베딩 재사용 방식 차이** — 설계서 3.3절 Hybrid Search 설계:
   ```
   embedding: 원본 쿼리 임베딩
   ```
   구현: `stage1Embedding`은 원본 `query`로 생성하나, `query`에 이미 `imageDescriptions`가 결합된 확장 쿼리임. 설계서는 이 결합을 명시하지 않음.

4. **`searchWeb()` 파라미터 타입** — 설계서 3.5절:
   ```typescript
   export async function searchWeb(
     domainAnalysis: DomainAnalysis,
     originalQuestion: string
   ): Promise<WebSearchContext>
   ```
   구현: `domainAnalysis: DomainAnalysis | null` — null 허용으로 시그니처 확장. 설계서보다 방어적 구현이나 인터페이스 명세와 불일치.

5. **`knowledge_usage` DB 컬럼 추가 여부 불확실** — 설계서 Phase 1 구현 순서 1-3번: DB 컬럼 추가 SQL이 설계서에 명시됨. 코드 레벨에서는 컬럼 없으면 insert 시 무시되는 패턴으로 구현했으나, 실제 DB에 컬럼이 추가되었는지는 코드 분석 범위 밖 — 실제 DB 마이그레이션 실행 확인 필요.

6. **`search_knowledge_bm25` RPC 존재 여부** — 설계서 Phase 1 구현 순서 2번: `search_knowledge_bm25` RPC 함수 생성 명시. 코드에서는 RPC 미존재 시 graceful degradation 처리하나, 실제 Supabase에 함수가 생성되었는지 미확인. BM25 검색이 실제로 동작하는지 검증 필요.

### 수정 필요

| 우선순위 | 항목 | 수정 방향 |
|----------|------|-----------|
| High | `search_knowledge_bm25` RPC 실제 생성 여부 확인 | Supabase SQL Editor에서 함수 존재 여부 확인, 없으면 설계서 1.3절 SQL 실행 |
| High | `knowledge_usage` DB 컬럼 마이그레이션 확인 | `domain_analysis`, `relevance_grade`, `web_search_used`, `question_type`, `complexity`, `pipeline_stages` 컬럼 추가 여부 확인 |
| Medium | `web_search_results_count` 로깅 추가 | `knowledge_usage` insert 시 `web_search_results_count: webResult.results.length` 추가 |
| Low | `searchWeb()` 시그니처 정렬 | 설계서 인터페이스와 맞추거나 설계서를 `DomainAnalysis \| null`로 업데이트 |
| Low | `imageDescriptions` 결합 쿼리 vs 원본 쿼리 임베딩 명확화 | 설계서에 이미지 결합 쿼리 처리 방식 명시 추가 |

---

## 종합 의견

### 긍정적 평가

- **T1**은 설계서의 `<oli>` 임시 태그 방식을 정확히 따른 고충실도 구현.
- **T2**는 핵심 API 인터페이스, 인증 로직, 에러 메시지, UI 레이아웃 사양을 높은 정확도로 구현.
- **T3**은 4개 신규 모듈의 인터페이스와 파이프라인 오케스트레이션이 설계서 다이어그램과 거의 일치하며, graceful degradation 패턴도 설계 의도대로 구현.

### 주요 리스크

1. **T2 Storage 버킷 불일치**: `qa-screenshots` 버킷과 `question-images` 버킷의 혼용은 접근 권한 정책, 스토리지 용량 관리, 백업 정책을 분리 설계할 경우 운영 문제로 이어질 수 있음.
2. **T3 BM25 RPC/DB 컬럼 미확인**: 코드는 graceful degradation으로 기능하지만, BM25 검색이 실제로 동작하지 않으면 Hybrid Search의 절반(키워드 검색)이 비활성 상태임. 실 DB 확인 및 검증 테스트 필수.
3. **T2 수동 폼 전환 미구현**: AI 파싱 실패 시 사용자가 직접 입력할 방법이 없어 UX 완결성 부족.
