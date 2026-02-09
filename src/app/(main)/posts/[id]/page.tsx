import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPostById, getPosts } from "@/actions/posts";
import { PostHero } from "@/components/posts/post-hero";
import { PostToc } from "@/components/posts/post-toc";
import { PostBody } from "@/components/posts/post-body";
import { PostRelated } from "@/components/posts/post-related";
import { NewsletterCta } from "@/components/posts/newsletter-cta";

const categoryConfig: Record<string, { label: string; bg: string; text: string }> = {
  education: { label: "교육", bg: "#FFF5F5", text: "#F75D5D" },
  notice: { label: "공지", bg: "#EFF6FF", text: "#3B82F6" },
  case_study: { label: "고객사례", bg: "#FFF7ED", text: "#F97316" },
  newsletter: { label: "뉴스레터", bg: "#F0FDF4", text: "#22C55E" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: post, error } = await getPostById(id);
  if (error || !post) {
    notFound();
  }

  // 관련 글: 같은 카테고리 글 3개
  const { data: relatedRaw } = await getPosts({
    page: 1,
    pageSize: 4,
    category: post.category,
  });
  const relatedPosts = relatedRaw
    .filter((p: { id: string }) => p.id !== post.id)
    .slice(0, 3);

  const catConfig = categoryConfig[post.category] || categoryConfig.education;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Back */}
      <Link
        href="/posts"
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#F75D5D] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        목록으로 돌아가기
      </Link>

      {/* Category Badge */}
      <div>
        <span
          className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
          style={{ backgroundColor: catConfig.bg, color: catConfig.text }}
        >
          {catConfig.label}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-[32px] font-bold text-[#1a1a2e] leading-tight">
        {post.title}
      </h1>

      {/* Meta */}
      <div className="flex items-center gap-2 text-sm text-[#999999]">
        <span>{formatDate(post.created_at)}</span>
        <span>·</span>
        <span>{catConfig.label}</span>
      </div>

      {/* Hero Banner */}
      <PostHero title={post.title} category={post.category} />

      {/* TOC */}
      <PostToc content={post.content} />

      {/* Body */}
      <PostBody content={post.content} />

      {/* Related Posts */}
      <PostRelated posts={relatedPosts} />

      {/* Newsletter CTA */}
      <NewsletterCta />
    </div>
  );
}
