/**
 * 대시보드 통계 사전계산 — COUNT 6개 + 28일 질문 그룹화
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function precomputeDashboardStats(
  supabase: SupabaseClient
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    // ── 1. counts 집계 ──
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [questionsResult, weeklyResult, openResult, pendingAnswersResult, postsResult, membersResult] =
      await Promise.all([
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .gte("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("answers")
          .select("id", { count: "exact", head: true })
          .eq("is_approved", false),
        supabase
          .from("contents")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("role", ["member", "student"]),
      ]);

    const counts = {
      totalQuestions: questionsResult.count || 0,
      weeklyQuestions: weeklyResult.count || 0,
      openQuestions: openResult.count || 0,
      pendingAnswers: pendingAnswersResult.count || 0,
      totalPosts: postsResult.count || 0,
      activeMembers: membersResult.count || 0,
    };

    await supabase
      .from("dashboard_stats_cache" as never)
      .upsert(
        { stat_key: "counts", stat_value: counts, updated_at: new Date().toISOString() } as never,
        { onConflict: "stat_key" } as never
      );
    computed++;

    // ── 2. weekly_questions 집계 ──
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const { data } = await supabase
      .from("questions")
      .select("created_at")
      .gte("created_at", fourWeeksAgo.toISOString())
      .order("created_at", { ascending: true });

    const dailyCounts: Record<string, number> = {};
    for (let i = 0; i < 28; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (27 - i));
      const key = d.toISOString().split("T")[0];
      dailyCounts[key] = 0;
    }

    data?.forEach((q: { created_at: string | null }) => {
      const key = q.created_at?.split("T")[0] ?? "unknown";
      if (dailyCounts[key] !== undefined) {
        dailyCounts[key]++;
      }
    });

    const weeklyQuestions = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      label: `${parseInt(date.split("-")[1])}/${parseInt(date.split("-")[2])}`,
      질문수: count,
    }));

    await supabase
      .from("dashboard_stats_cache" as never)
      .upsert(
        { stat_key: "weekly_questions", stat_value: weeklyQuestions, updated_at: new Date().toISOString() } as never,
        { onConflict: "stat_key" } as never
      );
    computed++;
  } catch (err) {
    errors.push(`dashboard: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { computed, errors };
}
