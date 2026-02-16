# TASK: P2 — AI 수정 요청 + 비용 로깅

> 2026-02-16 | v3.1 KnowledgeService P2
> P0+P1a+P1b+T7 완료 기반. KS Consumer 활용 + 운영 도구.

## 목표

1. **AI 수정 요청**: 콘텐츠 상세에서 본문/email_summary에 대해 Opus한테 수정 지시 → 수정본 반환 → 확인 후 저장
2. **KS 비용 로깅**: KnowledgeService 호출마다 토큰 사용량 DB 기록 (월별 집계 가능)

## 제약

- KnowledgeService(`knowledge.ts`) 핵심 로직(generate 함수의 검색+생성 흐름) 변경 금지
- `generateEmbedding()` 수정 금지
- `email-renderer.ts`, `email-template-utils.ts` 수정 금지
- 기존 API 라우트 시그니처 유지 (하위 호환)
- Vercel `maxDuration: 60` 제한 준수
- 새 npm 패키지 추가 금지

## 태스크

### T1. AI 수정 요청 기능 → frontend-dev + backend-dev

**파일:**
- `src/components/content/ai-edit-panel.tsx` (신규 — AI 수정 요청 UI)
- `src/app/(main)/admin/content/[id]/page.tsx` (수정 — AI 수정 패널 추가)
- `src/actions/contents.ts` (수정 — reviseContentWithAI 액션 추가)

**UI 위치:** 콘텐츠 상세 → 정보공유 탭 → PostEditPanel 위에 접이식 패널

**UI 구조:**
```
[✨ AI 수정 요청] ← 접이식 토글 버튼
┌─────────────────────────────────────────┐
│ 대상: (●) 본문  (○) 이메일 요약          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 수정 지시 입력                       │ │
│ │ (예: "도입부 더 강하게 써줘")         │ │
│ │ (예: "배너키 INSIGHT, KEY POINT 넣어")│ │
│ └─────────────────────────────────────┘ │
│                                         │
│           [수정 요청하기]                 │
│                                         │
│ ── 수정 결과 (diff 하이라이트) ──         │
│ ┌─────────────────────────────────────┐ │
│ │ 수정된 본문 미리보기 (마크다운)       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│     [적용하기]     [다시 요청]            │
└─────────────────────────────────────────┘
```

**작업:**
1. `ai-edit-panel.tsx`: 수정 대상 선택(본문/이메일요약) + textarea + 요청 버튼
2. 요청 → `reviseContentWithAI` server action 호출
3. 결과: 수정된 텍스트를 미리보기 영역에 표시
4. "적용하기" → `updateContent()`로 DB 저장 + PostEditPanel 갱신
5. "다시 요청" → textarea 유지한 채 재요청

**Server Action (`reviseContentWithAI`):**
```ts
// src/actions/contents.ts에 추가
export async function reviseContentWithAI(
  contentId: string,
  target: "body_md" | "email_summary",
  instruction: string
): Promise<{ revised: string } | { error: string }> {
  await requireAdmin();
  // 1. 현재 콘텐츠 조회
  // 2. KS 호출: 기존 텍스트 + 수정 지시 → Opus가 수정본 생성
  // 3. 수정본 반환 (DB 저장 안 함 — 사용자가 "적용" 눌러야 저장)
}
```

**KS 호출 방식:**
```ts
const result = await generate({
  query: `다음 텍스트를 수정해주세요.

## 수정 지시
${instruction}

## 현재 텍스트
${currentText}

수정된 전체 텍스트만 출력하세요. 설명이나 주석 없이 텍스트만.`,
  consumerType: target === "body_md" ? "education" : "newsletter",
  systemPromptOverride: `당신은 자사몰사관학교의 콘텐츠 편집자입니다. 
지시에 따라 텍스트를 수정하되, 원문의 핵심 내용과 구조는 유지하세요.
마크다운 형식을 유지하세요.`,
});
```

### T2. KS 비용 로깅 → backend-dev

**파일:**
- `src/lib/knowledge.ts` (수정 — generate 함수에 로깅 추가)
- Supabase SQL (knowledge_usage 테이블 생성)

**DB 테이블 `knowledge_usage` (신규):**
```sql
CREATE TABLE knowledge_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_type text NOT NULL,
  source_types text[] DEFAULT '{}',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'claude-opus-4-6',
  question_id uuid REFERENCES questions(id) ON DELETE SET NULL,
  content_id uuid REFERENCES contents(id) ON DELETE SET NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_usage_created ON knowledge_usage(created_at DESC);
CREATE INDEX idx_knowledge_usage_consumer ON knowledge_usage(consumer_type);
```

