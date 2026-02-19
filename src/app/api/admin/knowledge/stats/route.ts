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

  // source_type별 chunk 수
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chunkStats } = await (svc as any)
    .from("knowledge_chunks")
    .select("source_type")
    .then(() => null); // RPC로 대체

  // knowledge_chunks 통계를 RPC 대신 raw count로
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: totalChunks } = await (svc as any)
    .from("knowledge_chunks")
    .select("*", { count: "exact", head: true });

  // source_type별 그룹핑은 클라이언트에서 하기 어려우므로 직접 쿼리
  // Supabase JS SDK에는 GROUP BY가 없으므로 전체 source_type을 가져와서 집계
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allSourceTypes } = await (svc as any)
    .from("knowledge_chunks")
    .select("source_type");

  const sourceMap: Record<string, number> = {};
  if (allSourceTypes) {
    for (const row of allSourceTypes) {
      const st = row.source_type || "unknown";
      sourceMap[st] = (sourceMap[st] || 0) + 1;
    }
  }

  const chunkStatsResult = Object.entries(sourceMap)
    .map(([source_type, cnt]) => ({ source_type, cnt }))
    .sort((a, b) => b.cnt - a.cnt);

  return NextResponse.json({
    usage: usage || [],
    chunkStats: chunkStatsResult,
    totalChunks: totalChunks || 0,
  });
}
