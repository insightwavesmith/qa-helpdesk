import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  MessageCircleQuestion,
  Clock,
  FileText,
  Users,
  TrendingUp,
} from "lucide-react";
import { getDashboardStats } from "@/actions/admin";

export default async function DashboardPage() {
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
    console.error("Dashboard stats error:", e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground">
          사관학교 헬프데스크 현황을 한눈에 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>전체 질문</CardDescription>
            <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalQuestions}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              이번 주 +{stats.weeklyQuestions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>답변 대기</CardDescription>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.openQuestions}</div>
            <p className="text-xs text-muted-foreground mt-1">미답변 질문</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>정보 공유</CardDescription>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPosts}</div>
            <p className="text-xs text-muted-foreground mt-1">게시글 수</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>회원</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.approvedMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">승인된 회원</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>최근 활동</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            아직 등록된 질문이나 게시글이 없습니다. Q&amp;A 메뉴에서 첫 질문을 등록해보세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
