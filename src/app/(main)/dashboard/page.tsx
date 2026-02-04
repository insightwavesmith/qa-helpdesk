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
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  getDashboardStats,
  getWeeklyQuestionStats,
  getRecentQuestions,
  getRecentPosts,
} from "@/actions/admin";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";

const statusLabels: Record<string, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "마감",
};

const postCategoryLabels: Record<string, string> = {
  info: "정보",
  notice: "공지",
  webinar: "웨비나",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function DashboardPage() {
  const [stats, chartData, recentQuestions, recentPosts] = await Promise.all([
    getDashboardStats(),
    getWeeklyQuestionStats(),
    getRecentQuestions(5),
    getRecentPosts(5),
  ]);

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
          <CardTitle>주간 질문 추이</CardTitle>
          <CardDescription>최근 4주간 일별 질문 등록 수</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyChart data={chartData} />
        </CardContent>
      </Card>

      {/* Recent Questions & Posts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">최근 질문</CardTitle>
              <CardDescription>최근 등록된 질문 목록</CardDescription>
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
              <p className="text-sm text-muted-foreground">
                아직 질문이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {recentQuestions.map((q) => (
                  <Link
                    key={q.id}
                    href={`/questions/${q.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {q.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {(q.category as { name: string } | null)?.name}
                        </span>
                        <span>
                          {(q.author as { name: string } | null)?.name}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        q.status === "open" ? "secondary" : "default"
                      }
                      className="ml-2 shrink-0 text-xs"
                    >
                      {statusLabels[q.status] || q.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">최근 게시글</CardTitle>
              <CardDescription>최근 공유된 정보 목록</CardDescription>
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
              <p className="text-sm text-muted-foreground">
                아직 게시글이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {recentPosts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {p.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {(p.author as { name: string } | null)?.name ||
                            "익명"}
                        </span>
                        <span>{formatDate(p.created_at)}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                      {postCategoryLabels[p.category] || p.category}
                    </Badge>
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
