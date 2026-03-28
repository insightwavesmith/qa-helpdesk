# T5. 관리자 초대코드 관리 UI Plan

## 요구사항
- 관리자 전용 /admin/invites 페이지
- 초대코드 목록 테이블 (code, cohort, used_count/max_uses, expires_at, 복사/삭제 버튼)
- 코드 생성 폼 (코드, 기수, 만료일, 최대 사용횟수)
- 코드 복사 시 클립보드 복사 + 토스트
- 사이드바에 "초대코드" 메뉴 추가 (admin 전용)

## 범위
- 파일: `src/app/(main)/admin/invites/page.tsx` (신규)
- 의존: T0 (DB), T2 (actions/invites.ts - 동시 생성 중이므로 import만)
- 사이드바: `src/components/dashboard/Sidebar.tsx` (수정 - 메뉴 추가)

## 성공 기준
1. /admin/invites 페이지에서 초대코드 목록 조회
2. 코드 생성 폼으로 신규 초대코드 생성
3. 코드 복사 버튼 클릭 시 클립보드 복사 + 토스트
4. 삭제 버튼 클릭 시 confirm 후 삭제
5. 사이드바에 "초대코드" 메뉴 표시 (admin만)
6. npm run build 성공
