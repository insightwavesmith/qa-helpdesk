# B1/B2/T2-fix/T4-fix 설계서

## 1. 데이터 모델
변경 없음.

## 2. API 설계
변경 없음.

## 3. 컴포넌트 / 로직 변경

### B1: signup/page.tsx (line 143-146)
```diff
- if (authError) {
-   setError(authError.message);
-   return;
- }
+ if (authError && !authData?.user) {
+   setError(authError.message);
+   return;
+ }
```

### B2: admin.ts (line 401)
```diff
- if (!["lead", "member"].includes(profile.role)) {
+ if (!["lead", "member", "inactive"].includes(profile.role)) {
```

### T2-fix: knowledge.ts QA_SYSTEM_PROMPT 답변 구조
기존 "핵심:/정리하면:" 구조 → 자연스러운 답변 구조 규칙으로 교체

### T4-fix: knowledge.ts QA_SYSTEM_PROMPT 말투
- 말투 규칙: 단정형(~다) → 요체(~요)
- 어미 다양화: 요체 기반으로 업데이트
- 문장 리듬 예시: 요체로 수정
- 톤 레퍼런스: 요체로 수정
- 답변 예시: TASK.md 좋은 예/나쁜 예로 교체
- 셀프 검수: ~요 비율 규칙 → 어미 변주 규칙으로 수정

## 4. 에러 처리
- B1: authError + user 존재 → 에러 무시, 정상 플로우
- B1: authError + user 미존재 → 에러 표시 + return
- B2: inactive role → 삭제 허용
- B2: admin/student/assistant → 기존대로 삭제 차단

## 5. 구현 순서
- [x] B1 signup authError 처리
- [x] B2 admin inactive 삭제 허용
- [x] T2-fix 답변 구조 교체
- [x] T4-fix 말투 + few-shot 교체
- [ ] tsc + lint + build 검증
- [ ] Gap 분석 작성
