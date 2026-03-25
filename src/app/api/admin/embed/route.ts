import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { embedContentToChunks, embedAllPending } from "@/actions/embed-pipeline";

// POST /api/admin/embed — 개별 또는 전체 임베딩
export async function POST(req: NextRequest) {
  // 관리자 인증: 브라우저 쿠키 또는 서비스 키
  const serviceKey = req.headers.get("x-service-key");
  if (serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // 서비스 키로 인증 — CLI/스크립트용
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
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
