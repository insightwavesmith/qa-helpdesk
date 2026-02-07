import Link from "next/link";

interface PostData {
  id: string;
  title: string;
  content: string;
  category: string;
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

const categoryConfig: Record<string, { label: string; bg: string; text: string; gradient: string }> = {
  info: { label: "교육", bg: "#FFF5F5", text: "#F75D5D", gradient: "from-[#F75D5D] to-[#E54949]" },
  notice: { label: "소식", bg: "#EFF6FF", text: "#3B82F6", gradient: "from-[#3B82F6] to-[#2563EB]" },
  webinar: { label: "웨비나", bg: "#FFF7ED", text: "#F97316", gradient: "from-[#F97316] to-[#EA580C]" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function getExcerpt(content: string, maxLen = 100): string {
  const plain = content.replace(/[#*_~`>\-\[\]()!|]/g, "").replace(/\n+/g, " ").trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + "..." : plain;
}

function CategoryBadge({ category }: { category: string }) {
  const config = categoryConfig[category] || categoryConfig.info;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  );
}

function Thumbnail({ title, category }: { title: string; category: string }) {
  return (
    <img
      src={`/api/og?title=${encodeURIComponent(title)}&category=${encodeURIComponent(category)}`}
      alt={title}
      className="w-full aspect-video rounded-lg object-cover"
      loading="lazy"
    />
  );
}

export function PostCard({ post, featured = false }: PostCardProps) {
  if (featured) {
    return (
      <Link href={`/posts/${post.id}`} className="block group">
        <article className="flex flex-col md:flex-row gap-6 bg-white rounded-lg overflow-hidden border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:shadow-md transition-shadow">
          <div className="md:w-1/2 shrink-0">
            <Thumbnail title={post.title} category={post.category} />
          </div>
          <div className="flex flex-col justify-center p-4 md:p-0 md:pr-6 md:py-6">
            <CategoryBadge category={post.category} />
            <h2 className="mt-3 text-xl font-bold text-[#1a1a2e] group-hover:text-[#F75D5D] transition-colors line-clamp-2 leading-snug">
              {post.title}
            </h2>
            <p className="mt-2 text-sm text-[#666666] line-clamp-3 leading-relaxed">
              {getExcerpt(post.content, 150)}
            </p>
            <span className="mt-4 text-xs text-[#999999]">
              {formatDate(post.created_at)}
            </span>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/posts/${post.id}`} className="block group">
      <article className="bg-white rounded-lg overflow-hidden border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:shadow-md transition-shadow h-full flex flex-col">
        <Thumbnail title={post.title} category={post.category} />
        <div className="p-4 flex flex-col flex-1">
          <CategoryBadge category={post.category} />
          <h3 className="mt-2 text-lg font-bold text-[#1a1a2e] group-hover:text-[#F75D5D] transition-colors line-clamp-2 leading-snug">
            {post.title}
          </h3>
          <p className="mt-1.5 text-sm text-[#666666] line-clamp-2 leading-relaxed flex-1">
            {getExcerpt(post.content)}
          </p>
          <span className="mt-3 text-xs text-[#999999]">
            {formatDate(post.created_at)}
          </span>
        </div>
      </article>
    </Link>
  );
}
