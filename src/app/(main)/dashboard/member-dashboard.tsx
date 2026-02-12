import Link from "next/link";
import { Search } from "lucide-react";
import { getPosts, getNotices } from "@/actions/posts";
import { getQuestions } from "@/actions/questions";
import { getExcerpt } from "@/components/posts/post-card";
import { LockedFeatureCard } from "@/components/ui/locked-feature-card";

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

function getAvatarColor(name?: string): string {
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500", "bg-yellow-500"];
  if (!name) return "bg-gray-500";
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export async function MemberDashboard() {
  let notices: Awaited<ReturnType<typeof getNotices>>["data"] = [];
  let recentQuestions: Awaited<ReturnType<typeof getQuestions>>["data"] = [];
  let latestPosts: Awaited<ReturnType<typeof getPosts>>["data"] = [];

  try {
    const [nResult, qResult, pResult] = await Promise.all([
      getNotices({ page: 1, pageSize: 3 }),
      getQuestions({ page: 1, pageSize: 6 }),
      getPosts({ page: 1, pageSize: 3, category: "education" }),
    ]);
    notices = nResult.data;
    recentQuestions = qResult.data;
    latestPosts = pResult.data;
  } catch (e) {
    console.error("MemberDashboard data fetch error:", e);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 검색바 */}
      <div className="mb-12">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-6 text-text-main">
            궁금한 것이 있으신가요?
          </h1>
          <Link href="/questions" className="block">
            <div className="relative search-focus rounded-xl">
              <input
                type="text"
                placeholder="질문 검색하기..."
                className="w-full px-6 py-4 text-lg border border-border-color rounded-xl focus:outline-none transition-shadow bg-card-bg text-text-main"
                readOnly
              />
              <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary w-6 h-6" />
            </div>
          </Link>
        </div>
      </div>

      {/* 공지사항 */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center text-text-main">
            공지사항
          </h2>
          <Link href="/notices" className="text-sm text-[#F75D5D] hover:text-[#E54949]">
            더보기
          </Link>
        </div>

        {notices.length === 0 ? (
          <div className="bg-card-bg rounded-xl border border-border-color p-6 card-hover">
            <p className="text-text-main font-semibold text-center">자사몰사관학교에 오신 것을 환영합니다!</p>
            <p className="text-text-secondary text-center mt-1 text-sm">새로운 공지사항이 등록되면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="bg-card-bg rounded-xl border border-border-color p-6 card-hover">
            {notices.slice(0, 1).map((notice) => (
              <Link key={notice.id} href={`/notices/${notice.id}`} className="block">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-2 text-text-main">{notice.title}</h3>
                    <p className="text-text-secondary line-clamp-2">{getExcerpt(notice.summary || notice.body_md || "", 120)}</p>
                    <p className="text-sm text-text-muted mt-2">
                      {timeAgo(notice.created_at)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 최근 Q&A (읽기만) */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center text-text-main">
            최근 Q&A
          </h2>
          <Link href="/questions" className="text-primary font-medium hover:underline">
            더보기
          </Link>
        </div>

        {recentQuestions.length === 0 ? (
          <div className="bg-card-bg rounded-xl border border-border-color p-8 text-center card-hover">
            <p className="text-text-secondary">등록된 질문이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentQuestions.slice(0, 6).map((question) => (
              <Link key={question.id} href={`/questions/${question.id}`}>
                <article className="bg-card-bg rounded-xl border border-border-color p-6 card-hover fade-in h-full">
                  <h3 className="font-bold text-lg mb-3 line-clamp-2 text-text-main">
                    {question.title}
                  </h3>
                  <p className="text-text-secondary text-sm mb-4 line-clamp-3">
                    {question.content}
                  </p>

                  {question.category && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                        {question.category.name}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div className={`w-6 h-6 ${getAvatarColor(question.author?.name)} rounded-full flex items-center justify-center`}>
                        <span className="text-white text-xs font-medium">
                          {question.author?.name?.charAt(0) || "?"}
                        </span>
                      </div>
                      <span className="text-text-secondary">{question.author?.name || "익명"}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        question.status === "answered"
                          ? "bg-success text-white"
                          : "bg-warning text-white"
                      }`}>
                        {question.status === "answered" ? "답변완료" : "답변대기"}
                      </span>
                      <span className="text-text-muted">{timeAgo(question.created_at)}</span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 정보공유 최신글 */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center text-text-main">
            정보공유 최신글
          </h2>
          <Link href="/posts" className="text-primary font-medium hover:underline">
            더보기
          </Link>
        </div>

        {latestPosts.length === 0 ? (
          <div className="bg-card-bg rounded-xl border border-border-color p-8 text-center card-hover">
            <p className="text-text-secondary">등록된 정보공유 글이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {latestPosts.map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`}>
                <article className="bg-card-bg rounded-xl border border-border-color p-6 card-hover fade-in h-full">
                  <h3 className="font-bold text-lg mb-3 line-clamp-2 text-text-main">
                    {post.title}
                  </h3>
                  <p className="text-text-secondary text-sm mb-4 line-clamp-3">
                    {getExcerpt(post.content, 120)}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{timeAgo(post.created_at)}</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 총가치각도기 잠금 CTA */}
      <section className="mt-12">
        <LockedFeatureCard
          title="총가치각도기"
          description="수강생 전용 기능입니다"
          ctaLabel="수강 안내 보기"
          ctaHref="/posts"
        />
      </section>
    </div>
  );
}
