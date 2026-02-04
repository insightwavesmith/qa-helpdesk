import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone,
  Bell,
  ChevronRight,
} from "lucide-react";
import { getPosts } from "@/actions/posts";
import { SalesSummary } from "@/components/dashboard/SalesSummary";
import { FloatingAskButton } from "@/components/dashboard/FloatingAskButton";

function timeAgo(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString("ko-KR");
}

interface StudentHomeProps {
  userName: string;
}

export async function StudentHome({ userName }: StudentHomeProps) {
  let notices: Awaited<ReturnType<typeof getPosts>>["data"] = [];

  try {
    const nResult = await getPosts({ page: 1, pageSize: 5, category: "notice" });
    notices = nResult.data;
  } catch (e) {
    console.error("StudentHome data fetch error:", e);
  }

  return (
    <div className="relative space-y-8 pb-8">
      {/* Background decorative gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-primary/5 via-blue-400/5 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -left-48 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-purple-400/5 via-pink-300/5 to-transparent blur-3xl" />
      </div>

      {/* ─── 1. Sales Summary Dashboard (우리의 성과) ─── */}
      <SalesSummary />

      {/* ─── 2. 공지사항 ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/20">
              <Megaphone className="h-4 w-4 text-white" />
            </div>
            공지사항
          </h2>
        </div>

        {notices.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground rounded-2xl border border-dashed bg-muted/20">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">등록된 공지사항이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notices.map((notice, idx) => (
              <Link
                key={notice.id}
                href={`/posts/${notice.id}`}
                className="group block"
              >
                <div
                  className={`relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] ${
                    idx === 0
                      ? "bg-gradient-to-r from-amber-50 via-orange-50/50 to-yellow-50/30 border-amber-200/60 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-transparent dark:border-amber-800/40"
                      : "bg-card border-border hover:border-amber-200/40 dark:hover:border-amber-800/30"
                  }`}
                >
                  {/* Accent stripe */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-orange-500 rounded-l-xl" />

                  <div className="flex items-center gap-4 p-4 pl-5">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${
                        idx === 0
                          ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/20"
                          : "bg-amber-100 dark:bg-amber-950"
                      }`}
                    >
                      <Bell
                        className={`h-5 w-5 ${
                          idx === 0 ? "text-white" : "text-amber-600 dark:text-amber-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {idx === 0 && (
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[10px] px-1.5 py-0 shadow-sm">
                            NEW
                          </Badge>
                        )}
                        <h3
                          className={`font-semibold line-clamp-1 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors ${
                            idx === 0 ? "text-base" : "text-sm"
                          }`}
                        >
                          {notice.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(notice.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── Floating CTA Button ─── */}
      <FloatingAskButton />
    </div>
  );
}
