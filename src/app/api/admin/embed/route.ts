import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { embedContentToChunks, embedAllPending } from "@/actions/embed-pipeline";

export const maxDuration = 300; // 5분 — 대량 임베딩용

// POST /api/admin/embed — 개별 또는 전체 임베딩
export async function POST(req: NextRequest) {
  // 관리자 인증 체크
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const body = await req.json();
  const { contentId, all } = body as { contentId?: string; all?: boolean };

  try {
    if (all) {
      const result = await embedAllPending();
      return NextResponse.json(result);
    }

    if (contentId) {
      const result = await embedContentToChunks(contentId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "contentId 또는 all 필요" }, { status: 400 });
  } catch (err) {
    console.error("[embed API]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "임베딩 실패" },
      { status: 500 }
    );
  }
}