**작업:**
1. `generate()` 함수 시작에 `const startTime = Date.now()` 추가
2. return 직전에 fire-and-forget INSERT (에러 무시 — `catch` 로 console.error만)
3. `data.usage.input_tokens`, `data.usage.output_tokens` 분리 저장
4. KnowledgeRequest에 `questionId?`, `contentId?` optional 필드 추가

**로깅 삽입 위치 (L248, return 직전):**
```ts
// fire-and-forget: 로깅 실패해도 KS 응답은 정상 반환
const supabase = createServiceClient();
supabase.from("knowledge_usage").insert({
  consumer_type: request.consumerType,
  source_types: effectiveSourceTypes,
  input_tokens: data.usage?.input_tokens || 0,
  output_tokens: data.usage?.output_tokens || 0,
  total_tokens: tokensUsed,
  model: MODEL,
  question_id: request.questionId || null,
  content_id: request.contentId || null,
  duration_ms: Date.now() - startTime,
}).then(() => {}).catch(err => console.error("[KS] Usage log failed:", err));

return { content, sourceRefs, tokensUsed, model: MODEL };
```

**KnowledgeRequest 확장:**
```ts
export interface KnowledgeRequest {
  // ... 기존 필드 전부 유지
  questionId?: string;  // QA Consumer에서 전달
  contentId?: string;   // 콘텐츠 Consumer에서 전달
}
```

## 현재 코드

### `src/lib/knowledge.ts` — generate 함수 (L173~258)
```ts
export async function generate(
  request: KnowledgeRequest
): Promise<KnowledgeResponse> {
  const config = CONSUMER_CONFIGS[request.consumerType];
  const limit = request.limit ?? config.limit;
  const threshold = request.threshold ?? config.threshold;
  const tokenBudget = request.tokenBudget ?? config.tokenBudget;
  const temperature = request.temperature ?? config.temperature;
  const sourceTypes = request.sourceTypes ?? config.sourceTypes;
  const systemPrompt = request.systemPromptOverride ?? config.systemPrompt;

  // 1. 쿼리 임베딩
  const embedding = await generateEmbedding(request.query);
  // 2. 벡터 검색
  const chunks = await searchChunks(embedding, { limit, threshold, sourceTypes });
  // 3. 컨텍스트 조합
  const combined = chunks.map(c => `[${c.lecture_name} - ${c.week}]\n${c.content}`).join("\n\n---\n\n");
  const contextText = truncateToTokenBudget(combined, tokenBudget);
  // 4. Anthropic API 호출 (Opus 4.6)
  const response = await fetch("https://api.anthropic.com/v1/messages", { ... });
  const data = await response.json();
  const content: string = data.content?.[0]?.text || "";
  const tokensUsed: number = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return { content, sourceRefs, tokensUsed, model: MODEL };
}
```

### `src/actions/contents.ts` — generateContentWithAI (L651~700)
```ts
export async function generateContentWithAI(
  topic: string, type: string = "education"
): Promise<{ title: string; bodyMd: string; emailSummary: string } | { error: string }> {
  await requireAdmin();
  const typePrompt = TYPE_PROMPTS[type] || TYPE_PROMPTS.education;
  const consumerType = CONTENT_TO_CONSUMER[type] || "education";
  const result = await generate({ query, consumerType, systemPromptOverride: typePrompt.system });
  // ---EMAIL_SUMMARY--- 구분자로 본문/요약 분리
  return { title, bodyMd, emailSummary };
}
```

### `src/components/content/post-edit-panel.tsx` (L1~40)
```ts
interface PostEditPanelProps {
  contentId: string;
  initialBodyMd: string;
  status: string;
  onSaved?: () => void;
  onStatusChange?: () => void;
}
// MDXEditor WYSIWYG + 자동저장(5초) + 발행 버튼
```

### `src/app/(main)/admin/content/[id]/page.tsx` — 탭 구조
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsTrigger value="post">정보공유</TabsTrigger>
  <TabsTrigger value="newsletter">뉴스레터</TabsTrigger>
  <TabsTrigger value="settings">설정</TabsTrigger>
  <TabsContent value="post">
    <PostEditPanel ... />      ← 여기 위에 AI 수정 패널 추가
    <DetailSidebar ... />
  </TabsContent>
  <TabsContent value="newsletter">
    <NewsletterEditPanel ... />
  </TabsContent>
