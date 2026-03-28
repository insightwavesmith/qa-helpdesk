# 초대코드 만료 자동 비활성화 — Design

## 1. 데이터 모델
기존 `invite_codes` 테이블 그대로 사용. 스키마 변경 없음.
- `expires_at` (timestamp) — 만료일 비교 기준
- 만료 판단: `expires_at < now()` (프론트/백 모두 실시간 비교)

## 2. API 설계

### 2.1 신규 Server Action: `updateInviteCodeExpiry`
| 항목 | 값 |
|------|-----|
| 위치 | `src/actions/invites.ts` |
| 인증 | `requireAdmin()` |
| 입력 | `{ code: string, expiresAt: string }` |
| 동작 | `invite_codes.update({ expires_at })` WHERE `code` |
| 반환 | `{ error: string \| null }` |

### 2.2 기존 API (변경 없음)
- `POST /api/invite/validate` — 만료 체크 이미 구현
- `useInviteCode()` — 만료 체크 이미 구현

## 3. 컴포넌트 구조

### 3.1 AdminInvitesPage 변경사항

#### 뱃지 색상 변경
```
만료됨: bg-red-100 text-red-700 → bg-gray-100 text-gray-500 (회색)
소진됨: bg-yellow-100 text-yellow-700 (유지)
활성:  bg-green-100 text-green-800 (유지)
```

#### 만료일 연장 버튼 추가
- 만료된 코드 행의 "관리" 열에 캘린더 아이콘 버튼 추가
- 클릭 시: 새 만료일 입력 다이얼로그 (간단한 prompt 또는 인라인 date input)
- 구현 방식: `window.prompt`로 날짜 입력 → `updateInviteCodeExpiry` 호출
  - prompt 대신 인라인 date input + 확인 버튼 (UX 우선)

#### 상태 관리 추가
- `editingExpiry: string | null` — 현재 만료일 편집 중인 코드
- `newExpiryDate: string` — 새 만료일 값
- `expiryLoading: boolean` — 연장 처리 중 로딩

## 4. 에러 처리
| 상황 | 메시지 |
|------|--------|
| 연장 성공 | toast.success("만료일이 연장되었습니다.") |
| 연장 실패 | toast.error("만료일 연장에 실패했습니다.") |
| 과거 날짜 선택 | 프론트에서 차단 (min 속성으로 오늘 이후만) |

## 5. 구현 순서
1. [ ] `src/actions/invites.ts` — `updateInviteCodeExpiry` 추가
2. [ ] `src/app/(main)/admin/invites/page.tsx` — 뱃지 색상 회색으로 변경
3. [ ] `src/app/(main)/admin/invites/page.tsx` — 만료일 연장 UI + 핸들러 추가
4. [ ] 빌드 검증 (`npm run build`)
