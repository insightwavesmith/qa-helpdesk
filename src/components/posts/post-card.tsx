import Link from "next/link";

interface PostData {
  id: string;
  title: string;
  content: string;
  body_md?: string;
  category: string;
  thumbnail_url?: string | null;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string } | null;
}

interface PostCardProps {
  post: PostData;
  featured?: boolean;
}

export const categoryConfig: Record<string, { label: string; bg: string; text: string }> = {
  education: { label: "교육", bg: "#FFF5F5", text: "#F75D5D" },
  notice: { label: "공지", bg: "#EFF6FF", text: "#3B82F6" },
  case_study: { label: "고객사례", bg: "#FFF7ED", text: "#F97316" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function getExcerpt(content: string, maxLen = 100): string {
  const cleaned = content
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*\[.*?\]\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_~`>\-\[\]()!|]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
}

function CategoryBadge({ category }: { category: string }) {
  const config = categoryConfig[category] || categoryConfig.education;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  );
}

function Thumbnail({ title, category, thumbnailUrl }: { title: string; category: string; thumbnailUrl?: string | null }) {
  return (
    <img
      src={thumbnailUrl || `/api/og?title=${encodeURIComponent(title)}&category=${encodeURIComponent(category)}`}
      alt={title}
      className="w-full aspect-video object-cover"
      loading="lazy"
    />
  );
}

export function PostCard({ post, featured = false }: PostCardProps) {
  if (featured) {
    return (
      <Link href={`/posts/${post.id}`} className="block group">
        <article className="flex flex-col md:flex-row bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="md:w-3/5 shrink-0">
            <Thumbnail title={post.title} category={post.category} thumbnailUrl={post.thumbnail_url} />
          </div>
          <div className="flex flex-col justify-center p-5 md:p-6 md:w-2/5">
            <CategoryBadge category={post.category} />
            <h2 className="mt-3 text-2xl font-bold text-[#1a1a2e] group-hover:text-[#F75D5D] transition-colors line-clamp-2 leading-snug">
              {post.title}
            </h2>
            <p className="mt-2 text-sm text-gray-500 line-clamp-3 leading-relaxed">
              {getExcerpt(post.body_md || post.content, 150)}
            </p>
            <span className="mt-4 text-xs text-gray-400">
              {formatDate(post.created_at)} · 조회 {post.view_count}
            </span>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/posts/${post.id}`} className="block group">
      <article className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all h-full flex flex-col">
        <Thumbnail title={post.title} category={post.category} thumbnailUrl={post.thumbnail_url} />
        <div className="p-4 flex flex-col flex-1">
          <CategoryBadge category={post.category} />
          <h3 className="mt-2 text-base font-semibold text-[#1a1a2e] group-hover:text-[#F75D5D] transition-colors line-clamp-2 leading-snug">
            {post.title}
          </h3>
          <p className="mt-1.5 text-sm text-gray-500 line-clamp-2 leading-relaxed flex-1">
            {getExcerpt(post.body_md || post.content)}
          </p>
          <span className="mt-3 text-xs text-gray-400">
            {formatDate(post.created_at)} · 조회 {post.view_count}
          </span>
        </div>
      </article>
    </Link>
  );
}