</Tabs>
```

### DB 현황
```
contents: body_md(text), email_summary(text), type(text), status(text)
knowledge_usage: 없음 (T2에서 신규 생성)
```

## 엣지 케이스

| # | 시나리오 | 입력 | 기대 동작 |
|---|---------|------|----------|
| 1 | 빈 수정 지시 | instruction="" | "수정 지시를 입력해주세요" 안내, 요청 차단 |
| 2 | 매우 긴 본문 수정 | body_md 5000자+ | KS tokenBudget으로 자동 제한, 정상 처리 |
| 3 | email_summary NULL 상태에서 수정 요청 | 대상=email_summary, 값 없음 | "이메일 요약이 없습니다. 먼저 생성해주세요" 안내 |
| 4 | KS 타임아웃 (55초) | Opus 응답 지연 | "수정 요청 시간이 초과되었습니다. 다시 시도해주세요" 에러 표시 |
| 5 | knowledge_usage INSERT 실패 | DB 연결 에러 | 로깅 실패해도 KS 응답 정상 반환 (fire-and-forget) |
| 6 | "적용하기" 후 에디터 동기화 | 수정본 적용 | PostEditPanel의 MDXEditor 내용 갱신 + dirty 상태 리셋 |
| 7 | 연속 수정 요청 | 첫 번째 결과 보기 전 재요청 | 버튼 disabled + 로딩 상태, 이전 요청 무시 |

## 검증

### T1 AI 수정 요청
- [ ] `/admin/content/[id]` → 정보공유 탭 → "AI 수정 요청" 토글 열기
- [ ] 대상 "본문" 선택 → 수정 지시 "도입부를 더 강하게 써줘" 입력 → "수정 요청하기" 클릭
- [ ] 로딩 표시 → 수정된 본문 미리보기에 표시됨
- [ ] "적용하기" 클릭 → PostEditPanel(MDXEditor)에 수정본 반영 + DB 저장됨
- [ ] 대상 "이메일 요약" 선택 → "배너키 INSIGHT, KEY POINT 넣어서 다시 써줘" → 수정본에 ### INSIGHT 등 포함 확인
- [ ] "다시 요청" → 같은 지시로 재요청 → 다른 수정본 반환
- [ ] email_summary NULL일 때 → 안내 메시지 표시
- [ ] `npm run build` 에러 0건

### T2 비용 로깅
- [ ] QA 질문 AI 답변 생성 → `knowledge_usage` 테이블에 1행 INSERT 확인
- [ ] `consumer_type = 'qa'`, `input_tokens > 0`, `output_tokens > 0`, `duration_ms > 0` 확인
- [ ] T1에서 AI 수정 요청 → `knowledge_usage`에 기록 확인
- [ ] `SELECT consumer_type, SUM(total_tokens), COUNT(*) FROM knowledge_usage GROUP BY consumer_type` → 정상 집계
- [ ] KS 호출 후 응답 속도에 로깅으로 인한 지연 없음 (fire-and-forget)
- [ ] `npx tsc --noEmit` 에러 0건
- [ ] `npm run build` 에러 0건

## 리뷰 보고서

보고서 파일: docs/review/2026-02-16-p2-ai-edit-logging.html (8,088 bytes)

**리뷰 피드백 4건:**
1. T1: RAG 컨텍스트 불필요 — 스타일 수정에 임베딩+벡터검색 낭비 → limit:0 또는 경량 함수 분리 검토
2. T1: MDXEditor 동기화 — refreshContent()→prop 변경→useEffect 리셋 확인 필요
3. T1: 55초 타임아웃 — 5000자+ 본문도 충분할 것으로 예상, 모니터링 후 조정
4. T2: RLS 정책 — knowledge_usage에 ENABLE ROW LEVEL SECURITY 추가 권장

## 레퍼런스

- v3.1 아키텍처: `~/.openclaw/workspace/projects/mozzi-reports/public/reports/2026-02-15-content-pipeline-v3.1.html`
- KnowledgeService: `src/lib/knowledge.ts` (ConsumerType, CONSUMER_CONFIGS, generate)
- 콘텐츠 액션: `src/actions/contents.ts` (generateContentWithAI, TYPE_PROMPTS)
- PostEditPanel: `src/components/content/post-edit-panel.tsx` (MDXEditor + 자동저장)
- NewsletterEditPanel: `src/components/content/newsletter-edit-panel.tsx` (Unlayer 에디터)
