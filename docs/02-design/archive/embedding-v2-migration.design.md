# 임베딩 엔진 교체 (Phase 1) — 설계서

## 1. 데이터 모델

### knowledge_chunks 변경 (이중 컬럼)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| embedding | vector(768) | 기존 유지 (폴백용) |
| embedding_v2 | vector(3072) | 신규 추가 |
| embedding_model | text | 기존 유지 |
| embedding_model_v2 | text | 신규 추가 |

### ad_creative_embeddings (Phase 2 준비)
- TASK.md Step 9 참조
- HNSW 인덱스: embedding, lp_embedding 2개만

## 2. API 설계

### generateEmbedding() 시그니처
```typescript
export async function generateEmbedding(
  content: string | { text?: string; imageUrl?: string },
  options?: {
    taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';
    dimensions?: number;
  }
): Promise<number[]>
```

- `content`가 string이면 기존 호환 (text 임베딩)
- `content`가 object면 멀티모달 (imageUrl → base64 → inline_data)
- `taskType` 기본값: 자동 판단 불가 → 명시적 전달 필수
- `dimensions` 기본값: `EMBEDDING_DIMENSIONS` 환경변수 (3072)

### search_knowledge RPC
```sql
-- 이중 벡터 검색: embedding_v2 우선, 없으면 embedding 폴백
-- 파라미터 변경:
--   query_embedding vector(768) → 삭제
--   query_embedding_v2 vector(3072) → 추가
--   query_embedding_v1 vector(768) → 추가 (폴백용)
```

### /api/admin/reembed
- Method: POST
- Auth: admin role 필수
- Body: `{ batchSize?: number, delayMs?: number }`
- 동작: embedding_v2 IS NULL인 청크를 배치 처리
- 응답: `{ processed: number, remaining: number, errors: number }`

## 3. 컴포넌트 구조

### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/gemini.ts` | generateEmbedding 시그니처 확장, 모델/차원 환경변수화 |
| `src/lib/image-embedder.ts` | Vision 2단계 → 직접 임베딩 1단계 |
| `src/lib/qa-embedder.ts` | embedding→embedding_v2, embedding_model→embedding_model_v2, taskType 추가 |
| `src/actions/embed-pipeline.ts` | 동일 변경 |
| `src/lib/knowledge.ts` | searchChunksByEmbedding에서 v2 임베딩 생성 + RPC 호출 |
| `src/lib/hybrid-search.ts` | generateEmbedding 호출에 taskType 추가 |
| `src/app/api/admin/reembed/route.ts` | 신규 생성 |
| `supabase/migrations/20260316_embedding_v2.sql` | 이중 컬럼 + RPC + 인덱스 |
| `supabase/migrations/20260316_ad_creative_embeddings.sql` | Phase 2 테이블 |

## 4. 에러 처리
- generateEmbedding: API 에러 시 기존과 동일하게 throw
- search_knowledge RPC: embedding_v2 IS NULL이면 자동 768 폴백
- reembed API: 개별 청크 실패 시 skip + 에러 카운트, 전체 중단하지 않음

## 5. 구현 순서 (체크리스트)
- [ ] Step 1: SQL migration (이중 컬럼 + search_knowledge RPC + HNSW)
- [ ] Step 2: gemini.ts 수정
- [ ] Step 3: image-embedder.ts 수정
- [ ] Step 4: embed-pipeline.ts 수정 (embedding_v2 저장)
- [ ] Step 5: qa-embedder.ts 수정 (embedding_v2 저장)
- [ ] Step 6: knowledge.ts + hybrid-search.ts 수정 (검색 시 v2 임베딩 사용)
- [ ] Step 7: /api/admin/reembed 엔드포인트 생성
- [ ] Step 8: ad_creative_embeddings SQL migration
- [ ] Step 9: tsc + build 검증
