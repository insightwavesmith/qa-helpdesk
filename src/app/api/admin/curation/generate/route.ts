import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { searchChunks } from "@/lib/knowledge";

export const maxDuration = 300;

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

    if (profile?.role !== "admin" && profile?.role !== "assistant") {
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

    // 선택된 콘텐츠 조회 (key_topics, ai_summary 추가)
    const { data: rawContents, error: fetchError } = await svc
      .from("contents")
      .select("id, title, body_md, source_type, source_ref, key_topics, ai_summary")
      .in("id", contentIds);

    if (fetchError || !rawContents || rawContents.length === 0) {
      return NextResponse.json(
        { error: "콘텐츠를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents = rawContents as any[];

    // 콘텐츠 수 기반 동적 truncation (1~2개: 4000자, 3~4개: 3000자)
    const truncLen = contents.length <= 2 ? 4000 : 3000;
    const isSingle = contents.length === 1;
    const contentBlocks = contents
      .map(
        (c: { title: string; body_md: string | null }, i: number) =>
          `### 콘텐츠 ${i + 1}: ${c.title}\n\n${(c.body_md || "").substring(0, truncLen)}`
      )
      .join("\n\n---\n\n");

    // RAG 검색 — lecture + blueprint + marketing_theory chunks
    let ragContext = "";
    try {
      const searchQuery = contents
        .map((c: { title: string; key_topics: string[] | null; ai_summary: string | null }) =>
          [c.title, c.key_topics?.join(", ") || "", c.ai_summary?.slice(0, 200) || ""].filter(Boolean).join(" ")
        )
        .join(" ");
      const ragChunks = await Promise.race([
        searchChunks(searchQuery, 8, 0.4, ["lecture", "blueprint", "marketing_theory"]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("RAG timeout")), 10000)),
      ]);

      if (ragChunks.length > 0) {
        ragContext = ragChunks
          .map((c) => `[${c.source_type}: ${c.lecture_name}]\n${c.content.substring(0, 1000)}`)
          .join("\n\n");
      } else {
        console.warn("RAG 검색 결과 0건:", searchQuery.substring(0, 100));
      }
    } catch (ragErr) {
      console.warn("RAG 검색 실패 (비교 없이 진행):", ragErr instanceof Error ? ragErr.message : ragErr);
    }

    const systemPrompt = `당신은 자사몰사관학교의 콘텐츠 에디터입니다.
외부 트렌드 정보를 기반으로, 자사몰사관학교 강의 관점에서 재해석한 오리지널 콘텐츠를 작성합니다.
독자: 메타(Meta) 광고를 운영하는 자사몰 대표님 (초급~중급)

## 핵심 원칙
- 이 글은 "우리 콘텐츠"다. 외부 글 요약이 아니라 강의 지식 기반의 오리지널 글.
- 강의 내용과 외부 원문이 충돌하면 → 강의 기준으로 수정
- 어려운 용어/표현 → 강의에서 쓰는 쉬운 표현으로 대체
- 사례 → 수강생/자사몰 사례 활용 (강의 컨텍스트에 있으면 적극 활용)
- 강의에서 더 깊게 다루는 부분 → 내용 보충
- 출처/참고 표기 불필요

## 글 구조 (리캐치 패턴)
1. **훅** (1줄): 질문 또는 임팩트 있는 선언
2. **도입부** (2~3문장): 왜 읽어야 하는지, 독자 고민에 공감
3. **목차** (넘버링): 다룰 주제 미리보기

---

4. **본론** (넘버링된 h2 소제목, 2~4개 섹션):
   각 섹션마다:
   - 핵심 숫자 블록 (불릿 + 볼드 숫자) — 숫자 먼저, 설명 나중
   - 본문 — 숫자를 스토리로 풀기. 업계 평균/벤치마크와 비교해서 의미 부여
   - 인용구 (관련 인물이나 수강생 목소리, 있으면)
   - 비유/일상 표현으로 체감시키기
   - 인라인 CTA ("자세히 알아보기 →")는 자사몰사관학교 관련 링크가 있을 때만

---

5. **마치며**: 전체 요약 + 다음 액션 제안

## 글자수
- 표준: 2,500~4,000자 (공백 포함)
- 짧은 글 (단일 팁): 1,500~2,500자
- 긴 글 (종합 가이드): 4,000~6,000자
- 콘텐츠 수에 따라 자동 판단:
  - 1개 콘텐츠 → 표준 (2,500~4,000자)
  - 2~4개 묶음 → 긴 글 (4,000~6,000자)

## 작성 규칙
- ~해요 체 (부드럽고 친근하지만 전문적)
- 한국어 기본. 영어 전문용어는 한글(영어) 병기 (첫 등장만, 이후 한글)
- 숫자로 말하고 스토리로 풀기 — 데이터가 먼저, 감성이 뒤따름
- 문단 짧게 (2~3문장)
- 소제목 넘버링 필수
- 섹션 사이 구분선(---) 필수
- 추측 표현 금지 ("~인 것 같아요")
- 교과서적 정의로 시작 금지 ("~란 ~입니다")

## 마크다운 이스케이프 규칙
- 줄 끝 백슬래시(\\) 사용 금지. 줄바꿈은 빈 줄로 처리
- *** 단독 한 줄 = 수평선. 볼드+이탤릭은 ***텍스트*** 형태로만
- 수평선(--- 또는 ***) 연속 2개 이상 금지
- 이미지 위치는 [이미지: 설명] 형식으로 표시

## 강의 컨텍스트 활용법
아래 '강의 컨텍스트'가 제공됩니다. 이것을 글의 기반으로 삼으세요:
- 강의에서 설명한 개념이면 → 강의식 쉬운 표현 사용
- 강의 사례가 있으면 → 구체적으로 인용/각색
- 강의와 외부 원문이 다르면 → 강의 기준으로 쓰되, "최근 업계에서는 ~라는 의견도 있지만" 형태로 언급 가능
- 강의에 없는 새로운 정보면 → 외부 원문 기반으로 쓰되 강의 톤/수준에 맞추기

## 출력 형식
첫 줄: # 한국어 제목 (숫자+임팩트, 예: "ROAS 4배 만드는 ASC 세팅법 3가지")
나머지: 마크다운 본문`;

    // User Prompt 구성
    let userPrompt: string;
    if (isSingle) {
      userPrompt = `다음 외부 콘텐츠를 참고하여, 자사몰사관학교 강의 관점의 오리지널 정보공유 글을 작성해주세요.\n\n### 외부 콘텐츠: ${contents[0].title}\n${(contents[0].body_md || "").substring(0, truncLen)}`;
    } else {
      userPrompt = `다음 ${contents.length}개 외부 콘텐츠의 공통 주제를 기반으로, 자사몰사관학교 강의 관점의 오리지널 정보공유 글을 작성해주세요.\n각 콘텐츠에서 유용한 정보를 뽑되, 강의 내용으로 재해석하고 보충하세요.\n\n${contentBlocks}`;
    }

    // 강의 컨텍스트 추가
    if (ragContext) {
      userPrompt += `\n\n---\n\n### 자사몰사관학교 강의 컨텍스트\n아래는 관련 강의/블루프린트 내용입니다. 이것을 글의 기반으로 삼으세요.\n\n${ragContext}`;
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
        temperature: 0.7,
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

    // 출력 길이 검증
    if (bodyMd.length < 2000) {
      console.warn(`정보공유 생성 결과가 짧음: ${bodyMd.length}자 (기준 2,500자 이상)`);
    } else if (bodyMd.length > 7000) {
      console.warn(`정보공유 생성 결과가 김: ${bodyMd.length}자 (기준 6,000자 이하)`);
    }

    // 원본 콘텐츠들의 주요 카테고리 결정
    const sourceTypes = contents.map((c: { source_type: string | null }) => c.source_type).filter(Boolean);
    const category = sourceTypes.includes("case_study") ? "case_study"
      : sourceTypes.includes("webinar") ? "webinar"
      : "education";

    return NextResponse.json({
      title,
      body_md: bodyMd,
      category,
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
