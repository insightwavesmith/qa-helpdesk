import Link from "next/link";
import { Megaphone } from "lucide-react";
import { getNotices } from "@/actions/posts";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function getExcerpt(text: string, maxLen = 100): string {
  const cleaned = text
    .replace(/\*\*\[.*?\]\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_~`>\-\[\]()!|]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
}

export default async function NoticesPage() {
  const { data: notices } = await getNotices({ page: 1, pageSize: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">공지사항</h1>
        <p className="text-gray-500 text-sm mt-1">
          서비스 관련 공지사항을 확인하세요.
        </p>
      </div>

      {notices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200 border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
            <Megaphone className="h-6 w-6 text-gray-500" />
          </div>
          <p className="text-gray-500 text-sm">
            아직 공지사항이 없습니다.
          </p>
          <p className="text-xs text-gray-500 mt-1 opacity-70">
            새로운 소식이 있으면 이곳에 게시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <Link
              key={notice.id}
              href={`/notices/${notice.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:-translate-y-0.5 transition-all"
            >
              <h3 className="text-base font-semibold text-[#1a1a2e] line-clamp-1">
                {notice.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                {getExcerpt(notice.summary || notice.body_md || "", 150)}
              </p>
              <span className="text-xs text-gray-400 mt-2 block">
                {formatDate(notice.published_at || notice.created_at)}
                {(notice.view_count ?? 0) > 0 && ` · 조회 ${notice.view_count}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
