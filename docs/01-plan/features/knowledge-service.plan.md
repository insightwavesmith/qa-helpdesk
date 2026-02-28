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
