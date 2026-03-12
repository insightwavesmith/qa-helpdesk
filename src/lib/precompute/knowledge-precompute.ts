/**
 * 지식관리 일별 통계 사전계산 — knowledge_usage → 일별 집계
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const COST_PER_1K_INPUT = 0.015;
const COST_PER_1K_OUTPUT = 0.075;

export async function precomputeKnowledgeStats(
  supabase: SupabaseClient
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: usage, error } = await supabase
      .from("knowledge_usage")
      .select("consumer_type, total_tokens, duration_ms, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    // 일별 집계
    const dailyMap = new Map<
      string,
      { totalCost: number; durationSum: number; count: number; consumers: Record<string, number> }
    >();

    for (const row of usage || []) {
      const date = (row.created_at ?? "").split("T")[0];
      if (!date) continue;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { totalCost: 0, durationSum: 0, count: 0, consumers: {} });
      }
      const d = dailyMap.get(date)!;

      // 비용 계산 (70% input, 30% output 가정)
      const inputTokens = row.total_tokens * 0.7;
      const outputTokens = row.total_tokens * 0.3;
      d.totalCost += (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
      d.durationSum += row.duration_ms || 0;
      d.count++;
      d.consumers[row.consumer_type] = (d.consumers[row.consumer_type] || 0) + 1;
    }

    // UPSERT each day
    for (const [date, d] of dailyMap) {
      await supabase
        .from("knowledge_daily_stats" as never)
        .upsert(
          {
            stat_date: date,
            total_cost: Math.round(d.totalCost * 10000) / 10000,
            avg_duration_ms: d.count > 0 ? Math.round(d.durationSum / d.count) : 0,
            call_count: d.count,
            consumer_counts: d.consumers,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "stat_date" } as never
        );
      computed++;
    }
  } catch (err) {
    errors.push(`knowledge: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { computed, errors };
}
