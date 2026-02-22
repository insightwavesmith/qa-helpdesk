import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { searchChunks } from "@/lib/knowledge";

export const maxDuration = 60;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const { contentIds } = (await request.json()) as {
      contentIds: string[];
    };

    if (!contentIds || contentIds.length === 0 || contentIds.length > 4) {
      return NextResponse.json(
        { error: "콘텐츠를 1~4개 선택해주세요." },
        { status: 400 }
      );
    }

    // 선택된 콘텐츠 조회
    const { data: rawContents, error: fetchError } = await svc
      .from("contents")
      .select("id, title, body_md, source_type, source_ref")
      .in("id", contentIds);

    if (fetchError || !rawContents || rawContents.length === 0) {
      return NextResponse.json(
        { error: "콘텐츠를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents = rawContents as any[];

    // 프롬프트 구성 (T6: body_md 4,000자로 축소하여 RAG 컨텍스트 공간 확보)
    const isSingle = contents.length === 1;
    const contentBlocks = contents
      .map(
        (c: { title: string; source_ref: string | null; body_md: string | null }, i: number) =>
          `### 콘텐츠 ${i + 1}: ${c.title}\n출처: ${c.source_ref || "없음"}\n\n${(c.body_md || "").substring(0, 4000)}`
      )
      .join("\n\n---\n\n");

    // T6: RAG 검색 — lecture + blueprint chunks에서 관련 내용 검색
    let ragContext = "";
    try {
      const searchQuery = contents.map((c: { title: string }) => c.title).join(" ");
      const ragChunks = await Promise.race([
        searchChunks(searchQuery, 5, 0.4, ["lecture", "blueprint"]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RAG timeout")), 10000)),
      ]);

      if (ragChunks.length > 0) {
        ragContext = ragChunks
          .map((c) => `[${c.lecture_name} / ${c.source_type}] ${c.content.substring(0, 600)}`)
          .join("\n\n");
      }
    } catch (ragErr) {
      console.warn("RAG 검색 실패 (비교 없이 진행):", ragErr instanceof Error ? ragErr.message : ragErr);
    }

    const systemPrompt = `당신은 자사몰사관학교의 정보공유 글 작성 전문가입니다.
메타(Meta) 광고를 운영하는 자사몰 대표님들을 위한 실용적인 콘텐츠를 작성합니다.

## 작성 규칙
- ~해요 말투 사용 (예: "설정할 수 있어요", "확인해보세요")
- 한국어만 사용. 영어 단독 제목 금지.
- 전문 용어에는 괄호 설명 추가 (예: ROAS(광고비 대비 수익률))

## 구조
1. 훅 1줄: 질문 또는 핵심 인사이트로 시작
2. "## 핵심 포인트" 헤더 후 핵심 3개 (각 2~3줄)
3. 실무 적용 팁 1개
4. 원문 출처 표기
${ragContext ? `5. 강의/블루프린트 내용과 비교하여 충돌하거나 보완할 내용이 있으면 "## 강의 내용과 비교" 섹션을 추가하세요. 비교할 내용이 없으면 이 섹션을 생략하세요.` : ""}

## 출력 형식
첫 줄: # 한국어 제목
나머지: 마크다운 본문`;

    let userPrompt = isSingle
      ? `다음 콘텐츠를 자사몰 대표님을 위한 정보공유 글로 변환해주세요.\n\n${contentBlocks}`
      : `다음 ${contents.length}개 콘텐츠를 묶어 "이번 주 핵심 뉴스" 형태의 정보공유 글로 작성해주세요.\n각 콘텐츠의 핵심을 정리하고, 전체를 아우르는 인사이트를 제공해주세요.\n\n${contentBlocks}`;

    // RAG 컨텍스트 추가
    if (ragContext) {
      userPrompt += `\n\n---\n\n## 참고: 자사몰사관학교 강의/블루프린트 관련 내용\n아래는 기존 강의 자료에서 관련된 내용입니다. 위 콘텐츠와 충돌하거나 보완할 부분이 있으면 "## 강의 내용과 비교" 섹션에 정리해주세요.\n\n${ragContext}`;
    }

    // Anthropic API 호출
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", errorText);
      return NextResponse.json(
        { error: "정보공유 생성에 실패했습니다." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    if (!text.trim()) {
      return NextResponse.json(
        { error: "AI가 콘텐츠를 생성하지 못했습니다." },
        { status: 500 }
      );
    }

    // 첫 줄(# 제목)을 title로, 나머지를 body_md로 분리
    const lines = text.trim().split("\n");
    let title = isSingle
      ? contents[0].title
      : "이번 주 핵심 뉴스";
    let bodyMd = text.trim();

    const firstLine = lines[0].trim();
    if (firstLine.startsWith("# ")) {
      title = firstLine.slice(2).trim();
      bodyMd = lines.slice(1).join("\n").trim();
    }

    return NextResponse.json({
      title,
      body_md: bodyMd,
      sourceContents: contentIds,
    });
  } catch (error) {
    console.error("Curation generate error:", error);
    return NextResponse.json(
      { error: "정보공유 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
