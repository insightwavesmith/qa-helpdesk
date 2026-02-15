# TASK: 콘텐츠 파이프라인 v3.1 — KnowledgeService 구현

## 목표
KnowledgeService 중심 아키텍처로 전환. QA 답변(Gemini Flash) + 콘텐츠 생성(Claude Sonnet)을 Opus 4.6 단일 모델 KnowledgeService로 통합.

## 제약
- gemini.ts의 generateAnswer()를 P1a(T4-T5) 단계에서 삭제 금지 (롤백 안전망)
- generateEmbedding()은 절대 수정/삭제 금지 (임베딩은 Gemini 유지)
- CONTENT_BASE_STYLE, TYPE_PROMPTS 구조 변경 금지 (내용만 보강)
- main 브랜치 직접 force push 금지
- P1b(T6-T7)는 P1a 검증 게이트 통과 후에만 진행

## 리뷰 보고서
- 파일: `docs/review/2026-02-15-content-pipeline-v3.1.html` (1,930줄)
- 온라인: https://mozzi-reports.vercel.app/reports/2026-02-15-content-pipeline-v3.1.html
- v3 원본: `docs/review/2026-02-15-content-pipeline-architecture-v3.html`
- 핵심: KnowledgeService + 5 Consumer 패턴, Opus 4.6 단일화, source_type 필터링, P1a/P1b 분리

## 현재 코드

### src/lib/gemini.ts (90줄) — QA 생성 + 임베딩
```ts
// L1-5
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const GENERATION_MODEL = "gemini-2.5-flash-preview-05-20";

// L15-38: generateEmbedding() — 유지, 수정 금지
export async function generateEmbedding(text: string): Promise<number[]> { ... }

// L44-90: generateAnswer() — P1b 후 제거 대상
export async function generateAnswer(question: string, context: string[]): Promise<string> {
  const systemPrompt = "당신은 자사몰사관학교의 대표 Smith입니다. 제공된 강의 내용을 기반으로 정확하고 실용적인 답변을 해주세요. 강의 내용에 없는 정보는 추측하지 마세요. 자연스럽고 전문적인 톤으로 답변하되, AI임을 드러내지 마세요.";
  // Gemini 2.5 Flash API 직접 호출 (Google AI 포맷)
  // temperature: 0.3, maxOutputTokens: 2048
}
```

### src/lib/rag.ts (141줄) — RAG 검색 + 답변 생성
```ts
// L4: import { generateEmbedding, generateAnswer } from "@/lib/gemini";

// L7-14: LectureChunk 인터페이스 (source_type, metadata 없음)
interface LectureChunk {
  id: string; lecture_name: string; week: string;
  chunk_index: number; content: string; similarity: number;
}

// L28-50: searchRelevantChunks (sourceTypes 파라미터 없음)
export async function searchRelevantChunks(
  questionText: string, limit: number = 5, threshold: number = 0.5
): Promise<LectureChunk[]> {
  const embedding = await generateEmbedding(questionText);
  const { data, error } = await (supabase.rpc as any)("match_lecture_chunks", {
    query_embedding: embedding, match_threshold: threshold, match_count: limit,
  });
}

// L57-98: generateRAGAnswer → gemini.ts generateAnswer() 직접 호출
export async function generateRAGAnswer(questionTitle: string, questionContent: string) {
  const chunks = await searchRelevantChunks(questionText, 5, 0.4);
  const contextTexts = chunks.map(chunk => `[${chunk.lecture_name} - ${chunk.week}]\n${chunk.content}`);
  const answer = await generateAnswer(questionText, contextTexts);  // ← 여기를 KS로 변경
}

// L104-141: createAIAnswerForQuestion → generateRAGAnswer 호출 → answers 테이블 저장
```

