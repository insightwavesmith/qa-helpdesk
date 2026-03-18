# Gemini Embedding 2 통합 기획서 리뷰

> 리뷰어: Claude (에이전트팀) | 날짜: 2026-03-15
> 대상: `gemini-embedding-2-integration-plan.md` (모찌 작성, 2026-03-15)

---

## 1. 호환성 분석 결과 (파일별)

### 1-1. `src/lib/gemini.ts` — 핵심 임베딩 함수

**현재 상태**:
- 모델: `gemini-embedding-001` (상수 `EMBEDDING_MODEL`)
- 차원: `outputDimensionality: 768` 명시
- API: REST 직접 호출 (`generativelanguage.googleapis.com/v1beta`)
- 함수: `generateEmbedding(text: string) → number[]`

**교체 영향**:
- 모델명 상수만 `gemini-embedding-2-preview`로 변경하면 API 호환 (동일 REST 엔드포인트)
- `outputDimensionality: 768` 유지 가능 (Gemini Embedding 2는 MRL 지원, 768/1536/3072 선택)
- `task_type` 파라미터 추가 권장 (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY 구분 → 검색 품질 향상)
- **Breaking Change 없음** (API 인터페이스 동일)

**⚠ 핵심 문제 — 기획서의 현재 상태 오류**:
기획서는 bscamp의 현재 임베딩을 "BGE-M3 (로컬)"로 기술하고 있으나, **실제로는 이미 `gemini-embedding-001` (API)을 사용 중**. BGE-M3는 OpenClaw/뉴런 전용이다. 이 오류가 기획서 전반의 "vs 현재" 비교를 왜곡시키고 있다.

---

### 1-2. `src/lib/qa-embedder.ts` — QA 승인 시 자동 임베딩

**현재 상태**:
- `generateEmbedding()` 호출하여 질문/답변 청크를 `knowledge_chunks`에 저장
- `embedding_model: "gemini-embedding-001"` 메타데이터 기록
- 이미지는 `generateVisionText()` → 텍스트 변환 → `generateEmbedding()` (2단계)

**교체 영향**:
- `generateEmbedding()` 내부만 바뀌므로 이 파일 수정 불필요
- 이미지 직접 임베딩으로 전환 시: `getImageDescription()` → `generateEmbedding()` 2단계를 1단계로 축소 가능 → **함수 시그니처 변경 필요**
- `embedding_model` 메타데이터를 `"gemini-embedding-2"` 로 갱신 필요

---

### 1-3. `src/lib/image-embedder.ts` — 이미지 Vision 파이프라인

**현재 상태** (2단계):
```
이미지 URL → generateVisionText() → 텍스트 설명 → generateEmbedding() → vector(768)
```

**Gemini Embedding 2로 전환 시** (1단계):
```
이미지 URL → embedImage() (직접 이미지 임베딩) → vector(768)
```

**교체 영향**:
- **가장 큰 구조 변경이 필요한 파일**
- Vision 텍스트 설명(`description`)이 사라지면 `knowledge_chunks.content`에 저장할 텍스트가 없어짐
- 현재 `content` 컬럼에 Vision 설명을 저장 → 검색 결과 UI에 텍스트로 표시됨
- **제안**: 이미지 직접 임베딩 + Vision 설명 병행 (검색은 벡터, 표시는 텍스트)

---

### 1-4. `src/lib/hybrid-search.ts` — 벡터 + BM25 검색

**현재 상태**:
- `generateEmbedding()` 으로 쿼리 벡터 생성 → `searchChunksByEmbedding()` 호출
- RRF (Reciprocal Rank Fusion)으로 벡터 + BM25 결합
- 벡터 가중치 0.6, BM25 가중치 0.4

**교체 영향**:
- `generateEmbedding()` 내부만 바뀌므로 **이 파일 수정 불필요**
- 단, 쿼리 임베딩 시 `task_type: RETRIEVAL_QUERY` 지정 필요 → `generateEmbedding()` 함수에 옵션 파라미터 추가 권장

---

### 1-5. `src/lib/knowledge.ts` — RAG 파이프라인 (KnowledgeService)

**현재 상태**:
- `generateEmbedding()` 의존 (검색 쿼리 임베딩)
- `search_knowledge` RPC 호출 → `embedding <=> query_embedding` 코사인 거리 계산
- 3단계 파이프라인: buildSearchResults → buildContext → callLLM

