import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/db";

const BASE_URL = "https://bscamp.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // 발행된 오가닉 포스트
  let postPages: MetadataRoute.Sitemap = [];
  try {
    // organic_posts는 database.ts 타입에 미등록 — any 우회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    const { data: posts } = await svc
      .from("organic_posts")
      .select("id, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (posts && posts.length > 0) {
      postPages = (posts as { id: string; updated_at: string; published_at: string }[]).map(
        (post) => ({
          url: `${BASE_URL}/posts/${post.id}`,
          lastModified: new Date(post.updated_at || post.published_at),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }),
      );
    }
  } catch {
    // DB 조회 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...postPages];
}
