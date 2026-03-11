# TASK: 핫픽스 3건 (Sprint 0311-2)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

---

## H1. 초대코드 사용량 카운트 버그

### 고객 시나리오
관리자가 초대코드 관리 페이지에서 사용 횟수를 확인하는데, 어제 많이 사용된 코드가 5개만 사용됐다고 표시된다. 실제 사용량보다 적게 카운트됨.

### 기대 동작
- 초대코드별 실제 사용 횟수가 정확히 표시되어야 함
- `invite_codes` 테이블의 `used_count` 또는 `student_registry`/`profiles`에서 해당 코드로 가입한 실제 수를 카운트

### 힌트
- 이전에 초대코드 근본 수정한 커밋: `ae65086` (invite_code_used 저장)
- 가입 시 `invite_code_used` 필드에 코드 저장하는 로직 확인
- used_count가 `invite_codes` 테이블에 직접 저장되는지, 아니면 profiles 조인으로 계산하는지 확인
- 둘 다라면 동기화 문제일 수 있음

---

## H2. 총가치각도기 수집 UI 간소화

### 고객 시나리오
T3에서 만든 일괄 수집 UI에 체크박스 선택 기능이 있는데, 너무 복잡하다. 관리자는 그냥 "전체 수집" 버튼 하나만 있으면 된다.

### 기대 동작
- 기존 수집 모드 페이지에 **"전체계정 수집" 버튼 하나만** 남기기
- 체크박스 목록, "전체 선택", "선택 해제", "선택 수집(0)" 버튼 모두 제거
- 수집 날짜 선택 + 전체계정 수집 버튼 → 끝
- "(캠페인 유형 무관, 전체 수집)" 안내 문구는 유지

### 힌트
- T3 커밋: `c35b053`
- 관리자 광고계정 관리 또는 총가치각도기 관리 페이지에서 수정
- API는 그대로 유지 (`accountIds: "all"` 호출), 프론트만 간소화

---

## H3. 답변 수정 보완 (2건)

### H3-1. 답변 수정 시 재임베딩 추가

답변을 수정해도 knowledge_chunks에 재임베딩이 안 된다.

**수정 위치**: `src/actions/answers.ts` → `updateAnswerByAuthor()` 함수
**수정 내용**: DB 업데이트 성공 후 `embedQAPair(answer.question_id, answerId)` 호출 추가
- 기존 `createAnswerAction` (174번 줄)과 동일한 패턴으로:
```typescript
Promise.resolve(embedQAPair(answer.question_id, answerId))
  .catch(err => console.error("[re-embed] failed:", err));
```

### H3-2. 답변 수정 textarea 크기 키우기

현재 답변 수정 입력창이 너무 작아서 수정하기 불편함.

**수정**: 답변 수정 textarea의 `rows` 또는 `min-height`를 키워라.
- 최소 8줄 이상 (현재 2~3줄 수준)
- 가능하면 자동 높이 조절 (auto-resize)

---

## 공통 규칙
- **Plan 먼저 작성** → 코드 수정 → 빌드 검증 (tsc + lint + build)
- 커밋 메시지: `fix: H1 — 초대코드 사용량 카운트` / `fix: H2 — 수집 UI 간소화` / `fix: H3 — 답변 수정 재임베딩+textarea`
- 또는 하나로 합쳐도 됨: `fix: 핫픽스 3건 (초대코드 카운트, 수집 UI, 답변 재임베딩)`
