# RAG 기반 AI 답변 생성 계획서

## 1. 개요
- 기능 설명: 벡터 검색(RAG)을 활용한 AI 자동 답변 생성 시스템으로, 기존 강의 콘텐츠를 기반으로 질문에 대한 정확한 답변을 제공
- 해결하려는 문제:
  - 반복적인 질문에 대한 신속한 답변 제공 부족
  - 강의 자료의 체계적 활용 미비
  - 24시간 답변 서비스의 필요성

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: 질문 텍스트를 벡터로 변환하여 저장해야 한다
- FR-02: 강의 콘텐츠를 청크 단위로 분할하여 벡터 임베딩해야 한다
- FR-03: 질문과 관련도가 높은 강의 청크를 검색할 수 있어야 한다
- FR-04: 검색된 강의 내용을 기반으로 AI 답변을 생성해야 한다
- FR-05: AI 답변에는 참고한 강의 출처를 포함해야 한다
- FR-06: 생성된 AI 답변은 관리자 승인 후 공개되어야 한다
- FR-07: 크론 작업을 통해 새로운 질문에 대해 자동으로 AI 답변을 생성해야 한다

### 비기능적 요구사항
- 성능: 벡터 유사도 검색 응답시간 < 1초
- 품질: AI 답변의 강의 내용 일치도 > 80%
- 확장성: 새로운 강의 콘텐츠 추가 시 자동 임베딩 처리

## 3. 용어 정의

| 용어 | 영문 | 설명 |
|------|------|------|
| RAG | Retrieval-Augmented Generation | 검색 증강 생성, 관련 문서를 찾아 답변을 생성하는 AI 기법 |
| 임베딩 | Embedding | 텍스트를 고차원 벡터로 변환한 것 (768차원) |
| 청크 | Chunk | 강의 콘텐츠를 의미 단위로 분할한 조각 |
| 벡터 검색 | Vector Search | 임베딩 간 코사인 유사도를 이용한 유사 문서 검색 |
| 강의 청크 | Lecture Chunk | lecture_chunks 테이블에 저장된 강의 콘텐츠 조각 |

## 4. 범위

### 포함
- Gemini text-embedding-004 모델을 이용한 임베딩 생성
- PostgreSQL pgvector 확장을 이용한 벡터 유사도 검색
- 질문-강의 매칭 알고리즘 구현
- AI 답변 생성 프롬프트 설계
- 크론 스케줄링을 통한 자동 답변 생성
- 강의 출처 참조 시스템

### 제외
- 실시간 답변 생성 (크론 기반으로만 동작)
- 사용자 맞춤형 답변 (일반적인 답변만 제공)
- 이미지/동영상 기반 질문 처리
- 다국어 지원

## 5. 성공 기준

- [ ] 질문 등록 시 embedding 벡터가 자동으로 생성된다
- [ ] 강의 콘텐츠가 청크 단위로 분할되어 lecture_chunks 테이블에 저장된다
- [ ] 벡터 유사도 검색으로 관련 강의 청크를 찾을 수 있다
- [ ] 검색된 강의 내용을 바탕으로 AI 답변이 생성된다
- [ ] AI 답변에 참고한 강의 정보(강의명, 주차)가 포함된다
- [ ] 생성된 AI 답변은 is_approved=false로 저장되어 관리자 검토를 거친다
- [ ] 크론 작업이 정기적으로 미답변 질문에 대해 AI 답변을 생성한다
- [ ] 벡터 인덱스 최적화로 검색 성능이 보장된다

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `generateEmbedding(text)` | `"메타 광고 CTR 개선"` | `Float32Array(768)` | Gemini text-embedding-004 |
| `searchChunksByEmbedding(embedding, limit)` | 768차원 벡터, limit=5 | `[{ chunk_id, content, similarity }]` 유사도 내림차순 | pgvector 코사인 유사도 |
| `generateRAGAnswer(question, chunks)` | 질문 + 관련 청크 | `{ answer, source_refs: [{ lecture, week }] }` | AI 답변 + 출처 |
| `chunkText(content, 700, 100)` | 긴 텍스트 | 700자 청크 배열 (100자 오버랩) | 콘텐츠 분할 |
| `POST /api/cron/ai-answer` | Cron 자동 호출 | `{ processed: N, generated: M }` | 미답변 질문 자동 처리 |
| `embedQAPair(question, answer)` | 질문-답변 쌍 | knowledge_chunks에 qa_question 타입 저장 | QA 임베딩 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| knowledge_chunks 0건 | 임베딩 미완료 DB | 빈 검색 결과 + "관련 강의를 찾지 못했습니다" |
| 벡터 검색 유사도 < 0.5 | 무관련 질문 | 낮은 신뢰도 표시 또는 답변 미생성 |
| 질문 텍스트 빈 문자열 | `""` | 에러: 임베딩 생성 불가 |
| 질문 텍스트 10,000자 초과 | 매우 긴 질문 | 앞 2,000자만 사용 |
| Gemini Embedding API 장애 | 503 에러 | retry 1회 → 실패 시 답변 생성 스킵 |
| 크론 중복 실행 | 동시 2개 크론 | 이미 처리 중인 질문 스킵 (is_ai_generated 체크) |
| AI 답변 is_approved 초기값 | 생성 직후 | `is_approved: false` (관리자 검토 대기) |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/rag-ai-answer/question.json
{
  "id": "q_001",
  "title": "메타 광고에서 CTR이 낮을 때 어떻게 해야 하나요?",
  "body": "광고를 돌리고 있는데 CTR이 0.8%밖에 안 됩니다. 평균이 2%라던데 어떻게 올릴 수 있나요?",
  "user_id": "user_001",
  "image_urls": null,
  "created_at": "2026-03-28T10:00:00Z"
}

// fixtures/rag-ai-answer/knowledge-chunks.json
[
  {
    "id": "kc_001",
    "content": "CTR(클릭률)을 높이려면 헤드라인에 숫자와 혜택을 포함하세요. 예: '3일 만에 매출 2배' 같은 구체적 약속이 효과적입니다.",
    "source_type": "lecture",
    "source_id": "lec_03",
    "metadata": { "lecture_name": "메타 광고 기초", "week": 3 },
    "embedding": "[768차원 벡터]"
  },
  {
    "id": "kc_002",
    "content": "광고 소재의 첫 3초가 결정적입니다. 시선을 끄는 훅을 배치하면 ThruPlay율과 CTR이 동시에 상승합니다.",
    "source_type": "lecture",
    "source_id": "lec_05",
    "metadata": { "lecture_name": "소재 제작 실전", "week": 5 },
    "embedding": "[768차원 벡터]"
  }
]

// fixtures/rag-ai-answer/ai-answer.json
{
  "id": "a_001",
  "question_id": "q_001",
  "body": "CTR이 0.8%로 낮은 상황이시군요. 평균 2%에 비해 개선 여지가 있습니다.\n\n**1. 헤드라인 개선**: 숫자와 구체적 혜택을 포함하세요...\n\n**2. 첫 3초 훅**: 시선을 끄는 요소를 배치하면...\n\n📚 참고: 메타 광고 기초 3주차, 소재 제작 실전 5주차",
  "is_ai_generated": true,
  "is_approved": false,
  "source_refs": [
    { "chunk_id": "kc_001", "lecture": "메타 광고 기초", "week": 3 },
    { "chunk_id": "kc_002", "lecture": "소재 제작 실전", "week": 5 }
  ],
  "created_at": "2026-03-28T10:01:00Z"
}