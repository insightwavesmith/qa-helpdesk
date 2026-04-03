import { createServiceClient } from "@/lib/db";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

export async function GET(request: Request) {
  // 1. CRON_SECRET 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("cleanup-deleted");

  try {
    // 2. 30일 지난 삭제 콘텐츠 영구 삭제
    const db = createServiceClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data, error } = await db
      .from("contents")
      .delete()
      .lt("deleted_at", thirtyDaysAgo)
      .select("id");

    const deletedCount = data?.length || 0;

    if (error) {
      await completeCronRun(runId, "error", deletedCount, error.message);
    } else {
      await completeCronRun(runId, "success", deletedCount);
    }

    // 3. 결과 반환
    return Response.json({
      deleted: deletedCount,
      error: error?.message || null,
    });
  } catch (e) {
    await completeCronRun(runId, "error", 0, String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
