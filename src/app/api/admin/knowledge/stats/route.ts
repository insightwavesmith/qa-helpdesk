import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  // 인증 체크
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const svc = createServiceClient();

  // 최근 30일 usage 데이터
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: usage } = await svc
    .from("knowledge_usage")
    .select("consumer_type, total_tokens, duration_ms, created_at, model")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  // knowledge_chunks 통계 — SQL RPC로 group by (Supabase SDK에 GROUP BY 없음)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chunkStatsResult } = await (svc as any).rpc("get_chunk_stats");
  
  const totalChunks = (chunkStatsResult || []).reduce(
    (sum: number, r: { source_type: string; cnt: number }) => sum + r.cnt,
    0
  );

  // Phase 2: 일별 사전계산 통계 추가 (캐시 있으면 포함)
  let dailyStatsCache: unknown[] | null = null;
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (svc as any)
      .from("knowledge_daily_stats")
      .select("stat_date, total_cost, avg_duration_ms, call_count, consumer_counts, updated_at")
      .gte("stat_date", fourteenDaysAgo.toISOString().split("T")[0])
      .order("stat_date", { ascending: true });

    if (cached && cached.length > 0) {
      dailyStatsCache = cached;
    }
  } catch {
    // 캐시 테이블 없으면 무시
  }

  return NextResponse.json({
    usage: usage || [],
    chunkStats: chunkStatsResult,
    totalChunks: totalChunks || 0,
    dailyStatsCache,
  });
}
