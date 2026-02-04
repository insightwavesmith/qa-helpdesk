import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { getPosts } from "@/actions/posts";
import { getQuestions } from "@/actions/questions";

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
  let recentQuestions: Awaited<ReturnType<typeof getQuestions>>["data"] = [];

  try {
    const [nResult, qResult] = await Promise.all([
      getPosts({ page: 1, pageSize: 5, category: "notice" }),
      getQuestions({ page: 1, pageSize: 5 }),
    ]);
    notices = nResult.data;
    recentQuestions = qResult.data;
  } catch (e) {
    console.error("StudentHome data fetch error:", e);
  }

  return (
    <div className="space-y-10">
      {/* Page title — Notion style */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight text-foreground">
          {userName}님, 안녕하세요
        </h1>
        <div className="mt-3">
          <Link
            href="/questions/new"
            className="inline-flex items-center gap-1.5 text-[14px] text-primary hover:underline"
          >
            <Plus className="h-4 w-4" />
            새 질문 작성하기
          </Link>
        </div>
      </div>

      {/* 공지사항 — Notion-style list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wide">
            공지사항
          </h2>
          <Link
            href="/notices"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            전체보기
          </Link>
        </div>

        {notices.length === 0 ? (
          <p className="text-[14px] text-muted-foreground py-4">
            등록된 공지사항이 없습니다.
          </p>
        ) : (
          <div>
            {notices.map((notice) => (
              <Link
                key={notice.id}
                href={`/posts/${notice.id}`}
                className="group block"
              >
                <div className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-[6px] transition-colors duration-150 hover:bg-accent">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-foreground line-clamp-1 group-hover:text-primary transition-colors duration-150">
                      {notice.title}
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground shrink-0">
                    {timeAgo(notice.created_at)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 최근 Q&A — Notion-style list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wide">
            최근 질문
          </h2>
          <Link
            href="/questions"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            전체보기
          </Link>
        </div>

        {recentQuestions.length === 0 ? (
          <p className="text-[14px] text-muted-foreground py-4">
            등록된 질문이 없습니다.
          </p>
        ) : (
          <div>
            {recentQuestions.map((q) => (
              <Link
                key={q.id}
                href={`/questions/${q.id}`}
                className="group block"
              >
                <div className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-[6px] transition-colors duration-150 hover:bg-accent">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-foreground line-clamp-1 group-hover:text-primary transition-colors duration-150">
                      {q.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {q.category && (
                        <span className="text-[12px] text-muted-foreground">
                          {q.category.name}
                        </span>
                      )}
                      <span className="text-[12px] text-muted-foreground">
                        {q.author?.name || "익명"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-secondary">
                    {q.status === "answered" ? "답변완료" : q.status === "closed" ? "마감" : "대기"}
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
