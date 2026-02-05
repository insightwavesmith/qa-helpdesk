import { notFound } from "next/navigation";
import Link from "next/link";
import { getQuestionById } from "@/actions/questions";
import { getAnswersByQuestionId } from "@/actions/answers";
import { AnswerForm } from "./answer-form";
import { createClient } from "@/lib/supabase/server";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

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
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-indigo-500", "bg-pink-500"];
  if (!name) return "bg-gray-500";
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const svc = (await import("@/lib/supabase/server")).createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  const { data: question, error } = await getQuestionById(id);
  if (error || !question) {
    notFound();
  }

  const { data: answers } = await getAnswersByQuestionId(id, {
    includeUnapproved: isAdmin,
  });

  const approvedAnswers = answers.filter((a) => a.is_approved);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 브레드크럼 */}
      <nav className="mb-8 text-sm">
        <ol className="flex items-center space-x-2 text-text-secondary">
          <li><Link href="/dashboard" className="hover:text-primary">홈</Link></li>
          <li className="text-text-muted">›</li>
          <li><Link href="/questions" className="hover:text-primary">Q&A</Link></li>
          <li className="text-text-muted">›</li>
          <li className="text-text-main">{question.category?.name || "질문"}</li>
        </ol>
      </nav>

      {/* 질문 카드 */}
      <article className="bg-card-bg rounded-xl border border-border-color p-8 mb-8 fade-in">
        <div className="flex items-start space-x-4">
          <div className={`flex-shrink-0 w-12 h-12 ${getAvatarColor(question.author?.name)} rounded-full flex items-center justify-center`}>
            <span className="text-white font-medium">
              {question.author?.name?.charAt(0) || "?"}
            </span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-3 mb-3">
              <h1 className="text-2xl font-bold text-text-main">{question.title}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                question.status === "answered" 
                  ? "bg-success text-white" 
                  : "bg-warning text-white"
              }`}>
                {question.status === "answered" ? "답변완료" : "답변대기"}
              </span>
            </div>
            
            {question.category && (
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                  {question.category.name}
                </span>
              </div>
            )}
            
            <div className="prose max-w-none mb-6 text-text-main whitespace-pre-wrap">
              {question.content}
            </div>
            
            <div className="flex items-center justify-between text-sm text-text-secondary">
              <div className="flex items-center space-x-2">
                <span className="font-medium">{question.author?.name || "익명"}</span>
                {question.author?.shop_name && (
                  <>
                    <span>•</span>
                    <span>{question.author.shop_name}</span>
                  </>
                )}
              </div>
              <span>{timeAgo(question.created_at)}</span>
            </div>
          </div>
        </div>
      </article>

      {/* 답변 섹션 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-6 flex items-center text-text-main">
          <span className="mr-2">💬</span> 답변 ({approvedAnswers.length}개)
        </h2>
        
        {approvedAnswers.length === 0 ? (
          <div className="bg-card-bg rounded-xl border border-border-color p-8 text-center">
            <p className="text-text-secondary">아직 답변이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {approvedAnswers.map((answer) => (
              <article key={answer.id} className="bg-card-bg rounded-xl border border-border-color p-6 fade-in">
                <div className="flex items-start space-x-4">
                  <div className={`flex-shrink-0 w-10 h-10 ${answer.is_ai ? "bg-primary" : getAvatarColor(answer.author?.name)} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-medium">
                      {answer.is_ai ? "AI" : answer.author?.name?.charAt(0) || "?"}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className="font-medium text-text-main">
                        {answer.is_ai ? "AI 어시스턴트" : answer.author?.name || "익명"}
                      </span>
                      {answer.is_ai && (
                        <span className="px-2 py-1 bg-primary text-white text-xs font-medium rounded-full">
                          AI
                        </span>
                      )}
                      {!answer.is_ai && answer.author?.name?.toLowerCase().includes("admin") && (
                        <span className="px-2 py-1 bg-success text-white text-xs font-medium rounded-full">
                          관리자
                        </span>
                      )}
                    </div>
                    
                    <div className="prose max-w-none mb-4 text-text-main whitespace-pre-wrap">
                      {answer.content}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-text-secondary">
                      <span>{timeAgo(answer.created_at)}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 답변 작성 폼 (관리자만) */}
      {isAdmin && (
        <section className="bg-card-bg rounded-xl border border-border-color p-6">
          <h3 className="font-bold text-lg mb-4 text-text-main">답변 작성</h3>
          <AnswerForm questionId={id} />
        </section>
      )}
    </div>
  );
}
