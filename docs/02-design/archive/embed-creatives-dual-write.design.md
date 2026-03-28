# embed-creatives 듀얼 라이트 설계서

> 작성일: 2026-03-22
> TASK: T3 (architecture-v3-execution-plan.md)
> 의존성: 없음 (T1 완료됨, T2와 독립)
> 관련 Plan: docs/01-plan/features/architecture-v3-execution-plan.md T3 섹션

---

## 1. 데이터 모델

### 1.1 현재 상태

임베딩 저장이 `ad_creative_embeddings` 테이블에만 수행됨:

```
embedCreative() → ad_creative_embeddings UPSERT (embedding_3072, text_embedding_3072)
```

`creative_media` 테이블에 `embedding`, `text_embedding`, `embedding_model`, `embedded_at` 컬럼이 존재하지만 데이터가 비어있음.

### 1.2 변경 후 (듀얼 라이트)

```
embedCreative() → ad_creative_embeddings UPSERT (기존 유지)
              → creative_media UPSERT (신규 추가)
```

**creative_media 저장 필드**:

| 컬럼 | 타입 | 소스 |
|------|------|------|
| embedding | vector(3072) | row.embedding_3072 복사 |
| text_embedding | vector(3072) | row.text_embedding_3072 복사 |
| embedding_model | text | EMBEDDING_MODEL 상수 |
| embedded_at | timestamptz | now() |

### 1.3 매핑 관계

```
ad_creative_embeddings.ad_id → creatives.ad_id → creatives.id = creative_media.creative_id
```

embedCreative()에서 creative_media에 쓰려면:
1. input.adId로 creatives 테이블에서 id 조회
2. 해당 id로 creative_media 행 조회
3. 존재하면 embedding/text_embedding PATCH

---

## 2. API 설계

### 2.1 embedCreative() 변경

**기존 흐름** (유지):
```
1. 이미지 임베딩 → row.embedding_3072
2. 텍스트 임베딩 → row.text_embedding_3072
3. LP 크롤링 → row.lp_embedding
4. ad_creative_embeddings UPSERT
```

**추가 단계** (4번 이후):
```
5. creatives 테이블에서 ad_id → id 매핑
6. creative_media에서 creative_id = id인 행 조회
7. 존재하면 → embedding, text_embedding, embedding_model, embedded_at PATCH
8. 독립 try-catch (실패해도 ad_creative_embeddings 무영향)
```

### 2.2 embedMissingCreatives() 변경

**기존** (유지):
```
ad_creative_embeddings에서 embedding IS NULL 조회 → 임베딩 생성
```

**추가 조회** (병렬):
```
creative_media에서 embedding IS NULL 조회
→ 해당 creative_id의 creatives.ad_id 가져오기
→ ad_creative_embeddings에 embedding_3072가 있으면 복사
→ 없으면 storage_url로 새로 생성
```

---

## 3. 컴포넌트 구조

### 3.1 변경 파일

| 파일 | 변경 유형 | 줄 수 변경 | 설명 |
|------|----------|----------|------|
| `src/lib/ad-creative-embedder.ts` | 수정 | +40줄 | embedCreative()에 creative_media 듀얼 라이트 추가 |
| `src/lib/ad-creative-embedder.ts` | 수정 | +30줄 | embedMissingCreatives()에 creative_media 보충 로직 추가 |

### 3.2 기존 서비스 영향

| 항목 | 영향 |
|------|------|
| ad_creative_embeddings UPSERT | **무영향** — 기존 로직 그대로 유지 |
| embed-creatives 크론 | **무영향** — 기존 호출 순서 유지, 실행 시간 약간 증가 (DB 쿼리 1~2회 추가) |
| search_similar_creatives_v2() RPC | **수혜** — creative_media.embedding이 채워지면서 동작 가능 |
| 프론트엔드 /creatives 페이지 | **무영향** |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| creatives 테이블에 ad_id 없음 | creative_media 듀얼 라이트 스킵 (ad_creative_embeddings는 정상 저장) |
| creative_media 행 없음 | 스킵 (collect-daily v2가 행을 생성하면 다음 크론에서 재시도) |
| creative_media PATCH 실패 | 에러 로그 + 계속 진행 (ad_creative_embeddings 무영향) |
| embedding_3072가 null | creative_media에도 null (복사 대상 없음) |

핵심 원칙: **ad_creative_embeddings 저장은 절대 실패하지 않는다.** creative_media 듀얼 라이트는 best-effort.

---

## 5. 구현 순서

- [ ] embedCreative()에서 ad_creative_embeddings UPSERT 후 creative_media 듀얼 라이트 추가
- [ ] creative_media 매핑 로직: ad_id → creatives.id → creative_media.creative_id
- [ ] 독립 try-catch로 격리
- [ ] embedMissingCreatives()에 creative_media 보충 조회 추가
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 통과
- [ ] search_similar_creatives_v2() RPC 동작 확인 (creative_media.embedding 존재)

---

> 설계서 작성 완료.
