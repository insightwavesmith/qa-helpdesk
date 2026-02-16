import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300; // Vercel Pro

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GENERATION_MODEL = "gemini-2.0-flash";

export async function POST(request: NextRequest) {
  try {
    // 인증 + admin 권한 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const { content_id } = await request.json();
    if (!content_id) {
      return NextResponse.json(
        { error: "content_id는 필수입니다." },
        { status: 400 }
      );
    }

    // 콘텐츠 조회
    const { data: content, error: fetchError } = await svc
      .from("contents")
      .select("title, body_md")
      .eq("id", content_id)
      .single();

    if (fetchError || !content) {
      return NextResponse.json(
        { error: "콘텐츠를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Gemini Flash로 요약 생성
    const prompt = `다음 정보공유 본문을 뉴스레터 이메일 요약으로 변환해주세요.

규칙:
- 훅 질문 또는 흥미로운 통계 1줄로 시작
- "## 핵심 포인트" 헤더 후 핵심 포인트 3개를 불릿(-)으로 작성 (각 2-3줄)
- CTA 문구는 포함하지 않기 (이메일 템플릿에 별도 버튼 있음)
- 마크다운 형식
- ~해요 말투 사용
- 200자 내외로 간결하게
- 제목은 포함하지 않기

제목: ${content.title}

본문:
${content.body_md}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json(
        { error: "AI 요약 생성에 실패했습니다." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "요약 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
