# TASK: 뉴스레터 수신자 동기화 수정

## 타입
개발

## 목표
뉴스레터 발송 대상을 실제 고객 데이터 기반으로 정확히 집계.
- **리드**: `leads` 테이블 (email_opted_out=false)
- **수강생**: `student_registry` 테이블 (이메일 있는 사람만)
- **멤버**: `profiles` role=member

UI 드롭다운: 리드/수강생/멤버 3개만 표시 ("전체" 항목 제거)

## 제약
- 계정 생성(auth.users INSERT) 금지
- `leads` 테이블 email_opted_out=true인 사람 제외 유지
- 기존 발송 로직(all_leads, all_students, all_members) 인터페이스 유지
- `RecipientTarget` 타입에서 "all" 제거 시 관련 코드 전체 정리

## 현재 코드

### `src/actions/recipients.ts` — 버그 위치

```ts
// RecipientTarget 타입 (L5-10)
export type RecipientTarget =
  | "all"          // ← 제거 대상
  | "all_leads"
  | "all_students"
  | "all_members"
  | "custom";

// RecipientStats 인터페이스 (L18-22)
export interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  all_deduplicated: number;  // ← 제거 또는 유지 (내부 계산용)
}

// getRecipientStats() 버그 1: student 이메일 미조회 (L176-178)
svc.from("student_registry").select("id", { count: "exact", head: true })
// → select("email") 로 변경 필요

// getRecipientStats() 버그 2: allEmails에 student 빠짐 (L185-189)
const leadsEmails = (leadsResult.data || []).map((r) => r.email);
const membersEmails = (membersResult.data || []).map((r) => r.email);
const allEmails = new Set([...leadsEmails, ...membersEmails]);  // student 없음!

// getRecipients() 버그: all_members가 student/admin 포함 (L101-107)
svc.from("profiles").select("email, name").in("role", ["member", "student", "admin"])
// → .eq("role", "member") 로 변경 필요

// getRecipientStats() 버그: membersResult도 동일 (L182-184)
svc.from("profiles").select("email", { count: "exact" }).in("role", ["member", "student", "admin"])
// → .eq("role", "member") 로 변경 필요
```

### `src/components/content/newsletter-edit-panel.tsx` — UI 버그

```ts
// RecipientStats 로컬 인터페이스 (L47-52) - 이미 수정됨
interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  all_deduplicated: number;
}

// getRecipientCount() (L107-120) - case "all" 제거 대상
case "all":
  return recipientStats.all_deduplicated;  // ← 제거

// 드롭다운 (L282-296) - "전체" SelectItem 제거 대상
<SelectItem value="all">
  전체{recipientStats ? ` (${recipientStats.all_deduplicated}명)` : ""}
</SelectItem>  // ← 제거
```

## 태스크

파일: src/actions/recipients.ts, src/components/content/newsletter-edit-panel.tsx

### T1. `src/actions/recipients.ts` 수정 → backend-dev
- [ ] `getRecipientStats()`에서 `studentsResult` 쿼리: `select("id", { count: "exact", head: true })` → `select("email").not("email", "is", null).neq("email", "")`
- [ ] `getRecipientStats()`에서 `studentsEmails` 변수 추출 후 `allEmails`에 포함
  ```ts
  const studentsEmails = (studentsResult.data || []).map((r) => r.email);
  const allEmails = new Set([...leadsEmails, ...studentsEmails, ...membersEmails]);
  ```
- [ ] `getRecipientStats()`에서 `membersResult` 쿼리: `.in("role", ["member", "student", "admin"])` → `.eq("role", "member")`
- [ ] `getRecipients()`의 `all_members` 케이스: `.in("role", ["member", "student", "admin"])` → `.eq("role", "member")`
- [ ] `getRecipients()`의 `all_students` 케이스: `.limit(5000)` 앞에 `.not("email", "is", null).neq("email", "")` 추가
- [ ] `RecipientTarget` 타입에서 `"all"` 제거 (+ `target === "all"` 분기 코드 전체 제거)
- [ ] `RecipientStats` 인터페이스에서 `all_deduplicated` 제거 (UI에서 안 쓰면) 또는 유지

### T2. `src/components/content/newsletter-edit-panel.tsx` 수정 → frontend-dev
- [ ] `RecipientStats` 로컬 인터페이스에서 `all_deduplicated` 제거 (T1 결과에 따라)
- [ ] `getRecipientCount()` 함수에서 `case "all"` 블록 제거
- [ ] 드롭다운에서 `<SelectItem value="all">` 블록 제거
- [ ] `defaultValue` 또는 초기값이 `"all"`이면 `"all_leads"`로 변경

### T3. 빌드 및 검증 → code-reviewer
- [ ] `npm run build` 성공 확인
- [ ] TypeScript 타입 에러 없음 확인

## 검증

### SC-1: 드롭다운 항목 확인
- 뉴스레터 편집 패널에서 발송 대상 드롭다운 클릭 → "리드 전체 (1267명)", "수강생 (56명)", "회원 (2명)" 3개만 나와야 함
- "전체" 항목이 있으면 → FAIL

### SC-2: 수강생 수신자 확인
- "수강생" 선택 후 발송 시도 → 56명 대상으로 나와야 함
- 이메일 없는 22명이 포함되면 → FAIL

### SC-3: 멤버 수신자 확인
- "회원" 선택 시 → profiles role=member 2명만 결과로 나와야 함
- student/admin이 포함되면 → FAIL

## 엣지 케이스
1. **student_registry 이메일 null인 경우**: 22명 → `.not("email", "is", null)` 필터로 제외되어야 함
2. **leads + student_registry 이메일 중복**: 동일 이메일이 두 테이블에 있으면 `all_deduplicated`에서 1건으로 처리
3. **RecipientTarget "all" 제거 후 기존 저장된 content의 recipient_target 값**: DB에 "all"로 저장된 레코드가 있으면 undefined 처리 필요 → `contents` 테이블 확인

## 완료 후 QA
1. 빌드 성공 확인
2. 드롭다운 3개 항목 UI 확인 (브라우저)
3. 각 카테고리 수신자 수 정확도 확인

완료 후 모찌(agent:main:main)에게 sessions_send로 결과 보고

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-23-recipient-sync.html
- 리뷰 일시: 2026-02-23
- 변경 유형: 버그 수정 (수신자 쿼리/UI)
- 판정: TASK.md 지시사항 9/9 정확, 추가 우려 3건 (C-01~C-03)
