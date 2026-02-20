# TASK.md — QA 지능화: 분리 임베딩 + 2단계 검색
> 2026-02-20 | 승인된 QA를 분리 임베딩하고, 새 질문에 유사 QA + RAG를 결합해 답변하는 구조

## 목표
1. 답변 승인 시 qa_question + qa_answer chunk를 knowledge_chunks에 자동 생성
2. 새 질문 시 유사 기존 질문 매칭(Stage 1) + 전체 RAG(Stage 2) → AI 종합 답변
3. 질문에 이미지가 있으면 Vision → 텍스트 변환 후 검색에 활용
4. QA 0건(초기)일 때 기존 P2 파이프라인과 100% 동일 동작 보장

## 레퍼런스
- 아키텍처 보고서: `https://mozzi-reports.vercel.app/reports/architecture/2026-02-20-qa-intelligence-architecture.html`
- ADR-20: QA 분리 임베딩, ADR-21: 2단계 검색, ADR-22: 이미지 Vision→텍스트
- 참고 패턴: `src/lib/image-embedder.ts` (embedImage), `src/actions/answers.ts` (approveAnswer)

## 현재 코드

### knowledge.ts — SourceType + ConsumerConfig (수정 대상)
```ts
// src/lib/knowledge.ts L22~34
export type SourceType =
  | "lecture" | "blueprint" | "papers" | "qa" | "crawl"
  | "meeting" | "marketing_theory" | "webinar" | "youtube"
  | "assignment" | "feedback";
// ⚠️ "qa_question", "qa_answer" 없음

// qa ConsumerConfig (L120~130)
qa: {
  limit: 5,
  threshold: 0.4,
  tokenBudget: 3000,
  temperature: 0.3,
  sourceTypes: ["lecture", "blueprint", "papers", "qa"],
  // ⚠️ qa_question/qa_answer가 sourceTypes에 없음
  enableReranking: true,
  enableExpansion: true,
  model: "claude-sonnet-4-6-20250514",
},
```

### knowledge.ts — generate() 파이프라인 (수정 대상)
```ts
// src/lib/knowledge.ts L300~320 — generate() 핵심 흐름
export async function generate(request: KnowledgeRequest): Promise<KnowledgeResponse> {
  // Stage 1: buildSearchResults (expansion + multi-search + dedup + rerank)
  const searchResult = await buildSearchResults(query, config, limit, threshold, sourceTypes);
  // Stage 2: buildContext (chunks → 텍스트)
  const contextText = buildContext(chunks, tokenBudget);
  // Stage 3: callLLM (Sonnet 4.6)
  // ⚠️ 유사 질문 매칭 로직 없음
  // ⚠️ 유사 QA 참고 섹션 없음
}
```

### rag.ts — createAIAnswerForQuestion() (수정 대상)
```ts
// src/lib/rag.ts L53~87
export async function createAIAnswerForQuestion(
  questionId: string,
  questionTitle: string,
  questionContent: string
): Promise<boolean> {
  // ⚠️ image_urls 파라미터 없음 — 이미지 전처리 안 함
  const result = await generateRAGAnswer(questionTitle, questionContent);
  // answers INSERT (is_ai: true, is_approved: false)
}

// generateRAGAnswer (L36~51)
export async function generateRAGAnswer(questionTitle, questionContent) {
  const questionText = `${questionTitle}\n\n${questionContent}`;
  return ksGenerate({ query: questionText, consumerType: "qa" });
  // ⚠️ 이미지 설명이 query에 포함되지 않음
}
```

### answers.ts — approveAnswer() (수정 대상)
```ts
// src/actions/answers.ts L121~148
export async function approveAnswer(answerId: string) {
  const supabase = await requireAdmin();
  const { data: answer, error } = await supabase
    .from("answers")
    .update({ is_approved: true, approved_at: new Date().toISOString() })
    .eq("id", answerId)
    .select("question_id")
    .single();
  // 질문 상태 "answered"로 변경
  // ⚠️ embedQAPair() 호출 없음 — QA가 RAG에 안 들어감
}
```

### image-embedder.ts — embedImage() (재사용)
```ts
// src/lib/image-embedder.ts — Vision + 임베딩 파이프라인
export async function embedImage(imageUrl, context): Promise<EmbedImageResult> {
  const description = await generateVisionText(imageUrl, VISION_PROMPT);
  const embedding = await generateEmbedding(description);
  // knowledge_chunks INSERT
}
// ✅ generateVisionText, generateEmbedding 둘 다 gemini.ts에서 export됨
```

