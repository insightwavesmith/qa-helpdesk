import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircleQuestion,
  Clock,
  FileText,
  Users,
  Bot,
  ArrowRight,
} from "lucide-react";
import {
  getDashboardStats,
  getRecentQuestions,
  getRecentPosts,
} from "@/actions/admin";

export async function AdminDashboard() {
  let stats = {
    totalQuestions: 0,
    weeklyQuestions: 0,
    openQuestions: 0,
    pendingAnswers: 0,
    totalPosts: 0,
    approvedMembers: 0,
  };
  let recentQuestions: Awaited<ReturnType<typeof getRecentQuestions>> = [];
  let recentPosts: Awaited<ReturnType<typeof getRecentPosts>> = [];

  try {
    [stats, recentQuestions, recentPosts] = await Promise.all([
      getDashboardStats(),
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

  const categoryLabel: Record<string, string> = {
    info: "정보공유",
    notice: "공지",
    webinar: "웨비나",
  };

  return (
    <div className="space-y-10">
      {/* Page title */}
      <h1 className="text-[32px] font-bold tracking-tight text-foreground">
        대시보드
      </h1>

      {/* Stats — Notion-style inline metrics */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-4">
          {[
            { label: "전체 질문", value: stats.totalQuestions, icon: MessageCircleQuestion },
            { label: "미답변", value: stats.openQuestions, icon: Clock },
            { label: "검토 대기", value: stats.pendingAnswers, icon: Bot, href: "/admin/answers", highlight: stats.pendingAnswers > 0 },
            { label: "게시글", value: stats.totalPosts, icon: FileText },
            { label: "회원", value: stats.approvedMembers, icon: Users },
          ].map((stat) => {
            const Icon = stat.icon;
            const content = (
              <div key={stat.label} className={`py-3 px-1 rounded-[6px] transition-colors duration-150 ${stat.href ? "hover:bg-accent cursor-pointer" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">{stat.label}</span>
                </div>
                <p className={`text-[28px] font-bold tracking-tight ${stat.highlight ? "text-primary" : "text-foreground"}`}>
                  {stat.value}
                </p>
                {stat.highlight && (
                  <span className="text-[12px] text-primary">승인 필요</span>
                )}
              </div>
            );
            return stat.href ? (
              <Link key={stat.label} href={stat.href}>{content}</Link>
            ) : (
              <div key={stat.label}>{content}</div>
            );
          })}
        </div>
      </section>

      <hr className="border-border" />

      {/* Recent Questions — Notion-style list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wide">
            최근 질문
          </h2>
          <Link href="/questions" className="text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            전체보기 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentQuestions.length === 0 ? (
          <p className="text-[14px] text-muted-foreground py-4">등록된 질문이 없습니다.</p>
        ) : (
          <div>
            {recentQuestions.map((q: Record<string, unknown>) => (
              <Link key={q.id as string} href={`/questions/${q.id}`} className="group block">
                <div className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-[6px] transition-colors duration-150 hover:bg-accent">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-foreground line-clamp-1 group-hover:text-primary transition-colors duration-150">
                      {q.title as string}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {((q.category as Record<string, unknown>)?.name as string) && (
                        <span className="text-[12px] text-muted-foreground">
                          {(q.category as Record<string, unknown>).name as string}
                        </span>
                      )}
                      <span className="text-[12px] text-muted-foreground">
                        {(q.author as Record<string, unknown>)?.name as string || "익명"}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {new Date(q.created_at as string).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={(q.status as string) === "answered" ? "default" : (q.status as string) === "open" ? "secondary" : "outline"}
                    className="shrink-0 text-[11px] font-normal"
                  >
                    {statusLabel[q.status as string] || (q.status as string)}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Posts — Notion-style list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wide">
            최근 게시글
          </h2>
          <Link href="/posts" className="text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            전체보기 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentPosts.length === 0 ? (
          <p className="text-[14px] text-muted-foreground py-4">등록된 게시글이 없습니다.</p>
        ) : (
          <div>
            {recentPosts.map((p: Record<string, unknown>) => (
              <Link key={p.id as string} href={`/posts/${p.id}`} className="group block">
                <div className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-[6px] transition-colors duration-150 hover:bg-accent">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-foreground line-clamp-1 group-hover:text-primary transition-colors duration-150">
                      {p.title as string}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-muted-foreground">
                        {(p.author as Record<string, unknown>)?.name as string || "관리자"}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {new Date(p.created_at as string).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-secondary">
                    {categoryLabel[p.category as string] || (p.category as string)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
