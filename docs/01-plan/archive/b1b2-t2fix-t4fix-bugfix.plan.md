# B1/B2/T2-fix/T4-fix 버그수정 + QA 톤 수정 Plan

## 요약
TASK.md 기반 4건 수정. 버그 2건 + QA 프롬프트 수정 2건.

## 범위

### B1: 회원가입 authError 처리 수정
- **파일**: `src/app/(auth)/signup/page.tsx`
- **문제**: signUp 후 authError 있으면 무조건 에러 표시 → 유저 생성됐어도 온보딩 미진행
- **수정**: authError 있어도 authData.user 존재하면 정상 플로우 진행
- **금지**: Auth 설정, middleware.ts, 가입 플로우 구조 변경

### B2: 회원 삭제 inactive 허용
- **파일**: `src/actions/admin.ts`
- **문제**: deleteMember()에서 `["lead", "member"]`만 허용 → inactive 삭제 불가
- **수정**: `["lead", "member", "inactive"]`로 변경 (1줄)
- **금지**: admin/student/assistant 삭제 허용, 다른 삭제 로직 변경

### T2-fix: QA 답변 포맷 수정
- **파일**: `src/lib/knowledge.ts` (QA_SYSTEM_PROMPT)
- **문제**: "핵심:" / "정리하면:" AI틱한 구조
- **수정**: 답변 구조 섹션을 자연스러운 규칙으로 교체
- **금지**: 말투, 마크다운 규칙 등 다른 섹션 수정, route.ts 수정

### T4-fix: QA 말투 변경
- **파일**: `src/lib/knowledge.ts` (QA_SYSTEM_PROMPT)
- **문제**: 단정형(~다) 말투 + 단정형 few-shot
- **수정**: 요체(~요) 말투로 변경 + few-shot 예시 교체
- **금지**: 마크다운 규칙, AI상투어 금지 목록 수정, route.ts 수정

## 성공 기준
- tsc 에러 0
- lint 에러 0
- npm run build 성공
- 기존 기능 미영향
