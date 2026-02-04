# 홈 대시보드 설계서

## 1. 데이터 모델

### 대시보드 통계 데이터 구조
```typescript
interface DashboardStats {
  totalQuestions: number;      // 전체 질문 수
  weeklyQuestions: number;     // 이번 주 질문 수
  openQuestions: number;       // 미답변 질문 수
  pendingAnswers: number;      // 승인 대기 답변 수
  totalPosts: number;          // 총 게시글 수
  approvedMembers: number;     // 승인된 회원 수
}

interface WeeklyQuestionData {
  date: string;               // YYYY-MM-DD
  label: string;              // MM/DD 형태
  질문수: number;             // 일별 질문 수
}
```

### 최근 활동 데이터
```typescript
interface RecentQuestion {
  id: string;
  title: string;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  author: { id: string; name: string };
  category: { name: string } | null;
}

interface RecentPost {
  id: string;
  title: string;
  category: 'info' | 'notice' | 'webinar';
  created_at: string;
  author: { name: string } | null;
}
```

## 2. API 설계

### 관리자 대시보드 API

| 함수명 | 파라미터 | 설명 | 반환값 |
|--------|----------|------|---------|
| getDashboardStats | 없음 | 대시보드 주요 통계 | DashboardStats |
| getWeeklyQuestionStats | 없음 | 최근 4주 일별 질문 수 | WeeklyQuestionData[] |
| getRecentQuestions | limit?: number | 최근 질문 목록 | RecentQuestion[] |
| getRecentPosts | limit?: number | 최근 게시글 목록 | RecentPost[] |

### 학생 대시보드 API
| 함수명 | 파라미터 | 설명 | 반환값 |
|--------|----------|------|---------|
| getPosts | category: 'notice' | 공지사항 조회 | Post[] |

### 통계 계산 로직
```typescript
// 이번 주 질문 수 계산
const oneWeekAgo = new Date();
oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
const weeklyQuestions = questions.filter(
  (q) => new Date(q.created_at) > oneWeekAgo
).length;

// 미답변 질문 수 계산
const openQuestions = questions.filter((q) => q.status === "open").length;

// 최근 4주 일별 통계
const fourWeeksAgo = new Date();
fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

const dailyCounts: Record<string, number> = {};
for (let i = 0; i < 28; i++) {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const key = d.toISOString().split("T")[0];
  dailyCounts[key] = 0;
}
```

## 3. 컴포넌트 구조

### 대시보드 라우팅
```
src/app/(main)/dashboard/
├── page.tsx                            # 역할별 대시보드 라우터
├── admin-dashboard.tsx                 # 관리자 대시보드
└── student-home.tsx                    # 학생 홈 화면
```

### 공통 컴포넌트
```
src/components/dashboard/
├── WeeklyChart.tsx                     # 주간 질문 추이 차트
├── SalesSummary.tsx                    # 매출 요약 (학생용)
└── FloatingAskButton.tsx              # 질문하기 플로팅 버튼
```

### 역할 기반 라우팅 로직
```typescript
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, name")
    .eq("id", user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <StudentHome userName={profile?.name || "사용자"} />;
}
```

## 4. 에러 처리

### 데이터 조회 실패
- **상황**: DB 연결 실패 또는 권한 오류
- **처리**: 기본값 표시, 콘솔 로그 기록

```typescript
let stats = {
  totalQuestions: 0,
  weeklyQuestions: 0,
  openQuestions: 0,
  pendingAnswers: 0,
  totalPosts: 0,
  approvedMembers: 0,
};

try {
  stats = await getDashboardStats();
} catch (e) {
  console.error("Dashboard data fetch error:", e);
}
```

### 차트 렌더링 실패
- **상황**: 데이터 형식 오류 또는 빈 데이터
- **처리**: 빈 차트 또는 "데이터 없음" 메시지

### 권한 없는 접근
- **상황**: 미승인 사용자의 대시보드 접근
- **처리**: 메인 레이아웃에서 사전 차단

## 5. 구현 순서

### 1단계: 기본 대시보드 구조
- [x] 역할별 대시보드 라우팅
- [x] 관리자/학생용 레이아웃 분리
- [x] 기본 통계 카드 구현

