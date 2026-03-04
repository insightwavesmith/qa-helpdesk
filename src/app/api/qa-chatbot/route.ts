import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `당신은 QA 리포트 정리 도우미입니다.
사용자가 보내는 버그/이슈 내용을 구조화된 QA 항목으로 정리하세요.

응답은 반드시 JSON 형식으로만 반환하세요. 다른 텍스트는 포함하지 마세요.

JSON 형식:
{
  "title": "간결한 이슈 제목 (20자 이내)",
  "description": "이슈 설명. 재현 조건, 기대 동작, 실제 동작 포함",
  "severity": "critical|high|medium|low"
}

심각도 기준:
- critical: 서비스 이용 불가, 데이터 손실
- high: 주요 기능 오동작, 보안 이슈
- medium: UI 깨짐, 사소한 기능 이슈
- low: 오타, 미세한 스타일 이슈`;

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    // 관리자 역할 확인
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "assistant"].includes(profile.role)) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const body = await request.json();
    const { message, imageUrls, pageUrl } = body as {
      message: string;
      imageUrls?: string[];
      pageUrl?: string;
    };

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "메시지를 입력해주세요." },
        { status: 400 }
      );
    }

    // Sonnet API 호출
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY 미설정");
      return NextResponse.json(
        { error: "AI 서비스 설정 오류" },
        { status: 500 }
      );
    }

    let userPrompt = message;
    if (imageUrls && imageUrls.length > 0) {
      userPrompt += `\n\n첨부 스크린샷: ${imageUrls.length}장`;
    }
    if (pageUrl) {
      userPrompt += `\n발견 페이지: ${pageUrl}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API 에러:", response.status, errorText);
      return NextResponse.json(
        { error: "AI 분석에 실패했습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    );
    const text = textBlock?.text || "";

    // JSON 파싱
    try {
      // JSON 블록 추출 (마크다운 코드블록 포함 대응)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("JSON not found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const result = {
        title: String(parsed.title || "").slice(0, 100),
        description: String(parsed.description || ""),
        severity: ["critical", "high", "medium", "low"].includes(
          parsed.severity
        )
          ? parsed.severity
          : "medium",
      };

      return NextResponse.json(result);
    } catch (parseError) {
      console.error("AI 응답 파싱 실패:", parseError, text);
      return NextResponse.json(
        { error: "AI 응답을 처리할 수 없습니다. 직접 제출하시겠습니까?" },
        { status: 422 }
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "AI 응답 시간이 초과되었습니다. 다시 시도해주세요." },
        { status: 408 }
      );
    }
    console.error("QA 챗봇 에러:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