**교체 영향**:
- 쿼리 임베딩만 바뀌므로 **코드 변경 최소**
- **DB RPC 함수는 벡터 차원만 맞으면 모델 무관** → 768 유지하면 RPC 수정 불필요
- HNSW 인덱스 재빌드 불필요 (동일 차원)

---

### 1-6. `src/lib/reranker.ts` — Gemini Flash 리랭킹

**교체 영향**: **없음**. 리랭커는 텍스트 기반 LLM 점수 매기기로, 임베딩 모델과 무관.

---

### 1-7. `src/actions/embed-pipeline.ts` — 콘텐츠 임베딩 파이프라인

**현재 상태**:
- `generateEmbedding()` 으로 콘텐츠 청크 임베딩
- `embedding_model: "gemini-embedding-001"` 기록
- 배치 처리: 3건/배치, 500ms 딜레이, 429 시 2초 백오프

**교체 영향**:
- `generateEmbedding()` 내부만 바뀌므로 코드 변경 최소
- `embedding_model` 값 갱신 필요
- 배치 처리 로직은 rate limit 관리에 유효 → 유지

---

### 1-8. DB 스키마 (`supabase/migrations/`)

**현재 knowledge_chunks 스키마**:

| 컬럼 | 타입 | 비고 |
|------|------|------|
| embedding | VECTOR(768) | gemini-embedding-001, HNSW 인덱스 |
| image_embedding | VECTOR(1024) | 멀티모달 예약, 미사용 |
| embedding_model | TEXT | 'gemini-embedding-001' |
| search_vector | TSVECTOR | BM25 하이브리드 검색용 |

**현재 competitor_ad_cache 스키마**: 임베딩 컬럼 없음. `image_url TEXT` 만 존재.

**기획서 제안 unified_embeddings 테이블**: 현재 미존재. 신규 생성 필요.

---

## 2. 실현 가능성 판정 (단계별)

### Phase 1 (즉시 — 1~2일)

| 항목 | 판정 | 근거 |
|------|------|------|
| Google API Key 발급 | ✅ 가능 | 이미 GEMINI_API_KEY 환경변수 사용 중. 동일 키로 Embedding 2 접근 가능 |
| API 연동 테스트 | ✅ 가능 | `gemini.ts`의 모델명 상수만 변경 |
| 뉴런 BGE-M3 → Gemini 전환 | ⚠️ 범위 외 | bscamp 프로젝트 범위 밖 (OpenClaw/guardian). 별도 프로젝트에서 진행 필요 |
| neuron_embeddings 마이그레이션 | ⚠️ 범위 외 | 위와 동일. bscamp DB에 없는 테이블 |

**판정**: Phase 1의 절반이 bscamp 범위 밖. bscamp에서 할 수 있는 건 API 키 확인 + `gemini.ts` 모델명 변경뿐.

---

### Phase 2 (이번 주 — 3~5일)

| 항목 | 판정 | 근거 |
|------|------|------|
| unified_embeddings 테이블 설계 | ⚠️ 재검토 필요 | 아래 상세 분석 참조 |
| QA 멀티모달 RAG 구현 | ✅ 가능 | 기존 qa-embedder + image-embedder 확장 |
| knowledge_chunks 재임베딩 | ⚠️ 주의 필요 | 1,912개 청크 × 60RPM = ~32분. **1500 RPD 제한 있으면 2일 분산 필요** |
| 강의자료 PDF 임베딩 | ✅ 가능 | Gemini Embedding 2가 PDF 직접 지원 |

**unified_embeddings 설계 이슈**:
기획서는 모든 소스의 임베딩을 하나의 `unified_embeddings` 테이블로 통합 제안. 그러나 현재 아키텍처는 `knowledge_chunks`에 이미 `source_type`으로 구분하는 방식. 두 가지 선택지:

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. 기존 knowledge_chunks 확장** | 기존 RPC/인덱스 재활용, 마이그레이션 최소 | competitor_ad 등 이질적 데이터 혼재 |
| **B. unified_embeddings 신규 생성** | 깔끔한 멀티모달 설계 | 기존 search_knowledge RPC 이중 관리, 검색 로직 대폭 수정 |

**권장**: **방식 A** (knowledge_chunks 확장). 이유: 기존 HNSW 인덱스 + RPC + hybrid-search.ts 전체를 재작성하는 비용이 크다. `source_type`에 `competitor_ad`, `blog_post` 등 추가하면 충분.

---

### Phase 3 (다음 주)

