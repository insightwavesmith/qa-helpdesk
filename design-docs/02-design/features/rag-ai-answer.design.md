# RAG 기반 AI 답변 생성 설계서

## 1. 데이터 모델

### questions 테이블 (임베딩 관련)
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| embedding | VECTOR(768) | 질문 텍스트의 벡터 임베딩 | NULLABLE |

### lecture_chunks 테이블
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| id | UUID | 청크 고유 ID | PRIMARY KEY |
| lecture_name | TEXT | 강의명 | NOT NULL |
| week | TEXT | 주차 정보 | NOT NULL |
| chunk_index | INT | 청크 순서 | NOT NULL |
| content | TEXT | 청크 내용 | NOT NULL |
| embedding | VECTOR(768) | 청크 내용의 벡터 임베딩 | NULLABLE |
| created_at | TIMESTAMPTZ | 생성 시간 | DEFAULT NOW() |

### answers 테이블 (AI 답변 관련)
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| author_id | UUID | 작성자 ID (AI 답변시 NULL) | NULLABLE |
| is_ai | BOOLEAN | AI 답변 여부 | DEFAULT FALSE |
| source_refs | JSONB | 참고한 강의 출처 정보 | NULLABLE |

### 벡터 인덱스 (성능 최적화용)
```sql
-- 데이터가 충분히 쌓인 후 활성화
CREATE INDEX idx_questions_embedding 
ON questions USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX idx_lecture_chunks_embedding 
ON lecture_chunks USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

## 2. API 설계

### AI 답변 생성 파이프라인

| 단계 | 함수명 | 설명 |
|------|--------|------|
| 1 | generateQuestionEmbedding | 질문 텍스트를 벡터로 변환 |
| 2 | searchRelevantChunks | 유사한 강의 청크 검색 |
| 3 | generateAIAnswer | 검색된 청크 기반 답변 생성 |
| 4 | saveAIAnswer | AI 답변을 DB에 저장 |

### 임베딩 생성 API
```typescript
// Gemini text-embedding-004 모델 사용
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await geminiClient.embed({
    model: 'text-embedding-004',
    content: text
  });
  return response.embedding;
}
```

### 벡터 검색 API  
```typescript
// 코사인 유사도 기반 검색
async function searchSimilarChunks(
  queryEmbedding: number[], 
  limit: number = 5,
  threshold: number = 0.7
) {
  const { data } = await supabase
    .from('lecture_chunks')
    .select('*')
    .order('embedding <=> ' + queryEmbedding, { ascending: true })
    .limit(limit);
    
  return data.filter(chunk => 
    cosineSimilarity(queryEmbedding, chunk.embedding) > threshold
  );
}
```

## 3. 컴포넌트 구조

### 크론 작업 구조
```
cron/
├── ai-answer-generator.ts              # 메인 크론 작업
├── embedding-service.ts                # 임베딩 생성 서비스
├── rag-service.ts                      # RAG 검색 서비스
└── ai-answer-service.ts                # AI 답변 생성 서비스
```

### AI 답변 표시 컴포넌트
```
src/components/
├── answers/
│   ├── answer-list.tsx                 # 답변 목록 (AI/사용자 구분)
│   ├── ai-answer-card.tsx              # AI 답변 카드
│   └── source-references.tsx           # 강의 출처 참조
```

## 4. 에러 처리

### 임베딩 생성 실패
- **상황**: Gemini API 호출 실패 또는 할당량 초과
- **처리**: 재시도 로직 (3회) 후 로그 기록

### 벡터 검색 실패
- **상황**: 유사한 청크를 찾지 못함 (threshold 미달)
- **처리**: 일반적인 안내 메시지로 답변 생성

### AI 답변 생성 실패
- **상황**: LLM API 호출 실패
- **처리**: 오류 로그 기록 후 다음 크론 실행 시 재시도

## 5. 구현 순서

### 1단계: 강의 데이터 준비
- [ ] 강의 콘텐츠 청킹 로직 구현
- [ ] lecture_chunks 테이블 데이터 적재
- [ ] 청크별 임베딩 생성 및 저장

### 2단계: 질문 임베딩 시스템
- [ ] 질문 등록 시 자동 임베딩 생성
- [ ] 기존 질문들의 임베딩 백필
- [ ] 임베딩 생성 에러 처리

### 3단계: RAG 검색 엔진
- [ ] 벡터 유사도 검색 함수 구현
- [ ] 검색 결과 품질 필터링
- [ ] 성능 최적화 (인덱스 튜닝)

### 4단계: AI 답변 생성
- [ ] 프롬프트 엔지니어링 (강의 내용 기반 답변)
- [ ] AI 답변 포맷팅 및 출처 표시
- [ ] 답변 품질 검증 로직

### 5단계: 크론 스케줄링
- [ ] 미답변 질문 탐지 로직
- [ ] 자동 AI 답변 생성 크론
- [ ] 실행 로그 및 모니터링

## 6. RAG 프롬프트 설계

### AI 답변 생성 프롬프트
```typescript
const generateAnswerPrompt = (question: string, chunks: LectureChunk[]) => `
당신은 메타 광고 전문가입니다. 다음 강의 내용을 참고하여 질문에 정확하고 도움이 되는 답변을 작성해주세요.

**질문:** ${question}

**참고 강의 내용:**
${chunks.map(chunk => `
- 강의: ${chunk.lecture_name} (${chunk.week})
- 내용: ${chunk.content}
`).join('\n')}

**답변 작성 지침:**
1. 제공된 강의 내용에 기반하여 답변하세요
2. 구체적이고 실용적인 조언을 포함하세요  
3. 단계별 설명이 필요한 경우 순서대로 작성하세요
4. 강의에서 다루지 않은 내용은 "강의에서 다루지 않음"이라고 명시하세요

**답변:**
`;
```

### 출처 참조 포맷
```typescript
interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  similarity_score: number;
}

// AI 답변에 포함될 출처 정보
const formatSourceRefs = (chunks: LectureChunk[]): SourceRef[] => {
  return chunks.map(chunk => ({
    lecture_name: chunk.lecture_name,
    week: chunk.week, 
    chunk_index: chunk.chunk_index,
    similarity_score: chunk.similarity_score
  }));
};
```

## 7. 성능 고려사항

### 임베딩 캐싱
- 동일한 텍스트에 대해 중복 임베딩 생성 방지
- Redis 또는 메모리 캐싱 활용

### 벡터 검색 최적화  
- IVFFlat 인덱스 파라미터 튜닝 (lists 수)
- 검색 결과 개수 제한 (기본 5개)
- 유사도 임계값 설정 (기본 0.7)

### 크론 실행 최적화
- 배치 단위 처리 (한 번에 10개 질문)
- API 요청 제한 고려한 지연 처리
- 실패 재시도 백오프 전략