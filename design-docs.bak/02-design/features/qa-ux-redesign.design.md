# Q&A UX 리디자인 설계서

## 1. 데이터 모델
- 기존 questions 테이블 변경 없음
- 기존 answers 테이블 변경 없음
- 쿼리 조건만 변경

## 2. 쿼리 설계

### 전체 Q&A (기본 탭)
```sql
SELECT * FROM questions
WHERE status = 'answered'
ORDER BY created_at DESC
-- + 카테고리 필터 (선택)
-- + 검색 필터 (선택)
```

### 내 질문 탭
```sql
SELECT * FROM questions
WHERE author_id = {current_user_id}
ORDER BY created_at DESC
```

## 3. 컴포넌트 구조

### Q&A 페이지 (questions/page.tsx)
```
QuestionsPage (서버 컴포넌트)
├── 탭 전환: [전체 Q&A | 내 질문]  ← URL 파라미터: ?tab=all | ?tab=mine
├── Tab: 전체 Q&A (기본)
│   ├── 카테고리 필터 (가로 스크롤 칩)
│   ├── 검색바
│   └── 질문 목록 (answered만)
└── Tab: 내 질문
    ├── 질문 목록 (본인 것만, 전체 상태)
    └── 각 질문에 상태 배지 (답변 대기 / 답변 완료)
```

### 변경 파일 목록
1. `src/app/(main)/questions/page.tsx` — 탭 구조 추가, 기본 필터를 answered로
2. `src/app/(main)/questions/posts-list-client.tsx` → `questions-list-client.tsx` — 탭 전환 UI
3. `src/actions/questions.ts` — getQuestions에 authorId 파라미터 추가
4. `src/app/(main)/posts/page.tsx` — 카테고리 탭에서 정보/웨비나 제거, 공지만

## 4. 에러 처리
- 비로그인 상태에서 "내 질문" 탭 → 로그인 유도 메시지
- 질문 0개일 때 → 빈 상태 UI ("아직 질문이 없습니다" / "답변된 질문이 없습니다")

## 5. 구현 순서
1. [ ] actions/questions.ts — getQuestions에 tab/authorId 로직 추가
2. [ ] questions/page.tsx — 탭 구조 + 서버 데이터 분기
3. [ ] questions-list-client.tsx — 탭 전환 UI (클라이언트)
4. [ ] posts/page.tsx — 공지만 남기기
5. [ ] 테스트: 전체 Q&A에 미답변 안 보이는지, 내 질문에 본인 것만 나오는지
