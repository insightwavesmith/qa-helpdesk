import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { getReviews } from "@/actions/reviews";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ReviewListClient } from "./review-list-client";

const PAGE_SIZE = 12;

async function getUserRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return profile?.role || null;
  } catch {
    return null;
  }
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  const [{ data: reviews, count }, userRole] = await Promise.all([
    getReviews({ page, pageSize: PAGE_SIZE }),
    getUserRole(),
  ]);

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
  const isStudent = userRole === "student";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1a2e]">수강후기</h1>
          {isStudent && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-[#F75D5D] hover:bg-red-50 hover:text-[#F75D5D]"
            >
              <Link href="/reviews/new">
                <Plus className="mr-1 h-4 w-4" />
                후기 작성
              </Link>
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-[#666666]">
          자사몰사관학교 수강생들의 생생한 후기를 확인하세요
        </p>
      </div>

      <ReviewListClient
        reviews={(reviews ?? []).map((r) => ({
          ...r,
          image_urls: r.image_urls ?? [],
          view_count: r.view_count ?? 0,
          created_at: r.created_at ?? "",
        }))}
        currentPage={page}
        totalPages={totalPages}
        totalCount={count || 0}
      />
    </div>
  );
}
