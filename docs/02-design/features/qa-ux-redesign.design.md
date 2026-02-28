# Q&A UX 리디자인 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델
- 기존 questions, answers 테이블 변경 없음
- 쿼리 조건 분기로 구현

## 2. 쿼리 설계

### 전체 탭 (기본)
```sql
SELECT * FROM questions ORDER BY created_at DESC
```

### 내 질문 탭
```sql
SELECT * FROM questions WHERE author_id = {current_user_id} ORDER BY created_at DESC
```

### 답변완료 탭
```sql
SELECT * FROM questions WHERE status = 'answered' ORDER BY created_at DESC
```

### 답변대기 탭
```sql
SELECT * FROM questions WHERE status = 'open' ORDER BY created_at DESC
```

## 3. 컴포넌트 구조

### Q&A 페이지 (questions/page.tsx)
```
QuestionsPage (서버 컴포넌트)
└── QuestionsListClient (클라이언트 컴포넌트)
    ├── 탭 전환: [전체 | 내 질문 | 답변완료 | 답변대기]  ← 4개 탭
    ├── 카테고리 필터 (가로 스크롤 칩)
    ├── 검색바
    └── 질문 목록 (탭별 필터링)
```

### 변경된 파일
1. `src/app/(main)/questions/page.tsx` — 탭 구조 + 서버 데이터
2. `src/app/(main)/questions/questions-list-client.tsx` — 4탭 전환 UI
3. `src/actions/questions.ts` — getQuestions에 tab/authorId 로직

## 4. 에러 처리
- 비로그인 → "내 질문" 탭에서 로그인 유도
- 질문 0개 → 빈 상태 UI

## 5. 구현 상태
- [x] 4탭 구조 (전체/내질문/답변완료/답변대기)
- [x] posts-list-client.tsx → questions-list-client.tsx 리네임
- [x] 카테고리 필터 + 검색
