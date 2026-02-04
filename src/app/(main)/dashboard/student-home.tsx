import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  ArrowRight,
  Megaphone,
  Plus,
  FileText,
  Eye,
  Search,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuestions, getCategories } from "@/actions/questions";
import { getPosts } from "@/actions/posts";
import { getCategoryStyle } from "@/lib/category-styles";
import { HomeSearchBar } from "@/components/shared/HomeSearchBar";

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
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let notices: typeof posts = [];
  let popularQuestions: QuestionItem[] = [];

  try {
    const [qResult, pResult, cats, nResult, popResult] = await Promise.all([
      getQuestions({ page: 1, pageSize: 5 }),
      getPosts({ page: 1, pageSize: 4, category: "info" }),
      getCategories(),
      getPosts({ page: 1, pageSize: 2, category: "notice" }),
      getQuestions({ page: 1, pageSize: 5 }),
    ]);
    questions = qResult.data;
    posts = pResult.data;
    categories = cats;
    notices = nResult.data;
    // 인기 질문: 조회수 기준 정렬 (서버에서 이미 최신순이므로 클라이언트에서 재정렬)
    popularQuestions = [...popResult.data].sort(
      (a, b) => (b.view_count || 0) - (a.view_count || 0)
    );
  } catch (e) {
    console.error("StudentHome data fetch error:", e);
  }

  const suggestedTags = ["ASC 설정", "CAPI 연동", "타겟 설정", "ROAS 최적화", "픽셀 설치"];

  return (
    <div className="space-y-8">
      {/* Hero Section — Personalized Greeting + Search */}
      <section className="text-center pt-4 pb-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          <span className="text-primary">{userName}</span>님, 무엇이 궁금하세요?
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          메타 광고 운영의 모든 궁금증을 해결해 보세요
        </p>

        {/* Large Search Bar — Intercom style */}
        <HomeSearchBar />

        {/* Suggested Tags — Figma style */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-xs text-muted-foreground">추천:</span>
          {suggestedTags.map((tag) => (
            <Link
              key={tag}
              href={`/questions?search=${encodeURIComponent(tag)}`}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-muted/80 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
            >
              {tag}
            </Link>
          ))}
        </div>
      </section>

      {/* Notice banner */}
      {notices.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Megaphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <Link
                href={`/posts/${notices[0].id}`}
                className="font-medium text-sm hover:underline line-clamp-1"
              >
                {notices[0].title}
              </Link>
              {notices.length > 1 && (
                <Link
                  href="/posts?category=notice"
                  className="text-xs text-muted-foreground hover:underline mt-1 block"
                >
                  외 {notices.length - 1}개 공지 더보기
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Card Grid — Figma color-block style */}
      {categories.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              카테고리
            </h2>
            <Link
              href="/questions"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              전체보기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Desktop: 2-col grid, Mobile: horizontal scroll */}
          <div className="hidden sm:grid sm:grid-cols-2 gap-3">
            {categories.map((cat) => {
              const style = getCategoryStyle(cat.slug);
              const Icon = style.icon;
              return (
                <Link
                  key={cat.id}
                  href={`/questions?category=${cat.slug}`}
                  className="group"
                >
                  <div
                    className={`rounded-xl border ${style.borderColor} ${style.lightBg} p-4 transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex items-center justify-center h-10 w-10 rounded-lg ${style.bgColor} text-white`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-semibold text-sm ${style.textColor} group-hover:opacity-80 transition-opacity`}
                        >
                          {cat.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          질문 보기 →
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Mobile: horizontal scroll */}
          <div className="flex sm:hidden gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
            {categories.map((cat) => {
              const style = getCategoryStyle(cat.slug);
              const Icon = style.icon;
              return (
                <Link
                  key={cat.id}
                  href={`/questions?category=${cat.slug}`}
                  className="snap-start shrink-0"
                >
                  <div
                    className={`rounded-xl border ${style.borderColor} ${style.lightBg} p-4 w-36 transition-all hover:shadow-md active:scale-[0.97]`}
                  >
                    <div
                      className={`flex items-center justify-center h-10 w-10 rounded-lg ${style.bgColor} text-white mb-3`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3
                      className={`font-semibold text-sm ${style.textColor}`}
                    >
                      {cat.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      보기 →
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Popular Questions (FAQ) */}
      {popularQuestions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              자주 묻는 질문
            </h2>
          </div>

          <div className="rounded-xl border divide-y">
            {popularQuestions.slice(0, 5).map((q, idx) => {
              const st = statusConfig[q.status] || statusConfig.open;
              return (
                <Link
                  key={q.id}
                  href={`/questions/${q.id}`}
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium line-clamp-1 leading-snug">
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

      {/* Info/Posts Section — compact */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            정보 공유
          </h2>
          <Link
            href="/posts"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground rounded-xl border border-dashed">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">아직 공유된 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {posts.map((p) => (
              <Link
                key={p.id}
                href={`/posts/${p.id}`}
                className="group"
              >
                <article className="rounded-xl border p-4 transition-all hover:shadow-md hover:border-primary/20 h-full">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[11px] rounded-full">
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
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Q&A Section — compact */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            최근 Q&A
          </h2>
          <Link
            href="/questions"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground rounded-xl border border-dashed">
            <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">아직 질문이 없습니다.</p>
            <p className="text-xs mt-1">첫 번째 질문을 올려보세요!</p>
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {questions.map((q) => {
              const st = statusConfig[q.status] || statusConfig.open;
              return (
                <Link
                  key={q.id}
                  href={`/questions/${q.id}`}
                  className="block group"
                >
                  <article className="p-4 transition-colors hover:bg-muted/30 first:rounded-t-xl last:rounded-b-xl">
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
                      <span>{(q.author as { name: string } | null)?.name || "익명"}</span>
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

      {/* 질문하기 floating button */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <Button asChild size="lg" className="rounded-full shadow-lg h-12 px-5 gap-2">
          <Link href="/questions/new">
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">질문하기</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