### 2단계: 관리자 대시보드
- [x] 주요 통계 수집 API
- [x] 주간 질문 추이 차트
- [x] 최근 질문/게시글 목록
- [x] 승인 대기 답변 하이라이트

### 3단계: 학생 홈 화면
- [x] 매출 요약 컴포넌트
- [x] 공지사항 목록
- [x] 플로팅 질문 버튼

### 4단계: 사용자 경험 개선
- [x] 반응형 레이아웃
- [x] 로딩 상태 처리
- [x] 빈 데이터 상태 표시

### 5단계: 실시간 업데이트
- [x] 페이지 캐시 무효화 (revalidatePath)
- [ ] 실시간 알림 연동 (선택적)
- [ ] 자동 새로고침 (선택적)

## 6. UI/UX 설계

### 관리자 대시보드 레이아웃
```tsx
// 5개 통계 카드 그리드
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
  <StatCard title="전체 질문" value={stats.totalQuestions} />
  <StatCard title="미답변 질문" value={stats.openQuestions} />
  <StatCard title="검토 대기 답변" value={stats.pendingAnswers} highlight />
  <StatCard title="정보 공유" value={stats.totalPosts} />
  <StatCard title="회원" value={stats.approvedMembers} />
</div>

// 주간 차트
<Card>
  <CardHeader>
    <CardTitle>질문 추이 (최근 4주)</CardTitle>
  </CardHeader>
  <CardContent>
    <WeeklyChart data={weeklyData} />
  </CardContent>
</Card>

// 최근 활동 2열 그리드
<div className="grid gap-4 lg:grid-cols-2">
  <RecentQuestions />
  <RecentPosts />
</div>
```

### 학생 홈 화면 레이아웃
```tsx
// 배경 장식 그래디언트
<div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
  <div className="absolute -top-32 -right-32 h-[500px] w-[500px] 
                  rounded-full bg-gradient-to-br from-primary/5 
                  via-blue-400/5 to-transparent blur-3xl" />
</div>

// 매출 요약
<SalesSummary />

// 공지사항 목록
<NoticeSection notices={notices} />

// 플로팅 질문 버튼
<FloatingAskButton />
```

### 상태별 배지 색상
```typescript
const statusLabel = {
  open: "미답변",
  answered: "답변완료", 
  closed: "종료",
};

const statusColor = {
  open: "destructive",    // 빨간색
  answered: "default",    // 기본색
  closed: "secondary",    // 회색
};
```

## 7. 데이터 시각화

### 주간 차트 구현
```typescript
// WeeklyChart 컴포넌트 (Recharts 사용)
interface ChartData {
  date: string;
  label: string;
  질문수: number;
}

export function WeeklyChart({ data }: { data: ChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Line 
          type="monotone" 
          dataKey="질문수" 
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 통계 카드 하이라이트
```tsx
// 승인 대기 답변이 있을 때 특별 스타일
<Card className={`cursor-pointer transition-colors 
  ${stats.pendingAnswers > 0 ? 
    "border-blue-200 bg-blue-50/50 hover:border-blue-300" : 
    "hover:border-gray-300"
  }`}>
  <CardHeader>
    <CardDescription className="flex items-center gap-1.5">
      검토 대기 답변
      {stats.pendingAnswers > 0 && (
        <Badge className="h-5 px-1.5 text-[10px] bg-blue-600">
          {stats.pendingAnswers}
        </Badge>
      )}
    </CardDescription>
  </CardHeader>
</Card>
```

## 8. 성능 고려사항

### 데이터 캐싱
- Next.js App Router의 자동 캐싱 활용
- 통계 데이터는 15분 간격으로 재계산
- 최근 활동은 5분 간격으로 업데이트

### 병렬 데이터 로딩
```typescript
// Promise.all을 사용한 병렬 데이터 조회
const [stats, weeklyData, recentQuestions, recentPosts] = await Promise.all([
  getDashboardStats(),
  getWeeklyQuestionStats(), 
  getRecentQuestions(5),
  getRecentPosts(5),
]);
```

### 점진적 로딩
- 중요한 통계 먼저 표시
- 차트와 목록은 지연 로딩
- 에러 발생 시 부분적 표시

### 반응형 최적화
- 모바일에서 불필요한 차트 숨김
- 카드 레이아웃 자동 조정
- 터치 친화적 인터랙션