| 항목 | 판정 | 근거 |
|------|------|------|
| 경쟁사 광고 이미지 임베딩 | ✅ 가능 | competitor_ad_cache에 embedding 컬럼 ALTER TABLE 추가 |
| "비슷한 광고" 검색 UI | ✅ 가능 | 프론트엔드 작업, 기술적 제약 없음 |
| 큐레이션 시맨틱 검색 | ✅ 가능 | contents 테이블에 이미 embedding VECTOR(768) 컬럼 존재 |
| 블로그 콘텐츠 갭 분석 | ⚠️ 의존성 | organic_posts 테이블 미존재. 크롤링 인프라 선행 필요 |

---

### Phase 4 (3주차)

| 항목 | 판정 | 근거 |
|------|------|------|
| 수강생 관심사 프로필 | ⚠️ 복잡 | 질문/조회 로그 집계 → 임베딩 → 클러스터링. 배치 파이프라인 구축 필요 |
| 개인화 뉴스레터 | ⚠️ 의존성 | 관심사 프로필 선행 |
| LP 유사도 분석 | ⚠️ 의존성 | daily_lp_metrics + LP 크롤링 인프라 필요 |
| 영상/오디오 임베딩 | ❌ 리스크 높음 | 수업 녹화 영상 용량 + 128초 제한. 분할 로직 + 스토리지 비용 별도 |

---

## 3. 리스크 목록

### 심각도: CRITICAL

#### R1. 벡터 공간 불일치 — 001과 002 벡터 혼용 불가

**문제**: `gemini-embedding-001`과 `gemini-embedding-2-preview`는 같은 768차원이지만 **서로 다른 벡터 공간**에서 학습되었다. 두 모델의 벡터를 같은 테이블에 혼용하면 코사인 유사도 계산이 의미 없어진다.

**현재 상황**: knowledge_chunks에 1,912개 청크가 001 벡터로 저장되어 있고, 새 데이터는 002 벡터로 들어오면 검색 품질이 급격히 하락한다.

**필수 대응**:
- 모델 전환 시 **기존 1,912개 청크 전량 재임베딩** 필수
- 점진적 전환 불가. All-or-nothing 마이그레이션
- 재임베딩 중 서비스 다운타임 또는 이중 컬럼 운용 필요

**기획서 누락**: 이 리스크가 명시적으로 다뤄지지 않음. "기존 텍스트 RAG는 유지 (fallback)" 이라고 했는데, 001 벡터로 검색하면서 002 벡터 데이터를 섞으면 fallback이 아니라 검색 품질 저하다.

---

#### R2. Rate Limit 계산 오류

**기획서**: "Free tier (60RPM = 86,400건/일 가능)"
**실제**: 기획서 5-3절에 "Free tier: 60 RPM, **1500 RPD**"라고 적혀 있음.

만약 RPD(Requests Per Day) 1,500 제한이 실제로 존재한다면:
- 기존 1,912개 재임베딩: **2일 소요** (1일 1,500건 제한)
- 월간 8,880건 추정: 하루 296건 → RPD 내이므로 운영은 가능
- 그러나 초기 대량 마이그레이션 시 유료 전환 필요할 수 있음

**필수 확인**: Gemini Embedding 2 Preview의 정확한 일일 쿼터를 Google Cloud Console에서 확인할 것.

---

### 심각도: HIGH

#### R3. Preview → GA 전환 리스크

**현재**: `gemini-embedding-2-preview` (Public Preview, 2026-03-10 출시)
- Preview 기간 중 API 변경, 성능 특성 변경, 가격 변경 가능
- GA 전환 시 모델명 변경 가능 (`gemini-embedding-2` 등)
- 최악의 경우 벡터 공간 변경 → **전량 재임베딩 필요**
- Preview 모델은 SLA 없음 → 프로덕션 의존 리스크

**대응 권장**:
- `embedding_model` 메타데이터 반드시 기록 (현재도 하고 있음 ✅)
- GA 전환 시 재임베딩 스크립트 사전 준비
- 비핵심 기능(콘텐츠 갭 분석 등)에 먼저 적용 → 핵심(QA RAG) 나중

---

#### R4. image-embedder 구조 변경 시 기존 데이터 손실

**현재**: 이미지를 Vision으로 텍스트 변환 후 `knowledge_chunks.content`에 저장. 이 텍스트는 검색 결과 UI에 표시됨.
**전환 후**: 이미지 직접 임베딩 시 텍스트 설명이 생성되지 않아 `content` 컬럼이 비게 됨.

