import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  ArrowRight,
  Megaphone,
  Plus,
  FileText,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuestions, getCategories } from "@/actions/questions";
import { getPosts } from "@/actions/posts";

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

export async function StudentHome() {
  let questions: QuestionItem[] = [];
  let posts: Awaited<ReturnType<typeof getPosts>>["data"] = [];
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let notices: typeof posts = [];

  try {
    const [qResult, pResult, cats, nResult] = await Promise.all([
      getQuestions({ page: 1, pageSize: 5 }),
      getPosts({ page: 1, pageSize: 4, category: "info" }),
      getCategories(),
      getPosts({ page: 1, pageSize: 2, category: "notice" }),
    ]);
    questions = qResult.data;
    posts = pResult.data;
    categories = cats;
    notices = nResult.data;
  } catch (e) {
    console.error("StudentHome data fetch error:", e);
  }

  return (
    <div className="space-y-8">
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

      {/* Category quick links */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/questions">
            <Badge
              variant="secondary"
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors rounded-full"
            >
              전체
            </Badge>
          </Link>
          {categories.map((cat) => (
            <Link key={cat.id} href={`/questions?category=${cat.slug}`}>
              <Badge
                variant="outline"
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors rounded-full"
              >
                {cat.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Info/Posts Section — 정보 공유를 최상단에 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">정보 공유</h2>
          <Link
            href="/posts"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground rounded-xl border border-dashed">
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
                <article className="rounded-xl border p-4 transition-all hover:shadow-md hover:border-primary/20">
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
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                    {p.content}
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
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

      {/* Recent Q&A Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">최근 Q&A</h2>
          <Link
            href="/questions"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            전체보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground rounded-xl border border-dashed">
            <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">아직 질문이 없습니다.</p>
            <p className="text-xs mt-1">첫 번째 질문을 올려보세요!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {questions.map((q) => {
              const st = statusConfig[q.status] || statusConfig.open;
              return (
                <Link
                  key={q.id}
                  href={`/questions/${q.id}`}
                  className="block group"
                >
                  <article className="py-4 border-b last:border-b-0 transition-colors group-hover:bg-muted/30 -mx-2 px-2 rounded-lg">
                    <div className="flex items-center gap-2 mb-1.5">
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
                    <h3 className="font-semibold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {q.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {q.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-xs text-muted-foreground">
                      <span>{(q.author as { name: string } | null)?.name || "익명"}</span>
                      <span>{timeAgo(q.created_at)}</span>
                      <span className="flex items-center gap-1">
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