### gemini.ts — 사용 가능한 함수
```ts
// src/lib/gemini.ts
export async function generateEmbedding(text: string): Promise<number[]>  // 768d
export async function generateFlashText(prompt, options?): Promise<string>
export async function generateVisionText(imageUrl, prompt): Promise<string>
```

### chunk-utils.ts — chunkText() (재사용)
```ts
// src/lib/chunk-utils.ts
export function chunkText(text: string, maxChars = 700, overlap = 100): string[]
// 한국어 문장 경계 존중, 0-based chunk_index
```

### questions.ts — createQuestion()에서 이미지 전달 (기존)
```ts
// src/actions/questions.ts L130~155
after(async () => {
  await createAIAnswerForQuestion(data.id, formData.title, formData.content);
  // ⚠️ formData.imageUrls를 넘기지 않음
});
```

### DB 상태
- questions.image_urls: jsonb (이미 존재 — UI + actions에서 사용 중)
- answers.image_urls: jsonb (migration 00019)
- knowledge_chunks.source_type: text (CHECK 없음, 자유 추가)
- knowledge_chunks.image_url: text (이미 존재)
- knowledge_chunks.metadata: jsonb (이미 존재)
- knowledge_chunks.embedding: vector(768)
- Storage 버킷: question-images (Public), qa-images (Public)

## 제약
- search_knowledge RPC 시그니처 변경 금지
- knowledge_chunks 스키마 변경 최소화 (인덱스만 추가)
- 기존 Consumer (newsletter, education 등) 동작 변경 없음
- QA 0건일 때 기존 P2 파이프라인과 100% 동일 동작
- Gemini Flash Free tier: 1,500 req/일
- 전체 응답시간 10초 이내 (현재 ~8초 + Stage 1 ~0.3초)
- 임베딩 실패해도 답변 승인은 정상 완료 (fire-and-forget)
- 순환 의존성 주의: rag.ts → knowledge.ts (OK), knowledge.ts → rag.ts (금지)

## 태스크

### T0. DB 마이그레이션 → backend-dev
- 파일: `supabase/migrations/00020_qa_intelligence.sql` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] questions.image_urls jsonb DEFAULT '[]' — `ADD COLUMN IF NOT EXISTS` (이미 있을 수 있음, 안전 처리)
  - [ ] knowledge_chunks에 부분 인덱스 추가:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_kc_qa_question ON knowledge_chunks(source_type)
      WHERE source_type = 'qa_question';
    CREATE INDEX IF NOT EXISTS idx_kc_qa_answer ON knowledge_chunks(source_type)
      WHERE source_type = 'qa_answer';
    CREATE INDEX IF NOT EXISTS idx_kc_metadata_question_id ON knowledge_chunks((metadata->>'question_id'))
      WHERE metadata->>'question_id' IS NOT NULL;
    ```
  - [ ] `npx supabase gen types` 실행하여 database.ts 타입 재생성

### T1. qa-embedder.ts 신규 → backend-dev
- 파일: `src/lib/qa-embedder.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `embedQAPair(questionId: string, answerId: string): Promise<void>` 함수
  - [ ] questions 테이블에서 질문 조회 (title, content, image_urls)
  - [ ] answers 테이블에서 답변 조회 (content, image_urls, is_ai)
  - [ ] 재승인 처리 (F-02): 같은 question_id의 기존 qa_question/qa_answer chunks를 DELETE 후 새로 생성
  - [ ] DELETE: `knowledge_chunks WHERE source_type IN ('qa_question','qa_answer') AND metadata->>'question_id' = questionId`
  - [ ] 질문 이미지 있으면 → `generateVisionText()` → 설명 텍스트 결합
  - [ ] 답변 이미지 있으면 → `generateVisionText()` → 설명 텍스트 결합
  - [ ] 질문 텍스트 = `${title}\n\n${content}` + 이미지 설명 (있으면 `\n\n[이미지: ${description}]`)
  - [ ] 답변 텍스트 = `${answer.content}` + 이미지 설명
  - [ ] 질문 텍스트 → `chunkText()` → 각 chunk마다:
    - `generateEmbedding()` → knowledge_chunks INSERT
    - source_type: 'qa_question'
    - lecture_name: 질문 title (50자 truncate)
    - week: 'qa_question'
    - priority: 2
    - metadata: `{ question_id, answer_id, category: question.category?.slug }`
    - image_url: 첫 번째 질문 이미지 URL (있으면)
  - [ ] 답변 텍스트 → `chunkText()` → 각 chunk마다:
    - `generateEmbedding()` → knowledge_chunks INSERT
    - source_type: 'qa_answer'
    - lecture_name: 질문 title (50자 truncate)
    - week: 'qa_answer'
    - priority: 2
    - metadata: `{ question_id, answer_id, is_ai: answer.is_ai }`
    - image_url: 첫 번째 답변 이미지 URL (있으면)
  - [ ] 전체 try-catch 감싸기 — 실패해도 console.error만. throw 금지
  - [ ] 임베딩 성공 건수 로깅: `[QAEmbed] questionId=${id}, q_chunks=${n}, a_chunks=${m}`