**대응**: 이미지 직접 임베딩과 Vision 텍스트 설명을 **병행** 실행해야 함 (임베딩은 빠르지만 UI 표시용 텍스트도 필요).

---

#### R5. search_knowledge RPC의 task_type 미반영

Gemini Embedding 2는 `task_type` 파라미터로 쿼리/문서를 구분하면 검색 품질이 향상된다:
- 문서 저장 시: `RETRIEVAL_DOCUMENT`
- 검색 쿼리 시: `RETRIEVAL_QUERY`

현재 `generateEmbedding()` 함수는 task_type 구분 없이 동일하게 임베딩. 이를 구분하지 않으면 Embedding 2의 성능 이점을 온전히 활용하지 못함.

---

### 심각도: MEDIUM

#### R6. 기획서의 현재 상태 오류

기획서가 bscamp의 현재 임베딩을 "BGE-M3 (로컬, 1024차원)"으로 기술하고 있으나 실제는 "gemini-embedding-001 (API, 768차원)". 이 오류로 인해:
- "vs 현재" 비교 테이블이 부정확 (차원 1024→768이 아니라 768→768)
- "BGE-M3 대체" 서사가 맞지 않음 (bscamp에서는 이미 Gemini)
- Phase 1의 "BGE-M3 → Gemini 전환" 항목이 bscamp가 아닌 OpenClaw 범위

#### R7. HNSW 인덱스 재빌드

벡터 전량 재임베딩 후 HNSW 인덱스 재빌드 필요. 현재 설정:
```sql
HNSW (vector_cosine_ops, m=16, ef_construction=128)
```
1,912개 수준에서는 수초 내 완료되지만, 만 단위로 증가하면 빌드 시간 + 메모리 사용량 증가.

#### R8. `image_embedding VECTOR(1024)` 컬럼 존재

knowledge_chunks에 이미 `image_embedding VECTOR(1024)` 컬럼이 예약되어 있으나 미사용. 기획서에서 이 컬럼을 언급하지 않음. Gemini Embedding 2의 이미지 임베딩을 여기에 저장할지, 기존 `embedding` 컬럼에 통합할지 결정 필요.

---

## 4. 개선 제안 (우선순위)

### P1. 마이그레이션 전략 수립 (필수 — 기획서 누락)

기획서에 없는 **가장 중요한 항목**. 아래 순서를 기획서에 추가해야 한다:

```
1. gemini.ts 모델명 변경 + task_type 파라미터 추가
2. 신규 데이터부터 002 벡터로 저장 (embedding_model 메타데이터로 구분)
3. 야간 배치로 기존 1,912개 청크 재임베딩 (001→002)
4. search_knowledge RPC에서 embedding_model 필터 추가 (전환 기간 혼용 방지)
5. 재임베딩 완료 확인 → 필터 제거 → HNSW 재빌드
```

**핵심**: 2~5번 기간 동안 검색 품질 저하 없이 서비스 유지하는 전략이 필요.

---

### P2. `generateEmbedding()` 함수 시그니처 확장

```typescript
// 현재
generateEmbedding(text: string): Promise<number[]>

// 제안
generateEmbedding(
  content: string | { text?: string; imageUrl?: string },
  options?: { taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' }
): Promise<number[]>
```

멀티모달 + task_type 지원을 위해 함수 시그니처를 확장하되, 기존 호출부(`text: string`)는 하위 호환 유지.

---

### P3. 단계별 우선순위 재조정

기획서의 Phase 순서를 bscamp 실제 아키텍처 기준으로 재조정:

| 순서 | 항목 | 이유 |
|------|------|------|
| **Week 1** | gemini.ts 모델 교체 + task_type 추가 | 모든 하위 기능의 기반 |
| **Week 1** | 기존 knowledge_chunks 전량 재임베딩 | 벡터 혼용 방지 |
| **Week 2** | 이미지 직접 임베딩 (image-embedder 개선) | QA 품질 즉시 향상 |
| **Week 2** | competitor_ad_cache에 embedding 컬럼 추가 | 경쟁사 분석 기반 |
| **Week 3** | "비슷한 광고" 검색 UI + 콘텐츠 시맨틱 검색 | 사용자 체감 기능 |
| **Week 4+** | PDF 임베딩, 영상/오디오, 개인화 | 점진적 확장 |

