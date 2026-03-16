import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MessageSquare, Sparkles, User, Shield, Pencil } from "lucide-react";
import { getQuestionById, getFollowUpQuestions } from "@/actions/questions";
import { getAnswersByQuestionId } from "@/actions/answers";
import { AnswerForm } from "./answer-form";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ImageGallery } from "@/components/questions/ImageGallery";
import { SourceReferences } from "@/components/questions/SourceReferences";
import { Badge } from "@/components/ui/badge";
import { DeleteQuestionButton } from "@/components/questions/DeleteQuestionButton";
import { AnswerEditButton } from "./answer-edit-button";
import { FollowUpForm } from "./follow-up-form";
import { PageViewTracker } from "@/components/tracking/page-view-tracker";
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

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
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
  let currentUserId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      currentUserId = user.id;
      const svc = createServiceClient();
      const { data: profile } = await svc
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = profile?.role === "admin" || profile?.role === "assistant";
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

  // 꼬리질문 조회 — parent_question_id 컬럼 없으면 빈 배열 (기존 기능 영향 없음)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followUps: { question: any; answers: typeof approvedAnswers }[] = [];
  try {
    const { data: followUpQuestions = [] } = await getFollowUpQuestions(id);
    for (const fq of followUpQuestions) {
      const { data: fqAnswers = [] } = await getAnswersByQuestionId(fq.id, {
        includeUnapproved: isAdmin,
      });
      followUps.push({
        question: fq,
        answers: (fqAnswers ?? []).filter((a) => a.is_approved),
      });
    }
  } catch (e) {
    void e;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageViewTracker
        event="question_detail_viewed"
        props={{
          question_id: id,
          category: question.category?.name,
          status: question.status,
          has_answers: approvedAnswers.length > 0,
        }}
      />
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

        {/* Title + Admin Actions */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-foreground">
            {question.title}
          </h1>
          {(isAdmin || (currentUserId && question.author?.id === currentUserId)) && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/questions/${id}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                수정
              </Link>
              <DeleteQuestionButton questionId={id} />
            </div>
          )}
        </div>

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
                        {isAI ? "Smith" : answer.author?.name || "익명"}
                      </span>
                      {/* AI 뱃지 제거됨 — 고객에게 AI 답변 노출 안 함 */}
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

                  {/* 답변 이미지 */}
                  {Array.isArray((answer as Record<string, unknown>).image_urls) &&
                    ((answer as Record<string, unknown>).image_urls as string[]).length > 0 && (
                      <div className="pl-[42px] mt-2">
                        <ImageGallery
                          imageUrls={(answer as Record<string, unknown>).image_urls as string[]}
                        />
                      </div>
                    )}

                  {/* Source references for AI answers — 관리자만 표시 */}
                  {isAI && isAdmin && (
                    <div className="pl-[42px]">
                      <SourceReferences
                        rawSourceRefs={(answer as Record<string, unknown>).source_refs}
                      />
                    </div>
                  )}

                  {/* 수정 버튼 — 본인 답변 또는 관리자 */}
                  {(isAdmin || (currentUserId && answer.author?.id === currentUserId)) && (
                    <div className="flex justify-end mt-3 pr-2">
                      <AnswerEditButton
                        answerId={answer.id}
                        initialContent={answer.content}
                        initialImageUrls={(answer as Record<string, unknown>).image_urls as string[] | undefined}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Follow-up Thread */}
      {followUps.length > 0 && (
        <section className="mb-6">
          <div className="border-l-2 border-muted pl-4 space-y-4">
            {followUps.map((fu) => (
              <div key={fu.question.id}>
                {/* 꼬리질문 */}
                <article className="rounded-lg border bg-amber-50/50 border-amber-200 p-4 mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-xs font-medium text-amber-700">
                      {fu.question.author?.name?.charAt(0) || "?"}
                    </span>
                    <span className="text-sm font-medium">{fu.question.author?.name || "익명"}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(fu.question.created_at)}</span>
                  </div>
                  <div className="text-[15px] leading-relaxed text-foreground/90 pl-9 whitespace-pre-wrap">
                    {fu.question.content}
                  </div>
                </article>

                {/* 꼬리질문의 답변 */}
                {fu.answers.map((answer) => {
                  const isAI = answer.is_ai;
                  const isOfficial = !isAI && isOfficialAnswer(answer.author);
                  return (
                    <article
                      key={answer.id}
                      className={`rounded-lg border bg-card p-4 mb-2 ml-4 ${
                        isAI ? "border-l-4 border-l-primary" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`flex items-center justify-center h-7 w-7 rounded-full ${
                          isAI ? "bg-primary/10" : isOfficial ? "bg-emerald-50" : "bg-muted"
                        }`}>
                          {isAI ? (
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                          ) : isOfficial ? (
                            <Shield className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-sm font-semibold">
                          {isAI ? "Smith" : answer.author?.name || "익명"}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(answer.created_at)}</span>
                      </div>
                      <div
                        className="text-[15px] leading-relaxed text-foreground/90 pl-9 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px]"
                        dangerouslySetInnerHTML={{ __html: mdToHtml(answer.content) }}
                      />
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Follow-up Form (수강생/관리자 모두 사용 가능) */}
      {currentUserId && approvedAnswers.length > 0 && (
        <section className="mb-6">
          <FollowUpForm
            parentQuestionId={id}
            parentTitle={question.title}
            categoryId={question.category?.id ?? null}
          />
        </section>
      )}

      {/* Answer Form (admin only) */}
      {isAdmin && (
        <section className="rounded-lg border bg-card p-5">
          <AnswerForm questionId={id} />
        </section>
      )}
    </div>
  );
}
