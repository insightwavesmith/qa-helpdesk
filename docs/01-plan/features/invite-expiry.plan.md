# 초대코드 만료 자동 비활성화 — Plan

## 배경
관리자가 초대코드에 만료일을 설정하지만, 만료일이 지나도 목록에서 빨간색 "만료됨" 뱃지로만 표시됨.
TASK 요구사항: 회색 뱃지, 만료된 코드로 가입 차단, 관리자 재활성화(만료일 연장) 기능.

## 범위

### 변경 필요
1. **관리자 UI (page.tsx)**: 만료 뱃지 빨강 → 회색 변경
2. **관리자 UI (page.tsx)**: 만료된 코드에 "만료일 연장" 버튼 추가
3. **Server Action (invites.ts)**: `updateInviteCodeExpiry` 액션 추가

### 변경 불필요 (이미 구현됨)
- 회원가입 시 만료 체크 (`useInviteCode`, `/api/invite/validate`)
- 만료 에러 메시지 ("초대코드가 만료되었습니다")
- 만료일 비교 로직 (실시간, DB 상태 변경 아님)

## 성공 기준
1. 만료일 지난 코드 → 목록에서 **회색** "만료" 뱃지
2. 만료된 코드로 가입 시도 → "만료된 초대코드입니다" (기존 동작 유지)
3. 유효한 코드로 가입 → 정상 동작 (기존 동작 유지)
4. 관리자가 만료된 코드의 만료일을 연장 → 재활성화 (회색→초록 뱃지 전환)
5. `npm run build` 성공

## 하지 말 것
- 기존 초대코드 데이터 삭제 금지
- 회원가입 플로우 변경 금지
- 활성 코드에 영향 없어야 함

## 관련 파일
- `src/app/(main)/admin/invites/page.tsx` — 관리자 UI
- `src/actions/invites.ts` — Server Actions
- `src/app/api/invite/validate/route.ts` — 검증 API (변경 없음)
- `src/app/(auth)/signup/page.tsx` — 회원가입 (변경 없음)
