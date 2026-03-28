# T6. 대시보드 라우팅 수정 + Sidebar 역할별 메뉴 필터링 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델
- profiles.role: "lead" | "member" | "student" | "alumni" | "admin" | "assistant" | "pending" | "rejected"
- 기존 스키마 변경 없음

## 2. API 설계
- API 변경 없음 (프론트엔드 라우팅/UI 변경만)

## 3. 컴포넌트 구조

### dashboard/page.tsx — 역할별 분기
```tsx
admin → <AdminDashboard />
lead | member → <MemberDashboard />
pending → redirect("/pending")
rejected → 에러 메시지 JSX (카드)
student | alumni | default → <StudentHome />
```

### Sidebar.tsx (DashboardSidebar)
```tsx
// renderNavItem 내 조건부 필터링
- Q&A (/questions): lead/member에게 return null
- 총가치각도기 (/protractor): lead/member 모두 Lock (gray 아이콘)
- 관리자 메뉴: admin/assistant에게만 표시
```

### layout.tsx — 레이아웃 분기
```tsx
// admin, assistant → Sidebar 레이아웃 (DashboardSidebar)
// student, alumni, member, lead → StudentHeader 레이아웃
usesSidebarLayout = role === "admin" || role === "assistant"
```

> 주의: lead/member는 Sidebar가 아닌 StudentHeader를 사용함 (설계 초기와 달라짐)

## 4. 에러 처리
- rejected role: "가입이 거절되었습니다" + /login 링크
- profile 없는 경우: 기존 로직 유지 (StudentHome fallback)

## 5. 구현 순서
- [x] Plan 문서 작성
- [x] Design 문서 작성
- [x] dashboard/page.tsx: lead/member/pending/rejected 분기 추가
- [x] Sidebar.tsx: Q&A 필터링 + 총가치각도기 Lock 확장
- [x] layout.tsx: lead redirect 제거 + sidebar 레이아웃 확장
- [x] npm run build 확인
