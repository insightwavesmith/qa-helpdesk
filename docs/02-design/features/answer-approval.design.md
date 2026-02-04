# 답변 승인 프로세스 설계서

## 1. 데이터 모델

### answers 테이블 (승인 관련 필드)
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| is_approved | BOOLEAN | 답변 승인 여부 | DEFAULT FALSE |
| approved_at | TIMESTAMPTZ | 승인 일시 | NULLABLE |
| is_ai | BOOLEAN | AI 답변 여부 | DEFAULT FALSE |

### questions 테이블 (상태 관리)
| 필드명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| status | ENUM | 질문 상태 | 'open' \| 'answered' \| 'closed' |

### 답변 승인 상태 플로우
```
사용자/AI 답변 생성 → is_approved: false
            ↓
      관리자 검토
            ↓
    승인 → is_approved: true, approved_at: NOW()
      ↓
질문 상태 → status: 'answered'
```

## 2. API 설계

### Server Actions

| 함수명 | 파라미터 | 설명 | 권한 |
|--------|----------|------|------|
| createAnswer | questionId, content | 답변 생성 (미승인 상태) | 승인된 사용자 |
| getPendingAnswers | page, pageSize | 미승인 답변 목록 조회 | 관리자 |
| approveAnswer | answerId | 답변 승인 처리 | 관리자 |
| deleteAnswer | answerId | 답변 삭제 | 관리자/본인 |
| updateAnswer | answerId, content | 답변 내용 수정 | 관리자 |
| getAnswersByQuestionId | questionId, includeUnapproved | 질문별 답변 조회 | 역할별 차등 |

### 답변 조회 권한 로직
```typescript
// 일반 사용자: 승인된 답변만 조회
if (!includeUnapproved) {
  query = query.eq("is_approved", true);
}

// 관리자: 모든 답변 조회 가능 (includeUnapproved: true)
```

### revalidatePath 패턴
```typescript
// 답변 승인 시 관련 페이지 캐시 무효화
revalidatePath(`/questions/${answer.question_id}`);  // 질문 상세
revalidatePath("/admin/answers");                    // 관리자 답변 관리
revalidatePath("/questions");                        // 질문 목록
revalidatePath("/dashboard");                        // 대시보드 통계
```

## 3. 컴포넌트 구조

### 관리자 답변 관리
```
src/app/(main)/admin/
├── answers/
│   ├── page.tsx                        # 답변 승인 페이지
│   └── answers-review-client.tsx       # 답변 검토 클라이언트 컴포넌트
└── layout.tsx                          # 관리자 권한 체크
```

### 답변 표시 컴포넌트
```
src/app/(main)/questions/[id]/
├── page.tsx                            # 질문 상세 + 답변 목록
└── answer-form.tsx                     # 답변 작성 폼
```

### 답변 작성 플로우
```typescript
// 1. 답변 생성 (기본 미승인 상태)
const { data } = await svc
  .from("answers")
  .insert({
    question_id: formData.questionId,
    content: formData.content,
    author_id: user.id,
    is_ai: false,
    is_approved: false,  // 기본값
  });

// 2. 관리자가 승인 처리
const { data: answer } = await supabase
  .from("answers")
  .update({
    is_approved: true,
    approved_at: new Date().toISOString(),
  })
  .eq("id", answerId);

// 3. 질문 상태 자동 업데이트
if (answer?.question_id) {
  await supabase
    .from("questions")
    .update({ status: "answered" })
    .eq("id", answer.question_id);
}
```

## 4. 에러 처리

### 권한 없음 에러
- **상황**: 일반 사용자가 미승인 답변 승인 시도
- **에러**: RLS 정책 위반
- **처리**: 403 Forbidden 또는 관리자 페이지 접근 차단

### 중복 승인 시도
- **상황**: 이미 승인된 답변을 재승인
- **처리**: 현재 상태 확인 후 무시 또는 경고 메시지

### 질문 상태 업데이트 실패
- **상황**: 답변 승인은 성공했으나 질문 상태 업데이트 실패
- **처리**: 로그 기록 후 수동 확인 필요

## 5. 구현 순서

### 1단계: 기본 답변 승인 시스템
- [x] 답변 생성 시 is_approved: false로 저장
- [x] 관리자 미승인 답변 목록 조회
- [x] 관리자 답변 승인/삭제 기능

### 2단계: 질문 상태 연동
- [x] 답변 승인 시 질문 상태를 'answered'로 자동 변경
- [x] 질문별 답변 조회 시 권한별 필터링
- [x] 페이지 캐시 무효화 (revalidatePath)

### 3단계: 관리자 인터페이스
- [x] 미승인 답변 목록 페이지
- [x] 답변 내용 수정 기능
- [x] 대시보드에서 승인 대기 수량 표시

### 4단계: AI 답변 승인 연동
- [x] AI 답변도 동일한 승인 프로세스 적용
- [x] is_ai 필드로 답변 출처 구분
- [x] 관리자 검토 후 승인/삭제

### 5단계: 사용자 경험 개선
- [x] 답변 작성 후 승인 대기 안내
- [x] 승인된 답변만 일반 사용자에게 노출
- [x] 관리자는 모든 답변 확인 가능

## 6. 관리자 승인 인터페이스

### 미승인 답변 목록 구조
```typescript
interface PendingAnswer {
  id: string;
  content: string;
  created_at: string;
  author: {
    id: string;
    name: string;
  };
  question: {
    id: string;
    title: string;
  };
  is_ai: boolean;
}
```

### 승인 액션 버튼
```typescript
// 승인 버튼
<Button onClick={() => approveAnswer(answer.id)}>
  승인
</Button>

// 수정 버튼  
<Button onClick={() => setEditingId(answer.id)}>
  수정
</Button>

// 삭제 버튼
<Button variant="destructive" onClick={() => deleteAnswer(answer.id)}>
  삭제
</Button>
```

### 페이지네이션
```typescript
const { data, count } = await getPendingAnswers({
  page: currentPage,
  pageSize: 20
});

const totalPages = Math.ceil(count / 20);
```

## 7. RLS 정책 연동

### 답변 조회 정책
```sql
-- 승인된 사용자만 답변 조회
CREATE POLICY "Approved users can view answers"
  ON answers FOR SELECT
  USING (is_approved_user());
```

### 답변 승인 정책  
```sql
-- 관리자만 답변 승인 가능
CREATE POLICY "Admins can update any answer"
  ON answers FOR UPDATE
  USING (is_admin());
```

### 본인 답변 관리
```sql
-- 본인 답변만 수정 가능
CREATE POLICY "Users can update own answers"
  ON answers FOR UPDATE
  USING (auth.uid() = author_id);
```

## 8. 대시보드 연동

### 승인 대기 통계
```typescript
// 관리자 대시보드에서 승인 대기 수 표시
export async function getPendingAnswersCount() {
  const { count } = await supabase
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("is_approved", false);

  return count || 0;
}
```

### 실시간 업데이트
- 답변 승인/삭제 시 대시보드 자동 갱신
- revalidatePath('/dashboard') 를 통한 캐시 무효화