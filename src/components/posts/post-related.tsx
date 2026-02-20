import { PostCard } from "./post-card";

interface PostData {
  id: string;
  title: string;
  content: string;
  body_md?: string;
  category: string;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string | null } | null;
}

interface PostRelatedProps {
  posts: PostData[];
}

export function PostRelated({ posts }: PostRelatedProps) {
  if (posts.length === 0) return null;

  return (
    <section>
      <h3 className="text-lg font-bold text-[#1a1a2e] mb-4">
        이런 글도 있어요
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
