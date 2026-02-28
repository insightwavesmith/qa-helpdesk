# T5. 관리자 초대코드 관리 UI 설계서

## 1. 데이터 모델

### InviteCode (from database.ts)
| 필드 | 타입 | 설명 |
|------|------|------|
| code | string | PK, 초대코드 (예: BS6-2026) |
| cohort | string / null | 기수 |
| created_by | string / null | 생성한 관리자 UUID |
| expires_at | string / null | 만료일시 (ISO) |
| max_uses | number / null | 최대 사용 횟수 |
| used_count | number / null | 현재 사용 횟수 |

## 2. Server Actions (src/actions/invites.ts - 백엔드팀 동시 생성)
- `getInviteCodes()` -> `{ data: InviteCode[] | null; error: string | null }`
- `createInviteCode({ code, cohort, expiresAt, maxUses })` -> `{ error: string | null }`
- `deleteInviteCode(code)` -> `{ error: string | null }`

## 3. 컴포넌트 구조

### 페이지: `src/app/(main)/admin/invites/page.tsx` ("use client")
- State: codes[], loading, form fields (code, cohort, expiresAt, maxUses), formLoading
- useEffect: 최초 로드 시 getInviteCodes() 호출
- 구성:
  1. 헤더: "초대코드 관리" + 설명
  2. 생성 폼 카드 (bg-white rounded-xl shadow-sm border)
  3. 목록 테이블 (Table 컴포넌트 사용)

### 사이드바 수정: `src/components/dashboard/Sidebar.tsx`
- adminNavItems 배열에 `{ label: "초대코드", href: "/admin/invites", icon: Ticket }` 추가
- Ticket 아이콘 import 추가

## 4. 에러 처리
| 상황 | 사용자 메시지 |
|------|---------------|
| 목록 로드 실패 | toast.error("초대코드 목록을 불러오는데 실패했습니다.") |
| 생성 실패 | toast.error("초대코드 생성에 실패했습니다: {error}") |
| 삭제 실패 | toast.error("삭제에 실패했습니다.") |
| 코드 미입력 | 버튼 비활성화 (disabled) |

## 5. 구현 순서
1. [x] Plan 문서 작성
2. [x] Design 문서 작성
3. [ ] src/app/(main)/admin/invites/page.tsx 생성
4. [ ] src/components/dashboard/Sidebar.tsx에 메뉴 추가
5. [ ] npm run build 확인