뉴런/OpenClaw 관련 항목은 별도 프로젝트로 분리.

---

### P4. unified_embeddings 대신 knowledge_chunks 확장

기획서의 `unified_embeddings` 신규 테이블 대신:

```sql
-- 기존 knowledge_chunks에 source_type 값만 추가
-- 'competitor_ad', 'blog_post', 'pdf_page', 'video_segment' 등

-- competitor_ad_cache에는 별도 embedding 컬럼 추가 (경쟁사 전용 검색)
ALTER TABLE competitor_ad_cache
ADD COLUMN image_embedding VECTOR(768),
ADD COLUMN text_embedding VECTOR(768),
ADD COLUMN embedding_model TEXT DEFAULT 'gemini-embedding-2';
```

이유: 경쟁사 광고 검색은 knowledge_chunks와 분리된 전용 검색이 자연스럽고, QA RAG 검색에 광고 데이터가 섞이면 안 된다.

---

### P5. 비용 최적화

- **배치 처리 큐**: 현재 embed-pipeline.ts의 500ms 딜레이 방식을 큐 기반으로 변경. 일일 쿼터 소진 방지.
- **캐싱**: 동일 텍스트 재임베딩 방지 (content hash → embedding 캐시)
- **차원 선택**: 768차원은 적절. 3072는 pgvector 스토리지 4배 + HNSW 메모리 증가. 768로 90%+ 성능 유지는 합리적 판단.

---

### P6. Gemini Embedding 2 Preview 안정성 대응

```
환경변수로 모델 전환 가능하게:
EMBEDDING_MODEL=gemini-embedding-2-preview  (현재)
EMBEDDING_MODEL=gemini-embedding-001       (롤백)
```

Preview 장애 시 001로 즉시 롤백 가능하도록 환경변수 기반 모델 선택. 단, 롤백 시 002 벡터가 섞인 상태에서 검색 품질 저하는 감수해야 함.

---

## 5. 최종 평가 요약

### 기획서 평가: ⚠️ 비전 우수, 실행 계획 보완 필요

**잘된 점**:
- 멀티모달 임베딩의 서비스별 활용 시나리오가 구체적이고 임팩트 평가가 현실적
- 비용 분석 (Free tier 활용)이 실용적
- 서비스 영역별 우선순위 구분이 명확
- 확장 로드맵(Phase 1~4)이 점진적

**보완 필요**:

| 항목 | 심각도 | 설명 |
|------|--------|------|
| 현재 상태 오류 (BGE-M3 vs gemini-001) | CRITICAL | bscamp는 이미 Gemini 사용 중. 기획서 전반 수정 필요 |
| 벡터 마이그레이션 전략 부재 | CRITICAL | 001→002 전환 시 전량 재임베딩 필수. 전환 기간 운영 전략 없음 |
| Rate Limit 계산 불일치 | HIGH | 86,400건/일 vs 1,500 RPD 모순. 정확한 쿼터 확인 필요 |
| Preview 리스크 미언급 | HIGH | GA 전환 시 재임베딩 가능성, SLA 부재 |
| unified_embeddings vs 기존 확장 미비교 | MEDIUM | 아키텍처 결정 근거 부족 |
| image_embedding 기존 컬럼 미활용 | LOW | 이미 VECTOR(1024) 예약 컬럼 존재 |

**결론**: 기획서의 비전과 서비스 활용 시나리오는 훌륭하나, **실제 코드 기반 구현 계획이 부정확**하다. 특히 "현재 상태" 인식 오류와 벡터 마이그레이션 전략 부재가 가장 큰 문제. 이 두 가지를 보완한 v2 기획서를 작성한 후 구현에 착수하는 것을 권장한다.

### 즉시 실행 가능 항목 (보완 없이도 가능)
1. `gemini.ts` 모델명을 환경변수화 (`EMBEDDING_MODEL` env)
2. `task_type` 파라미터 추가 (RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT)
3. Gemini Embedding 2 API 연동 테스트 (별도 스크립트)

### 기획서 v2에 반드시 포함할 항목
1. 현재 상태 정정 (BGE-M3 → gemini-embedding-001)
2. 벡터 마이그레이션 전략 (전량 재임베딩 절차 + 서비스 무중단 방안)
3. Rate Limit 정확한 수치 확인 + 마이그레이션 소요 시간
4. Preview → GA 전환 대응 계획
5. unified_embeddings vs knowledge_chunks 확장 아키텍처 결정