### T2. approveAnswer() 훅 → backend-dev
- 파일: `src/actions/answers.ts` (수정)
- 의존: T1 완료 후
- 완료 기준:
  - [ ] `import { embedQAPair } from "@/lib/qa-embedder"` 추가
  - [ ] approveAnswer()에서 답변 승인 성공 후:
    ```ts
    // fire-and-forget: QA 분리 임베딩
    if (answer?.question_id) {
      Promise.resolve(embedQAPair(answer.question_id, answerId))
        .catch(err => console.error("[QAEmbed] Failed:", err));
    }
    ```
  - [ ] 기존 revalidatePath 로직 변경 없음
  - [ ] 승인 → 질문 status "answered" 변경 로직 변경 없음

### T3. knowledge.ts Stage 0+1 추가 → backend-dev
- 파일: `src/lib/knowledge.ts` (수정)
- 의존: T0 완료 후 (T1과 병렬 가능)
- 완료 기준:
  - [ ] SourceType에 `"qa_question"`, `"qa_answer"` 추가
  - [ ] qa ConsumerConfig.sourceTypes에 `"qa_answer"` 추가 (qa_question은 Stage 1 전용이라 제외)
  - [ ] `searchSimilarQuestions(queryText: string, embedding: number[]): Promise<{question: ChunkResult, answers: ChunkResult[]}[]>` 함수 추가:
    - search_knowledge RPC로 source_type='qa_question'만 검색 (limit 3, threshold 0.70)
    - 결과에서 metadata.question_id 추출
    - 같은 question_id의 qa_answer chunks를 Supabase SELECT로 조회
    - 유사도 0.70 이상인 것만 반환
  - [ ] generate() 함수 수정 — qa/chatbot Consumer일 때만:
    - Stage 0: request에 imageDescriptions가 있으면 query에 결합
    - Stage 1: `searchSimilarQuestions()` 호출
    - 결과를 `buildContext()`의 유사 QA 섹션으로 분리
    - Stage 2: 기존 buildSearchResults() — sourceTypes에서 qa_question, qa_answer 모두 제외 (F-03: 중복 방지)
    - buildSearchResults()에 excludeSourceTypes 파라미터 추가 또는 sourceTypes 필터링
    - Stage 3: callLLM — 유사 QA 있으면 시스템 프롬프트에 참고 섹션 추가
  - [ ] KnowledgeRequest에 `imageDescriptions?: string` 필드 추가 (optional)
  - [ ] QA_SYSTEM_PROMPT에 유사 QA 참고 지시사항 추가:
    ```
    - 유사한 기존 Q&A가 제공되면 내용을 참고하되, 강의 자료와 대조하세요.
    - 기존 답변을 그대로 복사하지 말고, 이 질문의 맥락에 맞게 재구성하세요.
    - 강의자료가 기존 답변과 다르면 최신 정보를 우선하세요.
    ```
  - [ ] newsletter, education 등 다른 Consumer는 동작 변경 없음 (enableReranking=false인 Consumer는 Stage 1 스킵)
  - [ ] 유사 QA 컨텍스트 형식:
    ```
    ## 유사한 기존 Q&A (검증된 답변)
    [유사도 0.87] 질문: {qa_question.content}
    검증된 답변: {qa_answer.content}
    ```

