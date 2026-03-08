# 초대코드 만료 자동 비활성화 — Gap 분석

## Match Rate: 100%

## 일치 항목

### 설계 항목 1: 만료 뱃지 회색으로 변경
- **설계**: `bg-gray-100 text-gray-500` 회색 뱃지, 텍스트 "만료"
- **구현**: ✅ `bg-gray-100 text-gray-500 rounded-full px-3 py-1 text-xs` — "만료"
- **일치**: 완전 일치

### 설계 항목 2: `updateInviteCodeExpiry` Server Action
- **설계**: `requireAdmin()`, `{ code, expiresAt }` 입력, `invite_codes.update({ expires_at })`
- **구현**: ✅ `src/actions/invites.ts`에 추가. `requireAdmin()` → `.update({ expires_at })` → `{ error: string | null }`
- **일치**: 완전 일치

### 설계 항목 3: 만료일 연장 UI
- **설계**: 만료된 코드 행에 캘린더 버튼, 인라인 date input + 확인/취소 버튼
- **구현**: ✅ `CalendarPlus` 아이콘 버튼 → 클릭 시 인라인 date input + 확인/취소 표시. `min` 속성으로 과거 날짜 차단.
- **일치**: 완전 일치

### 설계 항목 4: 에러 처리
- **설계**: 성공 toast, 실패 toast, 과거 날짜 차단
- **구현**: ✅ `toast.success("만료일이 연장되었습니다.")`, `toast.error(...)`, `min={today}` 속성
- **일치**: 완전 일치

### 기존 동작 보존
- **만료 체크 (백엔드)**: 변경 없음 ✅
- **만료 에러 메시지**: 변경 없음 ✅
- **회원가입 플로우**: 변경 없음 ✅
- **활성 코드 영향**: 없음 ✅

## 불일치 항목
없음

## 수정 필요
없음

## 빌드 검증
- `npx tsc --noEmit`: ✅ 에러 0개
- `npm run lint`: ✅ 수정 파일 에러 0개
- `npm run build`: ✅ 성공
