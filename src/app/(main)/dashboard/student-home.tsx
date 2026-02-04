import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  ArrowRight,
  Megaphone,
  FileText,
  Eye,
  TrendingUp,
  Bell,
  ChevronRight,
} from "lucide-react";
import { getQuestions } from "@/actions/questions";
import { getPosts } from "@/actions/posts";
import { HomeSearchBar } from "@/components/shared/HomeSearchBar";
import { SalesSummary } from "@/components/dashboard/SalesSummary";
import { HeroGreeting } from "@/components/dashboard/HeroGreeting";
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

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  open: {
    label: "미답변",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
  answered: {
    label: "답변완료",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  closed: {
    label: "마감",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

type QuestionItem = Awaited<ReturnType<typeof getQuestions>>["data"][number] & {
  answers_count?: number;
};

interface StudentHomeProps {
  userName: string;
}

export async function StudentHome({ userName }: StudentHomeProps) {
  let questions: QuestionItem[] = [];
  let posts: Awaited<ReturnType<typeof getPosts>>["data"] = [];
  let notices: typeof posts = [];
  let popularQuestions: QuestionItem[] = [];

  try {
    const [qResult, pResult, nResult, popResult] = await Promise.all([
      getQuestions({ page: 1, pageSize: 5 }),
      getPosts({ page: 1, pageSize: 4, category: "info" }),
      getPosts({ page: 1, pageSize: 3, category: "notice" }),
      getQuestions({ page: 1, pageSize: 5 }),
    ]);
    questions = qResult.data;
    posts = pResult.data;
    notices = nResult.data;
    popularQuestions = [...popResult.data].sort(
      (a, b) => (b.view_count || 0) - (a.view_count || 0)
    );
  } catch (e) {
    console.error("StudentHome data fetch error:", e);
  }

  const suggestedTags = [
    "ASC 설정",
    "CAPI 연동",
    "타겟 설정",
    "ROAS 최적화",
    "픽셀 설치",
  ];

  return (
    <div className="relative space-y-8 pb-8">
      {/* Background decorative gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-primary/5 via-blue-400/5 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -left-48 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-purple-400/5 via-pink-300/5 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-gradient-to-tl from-emerald-400/5 via-teal-300/5 to-transparent blur-3xl" />
      </div>

      {/* ─── 1. Sales Summary Dashboard ─── */}
      <SalesSummary />

      {/* ─── 2. Hero Section — Personalized Greeting + Search ─── */}
      <section className="relative text-center pt-2 pb-2">
        {/* Subtle gradient background card */}
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-b from-primary/[0.03] via-transparent to-transparent" />

        <HeroGreeting userName={userName} />
        <p className="text-muted-foreground text-sm mb-6">
          메타 광고 운영의 모든 궁금증을 해결해 보세요
        </p>

        <HomeSearchBar />

        {/* Suggested Tags */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-xs text-muted-foreground">추천:</span>
          {suggestedTags.map((tag) => (
            <Link
              key={tag}
              href={`/questions?search=${encodeURIComponent(tag)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-muted/80 to-muted/60 text-muted-foreground hover:from-primary/10 hover:to-blue-500/10 hover:text-primary transition-all duration-300 border border-transparent hover:border-primary/20 hover:shadow-sm"
            >
              {tag}
            </Link>
          ))}
        </div>
      </section>

      {/* ─── 3. Notice Section — Enhanced ─── */}
      {notices.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/20">
                <Megaphone className="h-4 w-4 text-white" />
              </div>
              공지사항
            </h2>
            <Link
              href="/posts?category=notice"
              className="text-sm text-primary hover:underline flex items-center gap-1 group"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="space-y-3">
            {notices.slice(0, 3).map((notice, idx) => (
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
        </section>
      )}

      {/* ─── 4. Popular Questions (FAQ) ─── */}
      {popularQuestions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md shadow-orange-500/20">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              자주 묻는 질문
            </h2>
          </div>

          <div className="rounded-2xl border bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
            {popularQuestions.slice(0, 5).map((q, idx) => {
              const st = statusConfig[q.status] || statusConfig.open;
              return (
                <Link
                  key={q.id}
                  href={`/questions/${q.id}`}
                  className={`flex items-center gap-3 p-4 hover:bg-muted/40 transition-all duration-200 group ${
                    idx < popularQuestions.slice(0, 5).length - 1
                      ? "border-b border-border/50"
                      : ""
                  }`}
                >
                  <span className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 text-white text-xs font-bold shrink-0 shadow-sm">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium line-clamp-1 leading-snug group-hover:text-primary transition-colors">
                      {q.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {q.category && (
                        <span className="text-[11px] text-muted-foreground">
                          {(q.category as { name: string }).name}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0 rounded-full font-medium ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <MessageCircle className="h-3 w-3" />
                    {q.answers_count || 0}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── 5. Info/Posts Section ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md shadow-blue-500/20">
              <FileText className="h-4 w-4 text-white" />
            </div>
            정보 공유
          </h2>
          <Link
            href="/posts"
            className="text-sm text-primary hover:underline flex items-center gap-1 group"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground rounded-2xl border border-dashed bg-muted/20">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">아직 공유된 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {posts.map((p) => (
              <Link key={p.id} href={`/posts/${p.id}`} className="group">
                <article className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm p-5 transition-all duration-300 hover:shadow-lg hover:border-primary/20 hover:scale-[1.01] active:scale-[0.99] h-full">
                  {/* Subtle gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-cyan-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className="text-[11px] rounded-full bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800"
                      >
                        {p.category === "info"
                          ? "정보"
                          : p.category === "webinar"
                            ? "웨비나"
                            : p.category}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                      {p.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2.5 text-[11px] text-muted-foreground">
                      <span>
                        {(p.author as { name: string } | null)?.name || "관리자"}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(p.created_at)}</span>
                      <span className="flex items-center gap-0.5 ml-auto">
                        <Eye className="h-3 w-3" />
                        {p.view_count}
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── 6. Recent Q&A Section ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/20">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            최근 Q&A
          </h2>
          <Link
            href="/questions"
            className="text-sm text-primary hover:underline flex items-center gap-1 group"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground rounded-2xl border border-dashed bg-muted/20">
            <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">아직 질문이 없습니다.</p>
            <p className="text-xs mt-1">첫 번째 질문을 올려보세요!</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
            {questions.map((q, idx) => {
              const st = statusConfig[q.status] || statusConfig.open;
              return (
                <Link
                  key={q.id}
                  href={`/questions/${q.id}`}
                  className="block group"
                >
                  <article
                    className={`p-4 transition-all duration-200 hover:bg-muted/30 ${
                      idx < questions.length - 1
                        ? "border-b border-border/50"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {q.category && (
                        <span className="text-xs font-medium text-primary">
                          {(q.category as { name: string }).name}
                        </span>
                      )}
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-1">
                      {q.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>
                        {(q.author as { name: string } | null)?.name || "익명"}
                      </span>
                      <span>{timeAgo(q.created_at)}</span>
                      <span className="flex items-center gap-1 ml-auto">
                        <MessageCircle className="h-3 w-3" />
                        {q.answers_count || 0}
                      </span>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── 7. Floating CTA Button (Shimmer 효과) ─── */}
      <FloatingAskButton />
    </div>
  );
}