### T4. rag.ts 이미지 전처리 → backend-dev
- 파일: `src/lib/rag.ts` (수정), `src/actions/questions.ts` (수정)
- 의존: T3 완료 후
- 완료 기준:
  - [ ] createAIAnswerForQuestion() 시그니처에 imageUrls 추가:
    `createAIAnswerForQuestion(questionId, title, content, imageUrls?: string[])`
  - [ ] imageUrls가 있으면 각각 `generateVisionText()` 호출 → 설명 텍스트 생성
  - [ ] Vision 실패 시 해당 이미지 스킵 (try-catch 개별)
  - [ ] 설명 텍스트를 결합: `imageDescriptions = descriptions.join('\n')`
  - [ ] generateRAGAnswer()에 imageDescriptions 전달
  - [ ] ksGenerate() 호출 시 `imageDescriptions` 포함:
    ```ts
    ksGenerate({ query: questionText, consumerType: "qa", imageDescriptions })
    ```
  - [ ] questions.ts의 after() 호출부 수정:
    ```ts
    after(async () => {
      await createAIAnswerForQuestion(data.id, formData.title, formData.content, formData.imageUrls);
    });
    ```
  - [ ] imageUrls 없을 때 기존과 동일하게 동작 (하위호환)

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| QA 0건 (초기 — qa_question chunk 없음) | Stage 1 결과 없음 → Stage 2만으로 답변. 기존 P2와 100% 동일 |
| 같은 답변 2번 승인 (중복) | question_id + answer_id 조합으로 중복 체크 → 스킵 |
| 질문 이미지 Vision 실패 | 텍스트만으로 검색 + 임베딩. 이미지 무시 |
| 답변이 2000자 (길이) | chunkText()로 3 chunks 분할. 모두 같은 metadata |
| 유사도 0.70~0.85 (애매) | "참고 자료"로 포함하되 AI가 판단 |
| 유사도 0.70 미만 | Stage 1 결과 없음으로 처리 |
| 임베딩 생성 실패 (Gemini 429) | embedQAPair 전체 실패 → 로그만. 승인은 정상 |
| 질문에 이미지 5장 (최대) | 각각 Vision 호출. 실패한 것만 스킵, 성공한 것만 결합 |
| source_type 'qa' (기존) vs 'qa_question'/'qa_answer' (신규) | 기존 'qa'는 그대로 유지. 신규는 별도 source_type |
| 관리자가 답변 수정 후 재승인 | 기존 chunks 삭제 후 재생성? → 아니, 중복 체크로 스킵. 수정된 답변으로 새 chunk 필요하면 별도 처리 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-qa-intelligence-review.html
- 리뷰 일시: 2026-02-20 11:47
- 변경 유형: 혼합 (백엔드 구조 + DB)
- 피드백 요약: Good 2건 + 주의 3건(F-02 재승인 중복, F-03 Stage1/2 중복, F-04 tokenBudget)
- 반영 여부: F-02, F-03 반영 (아래 T1, T3에 추가). F-04는 선택사항이라 보류.

## 검증
☐ npm run build 성공
☐ 기존 기능 안 깨짐 — newsletter generate(), 기존 QA 답변 생성 정상
☐ T1 검증: 테스트 답변 승인 → knowledge_chunks에 qa_question + qa_answer chunk 생성 확인
☐ T1 검증: 같은 답변 재승인 → 중복 chunk 안 생김
☐ T3 검증: "CAPI 설치 방법" 질문 → Stage 1에서 유사 qa_question 검색 (있으면)
☐ T3 검증: QA 0건일 때 → 기존과 동일하게 답변 생성
☐ T4 검증: 이미지 포함 질문 → Vision 텍스트가 AI 답변에 반영
☐ T4 검증: 이미지 없는 질문 → 기존과 동일하게 동작
☐ 응답시간: QA 질문 → 10초 이내

### T5. Sonnet Extended Thinking 활성화 → backend-dev
- 파일: `src/lib/knowledge.ts` (수정)
- 의존: T3 완료 후
- 완료 기준:
  - [ ] ConsumerConfig에 `enableThinking: boolean`, `thinkingBudget: number` 필드 추가
  - [ ] qa, chatbot Consumer만 `enableThinking: true`, `thinkingBudget: 5000`
  - [ ] 나머지 Consumer는 `enableThinking: false`
  - [ ] generate() 내부 callLLM에서 enableThinking=true일 때:
    ```ts
    // thinking 모드 활성화
    body.thinking = { type: "enabled", budget_tokens: config.thinkingBudget };
    // thinking 모드에서는 temperature를 1로 고정 (Anthropic API 제약)
    body.temperature = 1;
    ```
  - [ ] 응답 파싱: thinking block과 text block 분리 — text block만 답변으로 사용
    ```ts
    // data.content는 배열: [{type:"thinking",...}, {type:"text",text:"답변"}]
    const textBlock = data.content.find(b => b.type === "text");
    const content = textBlock?.text || "";
    ```
  - [ ] thinking 토큰도 usage 로깅에 포함 (knowledge_usage.total_tokens)
  - [ ] enableThinking=false인 Consumer는 기존 동작 100% 유지
