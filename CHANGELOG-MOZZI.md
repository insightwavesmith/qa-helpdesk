# CHANGELOG-MOZZI.md

모찌가 에이전트팀 외부에서 직접 수정한 내역.
에이전트팀 리더는 작업 시작 전 이 파일을 확인하고, 충돌 방지할 것.

---

## 2026-02-11

### 19:40 — AI 어시스턴트 → Smith 변경, AI 답변 뱃지 제거
- **파일**: `src/components/questions/AnswerCard.tsx`, `src/app/(main)/questions/[id]/page.tsx`, `src/lib/gemini.ts`
- **내용**: AI 답변 작성자명 "AI 어시스턴트" → "Smith", AI 답변 뱃지 제거, 시스템 프롬프트 Smith 대표 역할로 변경
- **이유**: 고객에게 AI 답변임을 노출하지 않기 위함
- **커밋**: `f5083b6`

### 15:30 — recipients 쿼리 limit 수정
- **파일**: `src/actions/recipients.ts`
- **내용**: 모든 수신자 조회에 `.limit(5000)` + `count: "exact"` 추가
- **이유**: Supabase 기본 1000행 제한으로 리드 수가 1,000으로 잘리는 문제
- **커밋**: `4941add`

### 14:24 — 콘텐츠 편집 다이얼로그 아카이브 버튼 추가
- **파일**: `src/components/content/content-editor-dialog.tsx`
- **내용**: 삭제 버튼 옆에 아카이브 버튼 추가. `updateContent(id, { status: "archived" })` 호출. confirm 확인 포함.
- **커밋**: `a9eb4fb`

### 14:02 — getContents archived 필터 추가
- **파일**: `src/actions/contents.ts`
- **내용**: `getContents()` status 필터 없이 호출 시 `archived` 상태 자동 제외 (`query.neq("status", "archived")`)
- **이유**: archived 콘텐츠가 관리자 목록에 계속 노출되는 문제
- **커밋**: `f897951`

### 13:38 — 새 콘텐츠 생성 시 카테고리/유형 선택 추가
- **파일**: `src/components/content/new-content-modal.tsx`
- **내용**: 모달 상단에 카테고리(교육/공지/고객사례) + 유형(정보공유/성과/홍보) Select 추가, `createContent` 호출 시 값 전달
- **이유**: 새 콘텐츠 만들 때 카테고리 선택 불가 문제
- **커밋**: `e2c9bf9`

### DB 변경 (Supabase 직접)
- `759ababf` category → `notice`, `557d6340` category → `case_study`
- 나머지 9개 콘텐츠 status → `archived` (soft delete)
