import { getPendingAnswers } from "@/actions/answers";
import { AnswersReviewClient } from "./answers-review-client";

export default async function AdminAnswersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  const { data: answers, count } = await getPendingAnswers({
    page,
    pageSize: 20,
  });

  const totalPages = Math.ceil((count || 0) / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">답변 검토</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI 생성 답변을 검토하고 승인하세요.
        </p>
      </div>

      <AnswersReviewClient
        answers={answers}
        currentPage={page}
        totalPages={totalPages}
        totalCount={count || 0}
      />
    </div>
  );
}