### src/actions/contents.ts (698줄) — 콘텐츠 AI 생성
```ts
// L501-518: CONTENT_BASE_STYLE (공통 스타일 + 메타 광고 전문 지식)
// L519-621: TYPE_PROMPTS (education/case_study/webinar/notice/promo)
//   각 타입별: { system, userPrefix, emailSummaryGuide }
//   emailSummaryGuide에 ### 배너키 안내 없음 ← 이슈

// L623-698: generateContentWithAI()
export async function generateContentWithAI(topic: string, type: string = "education") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const typePrompt = TYPE_PROMPTS[type] || TYPE_PROMPTS.education;
  // Claude Sonnet 4 직접 호출 (Anthropic 포맷)
  // model: "claude-sonnet-4-20250514"
  // ---EMAIL_SUMMARY--- 구분자로 본문/이메일요약 분리
}
```

### src/actions/questions.ts — QA 호출
```ts
// L5: import { createAIAnswerForQuestion } from "@/lib/rag";
// L162: createAIAnswerForQuestion(data.id, formData.title, formData.content).catch(...)
```

### src/types/database.ts L335-364 — lecture_chunks 타입
```ts
lecture_chunks: {
  Row: { id: string; lecture_name: string; week: string; chunk_index: number;
         content: string; embedding: string | null; created_at: string; };
  Insert: { id?: string; lecture_name: string; week: string; chunk_index: number;
            content: string; embedding?: string | null; created_at?: string; };
  Update: { id?: string; lecture_name?: string; week?: string; chunk_index?: number;
            content?: string; embedding?: string | null; created_at?: string; };
  Relationships: [];
};
```

### src/lib/email-template-utils.ts — BANNER_MAP (참조용)
```ts
const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight", "INSIGHT 01": "banner-insight-01",
  "INSIGHT 02": "banner-insight-02", "INSIGHT 03": "banner-insight-03",
  "KEY POINT": "banner-key-point", "CHECKLIST": "banner-checklist",
  "강의 미리보기": "banner-preview", "핵심 주제": "banner-topics",
  "이런 분들을 위해": "banner-target", "웨비나 일정": "banner-schedule",
  "INTERVIEW": "banner-interview", "핵심 변화": "banner-change", "성과": "banner-results",
};
```

## 태스크

### T1. DB 마이그레이션 SQL (→ leader가 Supabase에서 실행)
lecture_chunks에 source_type + metadata 컬럼 추가, 인덱스 2개, RPC 확장.
SQL은 보고서 섹션 4 참조. 4단계: 컬럼 추가 → backfill → 인덱스 → RPC v2.
RPC는 하위 호환 (filter_source_types DEFAULT NULL).

### T2. knowledge.ts 신규 생성 (→ backend-dev)
KnowledgeService 클래스. Opus 4.6 API 래퍼 + Consumer별 RAG 파라미터.
Consumer 6종 파라미터 (보고서 섹션 7 참조):
- qa: limit 5, threshold 0.4, budget 3000자, temp 0.3, sources [lecture, qa_archive, manual]
- newsletter: limit 5, threshold 0.4, budget 3000자, temp 0.5, sources [lecture, crawl]
- education: limit 7, threshold 0.5, budget 5000자, temp 0.3, sources [lecture]
- webinar: limit 3, threshold 0.4, budget 2000자, temp 0.6, sources [lecture, crawl]
- chatbot: limit 5, threshold 0.3, budget 4000자, temp 0.4, sources null
- promo: limit 3, threshold 0.5, budget 2000자, temp 0.7, sources [lecture, manual]

구현: searchRelevantChunks() import + Anthropic API 호출 + Consumer별 시스템 프롬프트 구성.
QA Consumer 시스템 프롬프트: gemini.ts L52의 systemPrompt 그대로 유지.
콘텐츠 Consumer: TYPE_PROMPTS.system + RAG context + emailSummaryGuide (배너키 목록 포함).

### T3. database.ts 타입 확장 (→ backend-dev)
lecture_chunks Row/Insert/Update에 source_type(string) + metadata(Record<string,unknown>) 추가.

### T4. rag.ts sourceTypes 파라미터 추가 (→ backend-dev)
searchRelevantChunks()에 sourceTypes?: string[] 4번째 파라미터 추가.
RPC 호출에 filter_source_types: sourceTypes || null 전달.
LectureChunk 인터페이스에 source_type, metadata 필드 추가.

