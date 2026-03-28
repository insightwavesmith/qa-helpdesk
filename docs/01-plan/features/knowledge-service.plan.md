# KnowledgeService 구현 계획서

## 배경
QA 답변(Gemini Flash) + 콘텐츠 생성(Claude Sonnet)을 Opus 4.6 단일 모델 KnowledgeService로 통합.

## 범위
- P0: DB 마이그레이션(T1) + knowledge.ts 생성(T2) + database.ts 타입 확장(T3)
- P1a: rag.ts sourceTypes 추가(T4) + generateRAGAnswer KS 위임(T5)
- P1b: contents.ts KS 위임(T6) + gemini.ts generateAnswer 제거(T7)

## 성공 기준
- P0: `npx tsc --noEmit` 에러 0, lecture_chunks에 source_type/metadata 컬럼 존재
- P1a: QA 질문 → Opus 4.6 기반 AI 답변 생성, sourceRefs 표시
- P1b: 콘텐츠 AI 생성 → Opus 4.6 기반, emailSummary에 배너키 포함

## 제약
- gemini.ts generateAnswer()는 P1b 완료 전까지 삭제 금지
- generateEmbedding()은 절대 수정/삭제 금지
- CONTENT_BASE_STYLE, TYPE_PROMPTS 구조 변경 금지
- main 브랜치 직접 force push 금지

## 리뷰 보고서
- `docs/review/2026-02-15-content-pipeline-v3.1.html`

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `KnowledgeService.generateAnswer(question)` | 질문 텍스트 | `{ answer, source_refs }` | Opus 4.6 단일 모델 |
| `KnowledgeService.generateContent(prompt)` | 콘텐츠 프롬프트 | `{ body_md, email_summary }` | emailSummary에 배너키 포함 |
| `generateRAGAnswer(question)` | 질문 텍스트 | KS에 위임된 답변 | P1a: rag.ts → KS 위임 |
| DB 마이그레이션 | lecture_chunks 테이블 | `source_type TEXT`, `metadata JSONB` 컬럼 존재 | P0: 스키마 확인 |
| `npx tsc --noEmit` | 전체 프로젝트 | 에러 0건 | database.ts 타입 확장 반영 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| gemini.ts generateAnswer() P1b 전 호출 | 레거시 코드 경로 | 정상 동작 (삭제 전까지 유지) |
| generateEmbedding() 호출 | 임베딩 요청 | 절대 수정/삭제되지 않음 (불변) |
| CONTENT_BASE_STYLE 참조 | 콘텐츠 생성 시 | 구조 변경 없이 그대로 사용 |
| KS 모델 응답 지연 | Opus 4.6 타임아웃 | retry 1회 → 에러 반환 |
| sourceRefs 빈 배열 | 관련 청크 없음 | 답변 생성하되 출처 없음 표시 |
| 콘텐츠 emailSummary 배너키 누락 | AI 생성 실패 | 기본 배너키 fallback |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/knowledge-service/ks-answer.json
{
  "question": "메타 광고 예산 설정은?",
  "answer": "일일 예산은 최소 5,000원부터 시작하는 것을 권장합니다...",
  "source_refs": [
    { "chunk_id": "kc_010", "source_type": "lecture", "metadata": { "lecture_name": "예산 관리", "week": 4 } }
  ],
  "model": "claude-opus-4-6",
  "tokens_used": 1250
}

// fixtures/knowledge-service/ks-content.json
{
  "prompt": "메타 광고 봄 시즌 전략",
  "body_md": "# 봄 시즌 메타 광고 전략\n\n## 1. 시즌 타겟팅\n...",
  "email_summary": "🌸 봄 시즌 메타 광고 전략 3가지를 정리했습니다.",
  "banner_key": "spring_promo",
  "model": "claude-opus-4-6"
}

// fixtures/knowledge-service/lecture-chunks-migration.json
{
  "table": "lecture_chunks",
  "new_columns": [
    { "name": "source_type", "type": "TEXT", "default": "lecture" },
    { "name": "metadata", "type": "JSONB", "default": "{}" }
  ]
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/knowledge-service/ks-answer.test.ts` | KS QA 답변 생성 (Opus 4.6) | vitest |
| `__tests__/knowledge-service/ks-content.test.ts` | KS 콘텐츠 생성 + 배너키 | vitest |
| `__tests__/knowledge-service/rag-delegation.test.ts` | rag.ts → KS 위임 확인 | vitest |
| `__tests__/knowledge-service/migration.test.ts` | DB 마이그레이션 (source_type, metadata) | vitest |
| `__tests__/knowledge-service/fixtures/` | JSON fixture 파일 | - |
