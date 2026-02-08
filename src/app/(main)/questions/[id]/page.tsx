import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MessageSquare, Sparkles, User, Shield } from "lucide-react";
import { getQuestionById } from "@/actions/questions";
import { getAnswersByQuestionId } from "@/actions/answers";
import { AnswerForm } from "./answer-form";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ImageGallery } from "@/components/questions/ImageGallery";
import { SourceReferences } from "@/components/questions/SourceReferences";
import { Badge } from "@/components/ui/badge";
import { mdToHtml } from "@/lib/markdown";

const categoryColorMap: Record<string, string> = {
  "광고소재": "bg-blue-50 text-blue-700 border-blue-200",
  "타겟팅": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "예산": "bg-amber-50 text-amber-700 border-amber-200",
  "측정": "bg-violet-50 text-violet-700 border-violet-200",
  "기타": "bg-slate-50 text-slate-600 border-slate-200",
};

function getCategoryColor(name: string): string {
  return categoryColorMap[name] || "bg-slate-50 text-slate-600 border-slate-200";
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

function isOfficialAnswer(author?: { name: string } | null): boolean {
  const name = author?.name?.toLowerCase() || "";
  return name.includes("smith") || name.includes("관리자") || name.includes("admin");
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let isAdmin = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const svc = createServiceClient();
      const { data: profile } = await svc
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = profile?.role === "admin";
    }
  } catch (e) {
    void e;
  }

  let question: Awaited<ReturnType<typeof getQuestionById>>["data"];
  try {
    const result = await getQuestionById(id);
    if (result.error || !result.data) {
      notFound();
    }
    question = result.data;
  } catch (e) {
    void e;
    notFound();
  }

  let approvedAnswers: Awaited<ReturnType<typeof getAnswersByQuestionId>>["data"] = [];
  try {
    const { data: answers = [] } = await getAnswersByQuestionId(id, {
      includeUnapproved: isAdmin,
    });
    approvedAnswers = (answers ?? []).filter((a) => a.is_approved);
  } catch (e) {
    void e;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/questions" className="hover:text-foreground transition-colors">
              Q&A
            </Link>
          </li>
          <li><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="text-foreground font-medium truncate max-w-xs">
            {question.category?.name || "질문"}
          </li>
        </ol>
      </nav>

      {/* Question Card */}
      <article className="rounded-lg border bg-card p-6 mb-6">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          {question.category && (
            <Badge
              variant="outline"
              className={`text-xs font-medium ${getCategoryColor(question.category.name)}`}
            >
              {question.category.name}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-xs font-medium ${
              question.status === "answered"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {question.status === "answered" ? "답변완료" : "답변대기"}
          </Badge>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-foreground mb-4">
          {question.title}
        </h1>

        {/* Content */}
        <div className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap mb-5">
          {question.content}
        </div>

        {/* Images */}
        {Array.isArray(question.image_urls) && question.image_urls.length > 0 && (
          <div className="mb-5">
            <ImageGallery imageUrls={question.image_urls as string[]} />
          </div>
        )}

        {/* Author info */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {question.author?.name?.charAt(0) || "?"}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {question.author?.name || "익명"}
              </span>
              {question.author?.shop_name && (
                <span className="text-xs text-muted-foreground">{question.author.shop_name}</span>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{timeAgo(question.created_at)}</span>
        </div>
      </article>

      {/* Answers Section */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            답변 {approvedAnswers.length}개
          </h2>
        </div>

        {approvedAnswers.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground">아직 답변이 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {approvedAnswers.map((answer) => {
              const isAI = answer.is_ai;
              const isOfficial = !isAI && isOfficialAnswer(answer.author);

              return (
                <article
                  key={answer.id}
                  className={`rounded-lg border bg-card p-5 ${
                    isAI ? "border-l-4 border-l-primary" : ""
                  }`}
                >
                  {/* Author row */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className={`flex items-center justify-center h-8 w-8 rounded-full ${
                        isAI
                          ? "bg-primary/10"
                          : isOfficial
                            ? "bg-emerald-50"
                            : "bg-muted"
                      }`}
                    >
                      {isAI ? (
                        <Sparkles className="h-4 w-4 text-primary" />
                      ) : isOfficial ? (
                        <Shield className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">
                        {isAI ? "AI 어시스턴트" : answer.author?.name || "익명"}
                      </span>
                      {isAI && (
                        <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-primary/10 text-primary hover:bg-primary/10 border-primary/20">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI 답변
                        </Badge>
                      )}
                      {isOfficial && (
                        <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200">
                          공식 답변
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(answer.created_at)}
                    </span>
                  </div>

                  {/* Content */}
                  <div
                    className="text-[15px] leading-relaxed text-foreground/90 pl-[42px] [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5 [&_p]:my-1.5 [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px]"
                    dangerouslySetInnerHTML={{ __html: mdToHtml(answer.content) }}
                  />

                  {/* Source references for AI answers */}
                  {isAI && (
                    <div className="pl-[42px]">
                      <SourceReferences
                        rawSourceRefs={(answer as Record<string, unknown>).source_refs}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Answer Form (admin only) */}
      {isAdmin && (
        <section className="rounded-lg border bg-card p-5">
          <AnswerForm questionId={id} />
        </section>
      )}
    </div>
  );
}
