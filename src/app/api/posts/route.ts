import { NextRequest, NextResponse } from "next/server";

// 모찌(시스템) API: 외부에서 게시글 생성용
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

    // TODO: 서비스 클라이언트로 게시글 생성
    // const supabase = createServiceClient();
    // const { data, error } = await supabase.from("posts").insert({
    //   title,
    //   content,
    //   category: category || "info",
    //   author_id: null, // 시스템 작성
    //   is_published: false,
    // });

    return NextResponse.json({ message: "게시글이 생성되었습니다." });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function GET() {
  // TODO: 공개된 게시글 목록 조회
  return NextResponse.json({ posts: [] });
}