### T5. rag.ts generateRAGAnswer → KS 위임 (→ backend-dev)
generateRAGAnswer() 내부에서 KnowledgeService.generate({consumerType: "qa"}) 호출.
기존 generateAnswer import는 유지 (롤백 안전망). 사용하지 않지만 삭제 금지.

### T6. contents.ts generateContentWithAI → KS 위임 (→ backend-dev, P1a 검증 후)
generateContentWithAI() 내부에서 KS.generate({consumerType: type}) 호출.
TYPE_PROMPTS는 유지, KS가 system prompt + RAG context 조합.
emailSummaryGuide에 BANNER_MAP 키 13개 목록 + ### 구조 예시 추가.

### T7. gemini.ts generateAnswer 제거 (→ backend-dev, P1a+P1b 검증 후)
generateAnswer() 함수 삭제. generateEmbedding()만 유지.
rag.ts import에서 generateAnswer 제거.

## 검증

### P0 검증 (T1-T3)
- [Supabase SQL Editor] `SELECT source_type, count(*) FROM lecture_chunks GROUP BY source_type;` 실행하면 `lecture | 664` 나와야 함
- [Supabase SQL Editor] `SELECT * FROM lecture_chunks WHERE metadata->>'migrated_at' IS NOT NULL LIMIT 1;` 실행하면 metadata에 migrated_at 필드 있어야 함
- [터미널] `npx tsc --noEmit` 실행하면 에러 0이어야 함

### P1a 검증 게이트 (T4-T5)
- [브라우저 qa-helpdesk.vercel.app] 관리자 로그인 → QA에 테스트 질문 3건 등록 → AI 답변이 생성되어야 함
- [브라우저] AI 답변에 sourceRefs(출처 참조)가 표시되어야 함
- [Vercel Functions 로그] KnowledgeService 호출 로그에 model: "claude-opus-4-6" 표시되어야 함
- [터미널] `npx tsc --noEmit` 에러 0, `npx next lint` 에러 0

### P1b 검증 (T6-T7)
- [브라우저 qa-helpdesk.vercel.app] 관리자 → 콘텐츠 → AI 생성(education 타입) → 제목+본문+email_summary 생성되어야 함
- [브라우저] email_summary에 `### INSIGHT`, `### KEY POINT` 등 배너 키가 포함되어야 함
- [터미널] `npx tsc --noEmit` 에러 0, `npx next lint` 에러 0

## 엣지 케이스

| 시나리오 | 입력 | 기대 동작 | 대응 |
|----------|------|-----------|------|
| Opus API 키 권한 부족 | claude-opus-4-6 모델 요청 | 403/401 에러 | throw Error("Opus 4.6 접근 권한 없음"), Gemini fallback 없음 |
| RAG 검색 0건 | 강의와 무관한 질문 | 청크 0개 반환 | "관련 내용을 찾지 못했습니다" 메시지와 함께 답변 생성 시도 (현재 동작 유지) |
| source_type 미설정 신규 청크 | INSERT 시 source_type 생략 | DEFAULT 'lecture' 적용 | SQL DEFAULT + TypeScript optional 처리 |
| email_summary에 ### 헤딩 0개 | AI가 배너키 무시 | 이미지 배너 없이 렌더링 | emailSummaryGuide에 배너키 목록 포함, 없으면 gradient fallback |
| Opus 응답 30초 초과 | 복잡한 질문 + 긴 컨텍스트 | timeout | AbortController 30초, "AI 응답 시간 초과" 에러 반환 |
| 배포 중 기존 Gemini 요청 진행 중 | 동시 요청 | 기존 요청은 이전 코드로 완료 | stateless, 새 요청부터 KS 경유 |

## 레퍼런스
- v3.1 보고서: `docs/review/2026-02-15-content-pipeline-v3.1.html`
- v3 보고서: `docs/review/2026-02-15-content-pipeline-architecture-v3.html`
- Anthropic API: https://docs.anthropic.com/en/api/messages
- 모델: `claude-opus-4-6` (Opus 4.6)
