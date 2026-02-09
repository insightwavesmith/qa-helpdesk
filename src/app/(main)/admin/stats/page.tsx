import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart3,
  MessageSquare,
  Bot,
  CheckCircle,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getStats() {
  const supabase = createServiceClient();

  const [
    questionsResult,
    answersResult,
    approvedResult,
    activeUsersResult,
    postsResult,
    weeklyQuestionsResult,
  ] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("answers").select("*", { count: "exact", head: true }),
    supabase
      .from("answers")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("role", ["member", "student", "alumni", "admin"]),
    supabase.from("contents").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return {
    totalQuestions: questionsResult.count ?? 0,
    totalAnswers: answersResult.count ?? 0,
    approvedAnswers: approvedResult.count ?? 0,
    activeUsers: activeUsersResult.count ?? 0,
    totalPosts: postsResult.count ?? 0,
    weeklyQuestions: weeklyQuestionsResult.count ?? 0,
  };
}

export default async function AdminStatsPage() {
  const stats = await getStats();

  const statCards = [
    {
      label: "총 질문 수",
      value: stats.totalQuestions,
      icon: MessageSquare,
      accentColor: "border-l-blue-500",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      label: "AI 답변 수",
      value: stats.totalAnswers,
      icon: Bot,
      accentColor: "border-l-purple-500",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-500",
    },
    {
      label: "승인된 답변",
      value: stats.approvedAnswers,
      icon: CheckCircle,
      accentColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
    {
      label: "활성 회원",
      value: stats.activeUsers,
      icon: Users,
      accentColor: "border-l-[#F75D5D]",
      iconBg: "bg-red-50",
      iconColor: "text-[#F75D5D]",
    },
    {
      label: "콘텐츠 수",
      value: stats.totalPosts,
      icon: FileText,
      accentColor: "border-l-amber-500",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
    {
      label: "이번 주 질문",
      value: stats.weeklyQuestions,
      icon: TrendingUp,
      accentColor: "border-l-blue-400",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">통계</h1>
        <p className="text-sm text-gray-500 mt-1">
          서비스 이용 현황을 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${stat.accentColor} p-6`}
            >
              <CardHeader className="p-0 pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {stat.label}
                  </CardDescription>
                  <div className={`${stat.iconBg} p-2 rounded-lg`}>
                    <Icon className={`h-4 w-4 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <CardTitle className="text-[32px] font-bold text-gray-900">
                  {stat.value}
                </CardTitle>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-900">활동 트렌드</CardTitle>
          <CardDescription className="text-sm text-gray-500">
            주간 활동 현황 차트가 여기에 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
              <BarChart3 className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">
              데이터가 쌓이면 차트가 표시됩니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
