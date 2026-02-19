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

  return NextResponse.json({
    usage: usage || [],
    chunkStats: chunkStatsResult,
    totalChunks: totalChunks || 0,
  });
}
