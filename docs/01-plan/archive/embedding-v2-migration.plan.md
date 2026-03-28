# 임베딩 엔진 교체 (Phase 1) — Plan

## 목표
`gemini-embedding-001` (768차원) → `gemini-embedding-2-preview` (3,072차원) 무중단 전환.
멀티모달(텍스트+이미지) 지원 추가. 서비스 중단 0초.

## 배경
- 코드리뷰(`docs/review/master-architecture-review.md`)에서 식별된 임베딩 모델 업그레이드 필요성
- task_type 미사용으로 인한 검색 품질 손실
- image-embedder.ts의 Vision 2단계 → 직접 임베딩 1단계로 단순화 가능
- `(supabase as any)` 17곳 → 타입 안전성 회복 필요

## 성공 기준
1. 전환 중에도 기존 QA 검색이 정상 동작 (무중단)
2. 전환 완료 후 이미지 직접 임베딩 지원
3. 검색 품질 동일 이상
4. `generateEmbedding("텍스트")` 하위 호환 유지
5. tsc + build 통과, lint 에러 0개

## 범위
### In Scope
- gemini.ts: generateEmbedding() 시그니처 확장 + 모델 교체
- image-embedder.ts: 직접 임베딩 전환
- qa-embedder.ts / embed-pipeline.ts: embedding_v2 컬럼 저장, task_type 적용
- SQL migration: 이중 컬럼 + RPC 수정 + HNSW 인덱스
- reembed API 엔드포인트
- ad_creative_embeddings 테이블 생성 (Phase 2 준비)

### Out of Scope
- 실제 재임베딩 실행 (API 엔드포인트만 제공)
- `(supabase as any)` 전체 제거 (타입 재생성이 선행 필요)
- Phase 2 소재/LP 분석 기능

## 구현 순서
1. SQL migration 작성 (이중 컬럼 + RPC + 인덱스)
2. gemini.ts 수정 (모델 + 시그니처 확장)
3. image-embedder.ts 수정 (직접 임베딩)
4. embed-pipeline.ts / qa-embedder.ts 수정 (embedding_v2 저장)
5. reembed API 엔드포인트 생성
6. ad_creative_embeddings migration
7. tsc + build 검증

## 위험 요소
- Gemini Embedding 2 API 가용성 (Preview 상태)
- 이중 컬럼 전략의 RPC 복잡도 증가
- 3072차원 HNSW 인덱스 메모리 (~4배 증가, 1,912개 규모에서는 무시 가능)
