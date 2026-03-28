# T6. 대시보드 라우팅 수정 + Sidebar 역할별 메뉴 필터링 Plan

## 요구사항
- dashboard/page.tsx: 역할별 올바른 대시보드 컴포넌트 렌더링
- Sidebar.tsx: lead/member에게 Q&A 메뉴 숨김, lead에게도 총가치각도기 Lock
- layout.tsx: lead redirect(/pending) 제거, lead/member에게 sidebar 레이아웃 제공

## 범위
- 파일:
  - `src/app/(main)/dashboard/page.tsx` (수정)
  - `src/components/dashboard/Sidebar.tsx` (수정)
  - `src/app/(main)/layout.tsx` (수정 - lead redirect 제거 + member/lead sidebar 레이아웃)
- 의존: T3 (미들웨어 역할 분기) 완료 후

## 성공 기준
1. admin -> AdminDashboard
2. lead/member -> MemberDashboard (Q&A 접근 불가, 총가치각도기 lead도 Lock)
3. student/alumni -> StudentHome
4. pending (레거시) -> redirect("/pending")
5. rejected -> 에러 메시지 카드
6. Sidebar: lead/member에게 Q&A 메뉴 숨김
7. Sidebar: lead에게도 총가치각도기 Lock (기존 member만 Lock)
8. Sidebar: 초대코드 adminNavItem 이미 존재 확인 (T5 완료)
9. layout.tsx: lead redirect(/pending) 제거 -> lead/member도 sidebar 레이아웃
10. npm run build 성공
