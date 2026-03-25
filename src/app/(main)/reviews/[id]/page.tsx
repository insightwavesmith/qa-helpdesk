import { notFound } from "next/navigation";
import { getReviewById } from "@/actions/reviews";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ReviewDetailClient } from "./ReviewDetailClient";

async function getUserInfo(): Promise<{ role: string | null; userId: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { role: null, userId: null };

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return { role: profile?.role || null, userId: user.id };
  } catch {
    return { role: null, userId: null };
  }
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [result, userInfo] = await Promise.all([
    getReviewById(id),
    getUserInfo(),
  ]);

  if (result.error || !result.data) {
    notFound();
  }

  const isAdmin = userInfo.role === "admin";
  const isOwner = !!(userInfo.userId && result.data.author_id === userInfo.userId);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <ReviewDetailClient review={{
        ...result.data,
        image_urls: result.data.image_urls ?? [],
        view_count: result.data.view_count ?? 0,
        created_at: result.data.created_at ?? "",
      }} isAdmin={isAdmin} isOwner={isOwner} />
    </div>
  );
}
