# 홈 대시보드 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델

### 대시보드 통계 데이터 (admin.ts → getDashboardStats)
```typescript
{
  totalQuestions: number;      // 전체 질문 수
  weeklyQuestions: number;     // 이번 주 질문 수
  openQuestions: number;       // 미답변 질문 수
  pendingAnswers: number;      // 승인 대기 답변 수
  totalPosts: number;          // 총 게시글 수
  activeMembers: number;       // 활성 회원 수 (role IN member, student)
}
```

## 2. 컴포넌트 구조

### 대시보드 라우팅 (5분기)
```
src/app/(main)/dashboard/
├── page.tsx                   # 역할별 분기 라우터
├── admin-dashboard.tsx        # 관리자 대시보드
├── member-dashboard.tsx       # lead/member 대시보드
├── student-home.tsx           # student/alumni 홈
├── student-ad-summary.tsx     # 광고 성과 요약 (student용)
└── v0-dashboard.tsx           # (레거시)
```

### 역할별 분기 로직 (page.tsx)
```typescript
if (role === "admin") return <AdminDashboard />;
if (role === "lead" || role === "member") return <MemberDashboard />;
if (role === "pending") redirect("/pending");  // lead with pending status
if (role === "rejected") return <거절 안내 UI />;
return <StudentHome />;  // student, alumni
```

### 사이드바 vs 학생 헤더
- admin, assistant → Sidebar 레이아웃 (layout.tsx)
- student, alumni, lead, member → StudentHeader 레이아웃

## 3. 관리자 대시보드 (admin-dashboard.tsx)

### 통계 카드 그리드
- 전체 질문, 미답변 질문, 검토 대기 답변 (하이라이트), 정보 공유, 회원
- `getDashboardStats()` + `getRecentQuestions(5)` + `getRecentPosts(5)` 병렬 조회

### 최근 활동 2열 그리드
- 최근 질문 목록 (5건)
- 최근 게시글 목록 (5건)

> 참고: WeeklyChart는 src/components/dashboard/에 존재하나 현재 미사용 (dead code)

## 4. 학생 홈 (student-home.tsx)

### StudentAdSummary 컴포넌트
- ad_accounts + daily_ad_insights 조회
- 광고 성과 요약 카드 표시

### 공지사항 목록
- category='notice' 게시글 표시

> 참고: SalesSummary.tsx, FloatingAskButton.tsx는 src/components/dashboard/에 존재하나 현재 미사용 (dead code)

## 5. 에러 처리
- DB 조회 실패 → 기본값 0 표시
- 권한 없는 접근 → middleware에서 사전 차단
