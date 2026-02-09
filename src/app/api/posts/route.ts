import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// 모찌(시스템) API: 외부에서 콘텐츠 생성용
// CRON_SECRET을 API 키로 사용

function verifyApiKey(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content, category } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "title과 content는 필수입니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("contents")
      .insert({
        title,
        body_md: content,
        category: category || "education",
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("API POST /api/posts error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("contents")
    .select("id, title, category, status, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("API GET /api/posts error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data || [] });
}
