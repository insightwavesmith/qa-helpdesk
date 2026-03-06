import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // 1. CRON_SECRET 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 30일 지난 삭제 콘텐츠 영구 삭제
  const supabase = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data, error } = await supabase
    .from("contents")
    .delete()
    .lt("deleted_at", thirtyDaysAgo)
    .select("id");

  // 3. 결과 반환
  return Response.json({
    deleted: data?.length || 0,
    error: error?.message || null,
  });
}
