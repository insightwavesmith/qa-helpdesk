/**
 * POST /api/creative/search
 * 텍스트 쿼리 → 임베딩 → search_similar_creatives RPC
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 인증 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, source, limit = 20 } = body as {
      query: string;
      source?: "own" | "competitor";
      limit?: number;
    };

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "검색어를 2자 이상 입력해주세요." },
        { status: 400 },
      );
    }

    // 쿼리 → 임베딩
    const queryEmbedding = await generateEmbedding(query, {
      taskType: "RETRIEVAL_QUERY",
    });

    // RPC 호출
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (svc as any).rpc("search_similar_creatives", {
      query_embedding: queryEmbedding,
      match_count: Math.min(limit, 50),
      filter_source: source || null,
      filter_category: null,
    });

    if (error) {
      console.error("[creative-search] RPC error:", error);
      return NextResponse.json(
        { error: "검색 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ results: data || [] });
  } catch (err) {
    console.error("[creative-search] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "검색 실패" },
      { status: 500 },
    );
  }
}
