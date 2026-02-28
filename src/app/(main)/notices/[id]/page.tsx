import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getNoticeById } from "@/actions/posts";
import { mdToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/sanitize";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: notice, error } = await getNoticeById(id);
  if (error || !notice) {
    notFound();
  }

  const bodyHtml = sanitizeHtml(mdToHtml(notice.body_md || ""));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 돌아가기 */}
      <Link
        href="/notices"
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#F75D5D] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        공지사항 목록
      </Link>

      {/* 카테고리 배지 */}
      <div>
        <span
          className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
          style={{ backgroundColor: "#EFF6FF", color: "#3B82F6" }}
        >
          공지
        </span>
      </div>

      {/* 제목 */}
      <h1 className="text-2xl sm:text-[28px] font-bold text-[#1a1a2e] leading-tight">
        {notice.title}
      </h1>

      {/* 메타 */}
      <div className="flex items-center gap-2 text-sm text-[#999999]">
        <span>{formatDate(notice.published_at || notice.created_at)}</span>
        <span>·</span>
        <span>조회 {notice.view_count || 0}</span>
      </div>

      {/* 본문 */}
      <div
        className="prose prose-sm max-w-none text-[#333333] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  );
}
