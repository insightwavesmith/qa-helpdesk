import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircleQuestion,
  Clock,
  FileText,
  Users,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  getDashboardStats,
  getWeeklyQuestionStats,
  getRecentQuestions,
  getRecentPosts,
} from "@/actions/admin";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";

export default async function DashboardPage() {
  let stats = {
    totalQuestions: 0,
    weeklyQuestions: 0,
    openQuestions: 0,
    pendingAnswers: 0,
    totalPosts: 0,
    approvedMembers: 0,
  };
  let weeklyData: { date: string; label: string; 질문수: number }[] = [];
  let recentQuestions: Awaited<ReturnType<typeof getRecentQuestions>> = [];
  let recentPosts: Awaited<ReturnType<typeof getRecentPosts>> = [];

  try {
    [stats, weeklyData, recentQuestions, recentPosts] = await Promise.all([
      getDashboardStats(),
      getWeeklyQuestionStats(),
      getRecentQuestions(5),
      getRecentPosts(5),
    ]);
  } catch (e) {
    console.error("Dashboard data fetch error:", e);
  }

  const statusLabel: Record<string, string> = {
    open: "미답변",
    answered: "답변완료",
    closed: "종료",
  };

  const statusColor: Record<string, string> = {
    open: "destructive",
    answered: "default",
    closed: "secondary",
  };

  const categoryLabel: Record<string, string> = {
    info: "정보공유",
    notice: "공지",
    webinar: "웨비나",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground">
          사관학교 헬프데스크 현황을 한눈에 확인하세요.
        </p>
      </div>

      {/* Stats Cards */}
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

      {/* Weekly Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">질문 추이 (최근 4주)</CardTitle>
          <CardDescription>일별 질문 등록 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyChart data={weeklyData} />
        </CardContent>
      </Card>

      {/* Recent Questions & Posts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">최근 질문</CardTitle>
              <CardDescription>최근 등록된 질문 5개</CardDescription>
            </div>
            <Link
              href="/questions"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              전체보기 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                아직 등록된 질문이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {recentQuestions.map((q: Record<string, unknown>) => (
                  <Link
                    key={q.id as string}
                    href={`/questions/${q.id}`}
                    className="block group"
                  >
                    <div className="flex items-start justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {q.title as string}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {((q.category as Record<string, unknown>)?.name as string) ? (
                            <span className="text-xs text-muted-foreground">
                              {(q.category as Record<string, unknown>).name as string}
                            </span>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {(q.author as Record<string, unknown>)?.name as string || "익명"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(q.created_at as string).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={
                          (statusColor[q.status as string] || "secondary") as
                            | "default"
                            | "secondary"
                            | "destructive"
                            | "outline"
                        }
                        className="shrink-0 text-xs"
                      >
                        {statusLabel[q.status as string] || (q.status as string)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Posts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">최근 게시글</CardTitle>
              <CardDescription>최근 공개된 게시글 5개</CardDescription>
            </div>
            <Link
              href="/posts"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              전체보기 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                아직 등록된 게시글이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {recentPosts.map((p: Record<string, unknown>) => (
                  <Link
                    key={p.id as string}
                    href={`/posts/${p.id}`}
                    className="block group"
                  >
                    <div className="flex items-start justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {p.title as string}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {(p.author as Record<string, unknown>)?.name as string || "관리자"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(p.created_at as string).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {categoryLabel[p.category as string] || (p.category as string)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
