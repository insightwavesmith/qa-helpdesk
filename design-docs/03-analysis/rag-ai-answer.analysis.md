# RAG 기반 AI 답변 생성 Gap 분석

## 설계서 vs 실제 구현 비교

### 1. 데이터 모델 분석

#### ✅ 일치하는 부분
- questions 테이블에 `embedding VECTOR(768)` 필드 존재
- lecture_chunks 테이블 구조 완전 일치
- answers 테이블의 AI 관련 필드들 정확히 구현:
  - `is_ai BOOLEAN DEFAULT FALSE`
  - `source_refs JSONB` 
  - `author_id` NULL 허용 (AI 답변용)

#### ⚠️ 차이점 발견
- **벡터 인덱스 미생성**: 설계서에 명시된 IVFFlat 인덱스가 주석 처리됨
```sql
-- 주석 처리된 상태
-- CREATE INDEX idx_questions_embedding ON questions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 2. API 설계 분석

#### ❌ 미구현된 핵심 기능들
| 함수명 | 구현 상태 | 설명 |
|--------|----------|------|
| generateQuestionEmbedding | ❌ | 질문 임베딩 생성 |
| searchRelevantChunks | ❌ | 유사 강의 청크 검색 |
| generateAIAnswer | ❌ | AI 답변 생성 |
| saveAIAnswer | ❌ | AI 답변 저장 |

#### 🔍 관련 코드 검색 결과
```bash
# 임베딩 관련 코드 검색
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "embedding"
# 결과: 데이터베이스 스키마와 타입 정의만 존재

# AI 답변 관련 코드 검색  
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "is_ai"
# 결과: 타입 정의와 답변 조회 쿼리에서만 사용
```

### 3. 컴포넌트 구조 분석

#### ❌ 설계서 컴포넌트 미구현
```
❌ cron/
   ├── ai-answer-generator.ts          # 미구현
   ├── embedding-service.ts            # 미구현  
   ├── rag-service.ts                  # 미구현
   └── ai-answer-service.ts            # 미구현

❌ src/components/
   ├── answers/
   │   ├── ai-answer-card.tsx          # 미구현
   │   └── source-references.tsx       # 미구현
```

#### ✅ 기존 답변 시스템에서 AI 구분
```typescript
// answers-review-client.tsx에서 AI 답변 구분 표시
{answer.is_ai ? (
  <Badge variant="secondary">AI</Badge>
) : (
  <Badge variant="outline">사용자</Badge>
)}
```

### 4. 벡터 검색 구현 분석

#### ❌ 완전 미구현
- pgvector 확장은 활성화되어 있음: `CREATE EXTENSION IF NOT EXISTS vector;`
- 하지만 실제 벡터 검색 로직은 전혀 구현되지 않음
- Gemini 임베딩 API 연동 코드 없음
- 코사인 유사도 검색 함수 없음

### 5. 강의 데이터 분석

#### ❌ lecture_chunks 테이블 비어있음
```sql
-- 테이블은 존재하지만 데이터 없음
SELECT COUNT(*) FROM lecture_chunks; -- 결과: 0
```

#### 🔍 강의 콘텐츠 준비 상태
- 강의 청킹 로직 미구현
- 임베딩 생성 배치 작업 미구현  
- 기존 강의 자료 연동 시스템 없음

### 6. AI 답변 생성 파이프라인 분석

#### ❌ 전체 파이프라인 미구현

**1단계: 질문 임베딩 생성**
```typescript
// 현재 questions 생성 시 embedding은 NULL로 저장됨
const { data } = await svc.from("questions").insert({
  // ... 다른 필드들
  embedding: null,  // 임베딩 생성 로직 없음
});
```

**2단계: RAG 검색**
- 벡터 유사도 검색 로직 전혀 없음
- 검색 결과 필터링 없음

**3단계: AI 답변 생성**  
- LLM API 연동 없음
- 프롬프트 엔지니어링 없음
- 답변 포맷팅 로직 없음

**4단계: 크론 스케줄링**
- 자동 AI 답변 생성 크론 작업 없음
- 미답변 질문 탐지 로직 없음

### 7. 에러 처리 및 모니터링

#### ❌ RAG 관련 에러 처리 미구현
- 임베딩 생성 실패 처리 없음
- 벡터 검색 실패 처리 없음  
- AI API 호출 실패 처리 없음
- 재시도 로직 없음

## 종합 분석

### Match Rate: **15%** 🔴

#### ✅ 구현된 부분 (15%)
- 데이터베이스 스키마 (테이블 구조)
- 기본 타입 정의
- AI 답변 구분 UI (is_ai 필드 활용)

#### ❌ 미구현 부분 (85%)
- 벡터 임베딩 생성 시스템
- RAG 검색 엔진
- AI 답변 생성 파이프라인  
- 강의 데이터 청킹 및 적재
- 크론 스케줄링
- 성능 최적화 (벡터 인덱스)
- 관련 컴포넌트들
- 에러 처리 로직

### 구현 우선순위

#### 🚀 1단계: 기반 시설 구축
1. **강의 데이터 준비**
   ```typescript
   // 강의 콘텐츠 청킹 및 적재
   - 기존 강의 자료 수집
   - 청크 단위 분할 로직  
   - lecture_chunks 테이블 데이터 적재
   ```

2. **임베딩 시스템 구축**
   ```typescript
   // Gemini text-embedding-004 연동
   - 임베딩 생성 API 구현
   - 배치 임베딩 처리 시스템
   - 에러 처리 및 재시도 로직
   ```

#### 🔧 2단계: RAG 검색 엔진
```typescript
// 벡터 유사도 검색 구현
- 코사인 유사도 검색 함수
- 검색 결과 품질 필터링  
- 성능 최적화 (벡터 인덱스 생성)
```

#### 🤖 3단계: AI 답변 생성
```typescript  
// LLM 기반 답변 생성
- 프롬프트 엔지니어링
- 답변 포맷팅 및 출처 표시
- 답변 품질 검증
```

#### ⏰ 4단계: 자동화 시스템
```typescript
// 크론 기반 자동 답변 생성
- 미답변 질문 탐지
- 자동 AI 답변 생성 스케줄링
- 실행 로그 및 모니터링
```

### 결론

RAG 기반 AI 답변 생성 기능은 **데이터베이스 스키마만 준비된 상태**이며, 실제 핵심 로직은 **전혀 구현되지 않음**. 이는 완전히 새로운 기능 개발이 필요한 영역입니다.

### 권장사항

1. **단계별 구현**: 강의 데이터 → 임베딩 → RAG → AI 답변 순서로 진행
2. **MVP 접근**: 소규모 강의 데이터로 시작하여 점진적 확장
3. **성능 모니터링**: 벡터 검색 성능과 AI 답변 품질 지속 측정