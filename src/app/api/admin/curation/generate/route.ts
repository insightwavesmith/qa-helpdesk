import { NextRequest, NextResponse } from "next/server";
import { searchChunks } from "@/lib/knowledge";
import { requireAdmin } from "../../_shared";

export const maxDuration = 300;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(["admin", "assistant"]);
    if ("response" in auth) return auth.response;
    const { svc } = auth;

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

4. **본론** (넘버링된 h2 소제목, 3~5개 섹션):
   각 섹션마다 반드시 포함:
   - 핵심 숫자 블록 (불릿 + 볼드 숫자) — 숫자 먼저, 설명 나중
   - 본문 — 숫자를 스토리로 풀기. 업계 평균/벤치마크와 비교해서 의미 부여
   - \`> 인용문\` 1개 이상 (관련 인물, 수강생 목소리, 또는 핵심 메시지)
   - \`![이미지 설명](IMAGE_PLACEHOLDER)\` 1개 (섹션 주제를 시각화하는 이미지)
   - 비유/일상 표현으로 체감시키기
   - 인라인 CTA ("자세히 알아보기 →")는 자사몰사관학교 관련 링크가 있을 때만

---

5. **## 마치며** (필수 섹션 — 생략 금지):
   - 전체 요약 + 다음 액션 제안
   - 마지막에 수강 문의 CTA 1줄: "자사몰사관학교에서 더 자세히 배워보세요 →"

## 글자수 (절대 규칙)
- 최소 4,000자 이상 (공백 포함). 4,000자 미만 절대 금지.
- 1개 콘텐츠: 4,000~5,000자
- 2~4개 묶음: 5,000~7,000자
- 부족하면 실전 예시, 체크리스트, FAQ를 추가하여 분량 확보

## 작성 규칙
- ~해요 체 (부드럽고 친근하지만 전문적)
- 한국어 기본. 영어 전문용어는 한글(영어) 병기 (첫 등장만, 이후 한글)
- 숫자로 말하고 스토리로 풀기 — 데이터가 먼저, 감성이 뒤따름
- 문단 짧게 (2~3문장)
- 소제목 넘버링 필수
- 섹션 사이 구분선(---) 필수
- 추측 표현 금지 ("~인 것 같아요")
- 교과서적 정의로 시작 금지 ("~란 ~입니다")
- 각 h2 섹션마다 \`> 인용문\` 최소 1개 필수 (빠뜨리면 안 됨)
- 각 h2 섹션마다 \`![이미지 설명](IMAGE_PLACEHOLDER)\` 최소 1개 필수
- \`## 마치며\` 섹션은 반드시 포함. 생략 금지

## 문체 규칙 (자연스러운 글쓰기 — 반드시 지키기)

### 어미 다양화 (같은 어미 3번 연속 금지)
- 허용 어미: ~요, ~다, ~죠, ~거든요, ~네요, ~데요, ~ㄹ까요, ~답니다
- 예시: "성과가 달라져요. 실제로 그렇다. 왜냐면 알고리즘이 학습하거든요."
- 금지: "~했어요. ~봤어요. ~됐어요." (같은 어미 3연속)

### 문장 리듬
- 짧은 문장(15자 이내)과 긴 문장(40자+)을 번갈아 배치
- 예시: "결과가 나왔다. 3주간 ASC 캠페인을 돌린 수강생의 ROAS가 기존 대비 2.4배 올랐거든요."
- 금지: 모든 문장이 비슷한 길이로 나열

### 의문문·감탄문 활용
- 각 h2 섹션마다 의문문 또는 감탄문 1~2개 삽입
- 예시: "왜 이런 차이가 날까요?" "진짜 됩니다." "어떻게 하면 될까요?"

### 구어체 전환어
- 문단 시작에 전환어를 적절히 사용
- 허용: "사실", "솔직히", "그런데 말이죠", "재미있는 건", "여기서 포인트는", "한 가지 더"
- 금지: 모든 문단이 주어+서술어로 시작

### AI 상투어 금지 목록
절대 사용 금지 표현:
- "매우 중요합니다", "매우 효과적입니다"
- "필수적입니다", "핵심입니다", "핵심적인"
- "반드시 ~해야 합니다"
- "~하는 것이 중요합니다"
- "~할 수 있습니다"
- "주목할 만한", "놀라운"
- "획기적인", "혁신적인"
- "살펴보겠습니다", "알아보겠습니다", "다뤄보겠습니다"
- "~라고 할 수 있습니다", "~라는 점에서"
- "다양한", "효과적인", "중요한" (단독 수식어로 사용 시)
- "특히", "무엇보다" (문단 시작어로 반복 시)
- "~에 대해", "~에 관해" (불필요한 간접 표현)
대체 표현 예시:
- "매우 중요합니다" → "이건 진짜 차이를 만들어요" 또는 "여기서 갈린다"
- "필수적입니다" → "이거 안 하면 손해예요" 또는 "꼭 해보세요"
- "반드시 ~해야 합니다" → "~해보면 알게 될 거예요"

### 경험담 톤
- "수업에서도 자주 나오는 질문인데요" 같은 교육 현장 멘트 삽입
- "실제로 수강생 중에 ~한 분이 계셨는데" 같은 사례 화법
- 1인칭("제가 보기에", "저희 수강생 중")을 적절히 사용
- 마치 강의실에서 설명하는 것처럼 쓰기

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

## 톤 레퍼런스 (이 톤을 따라해라)
아래는 실제 발행된 글의 도입부다. 이 톤과 리듬을 기준으로 삼아라:

<tone_reference>
거품이 빠지는 시장에서, 당신의 광고는 실력으로 버티고 있나요?

2025년을 지나며 패션 자사몰 대표님들 사이에서 공통적으로 들리는 말이 있어요. "예전엔 광고만 돌리면 됐는데, 이제는 뭘 해도 잘 안 된다"는 거예요. 실제로 광고비는 오르고, 클릭률은 떨어지고, 구매전환은 더 어려워졌죠.

그런데 이 어려운 환경에서도 꾸준히 성과를 내는 패션 브랜드들이 있어요.
</tone_reference>

이 레퍼런스의 특징을 분석하고 따라해라:
- 첫 줄 = 질문형 훅 (한 줄)
- 도입부 = "~라는 말이 있어요" 같은 현장감
- 짧은 문장과 긴 문장 교차
- "~죠", "~거예요", "~있어요" 어미 다양화
- 과장 없이 현실적인 톤

## 셀프 검수 (글 완성 후 반드시 수행)
글을 다 쓴 뒤, 아래 체크리스트로 한 번 더 다듬어라:
1. 같은 어미가 3번 연속 나오는 곳 → 어미 교체
2. 금지 단어 목록에 해당하는 표현 → 대체 표현으로 수정
3. 모든 문장이 비슷한 길이 → 짧은 문장(15자 이내) 끼워넣기
4. "~입니다"로 끝나는 문단이 2개 이상 연속 → 톤 전환
5. 의문문/감탄문 없는 섹션 → 1개 이상 추가

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
        model: "claude-opus-4-6",
        max_tokens: 8192,
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

    // T2: 커버 이미지 — 제목 키워드로 Unsplash 검색
    let thumbnailUrl: string | null = null;
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      try {
        const keywords = title
          .replace(/[0-9]/g, "")
          .replace(/[^\w\sㄱ-ㅎ가-힣]/g, "")
          .split(/\s+/)
          .filter((w: string) => w.length > 1)
          .slice(0, 3)
          .join(" ");

        const unsplashRes = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&orientation=landscape&per_page=1`,
          { headers: { Authorization: `Client-ID ${unsplashKey}` } }
        );
        if (unsplashRes.ok) {
          const unsplashData = await unsplashRes.json();
          thumbnailUrl = unsplashData.results?.[0]?.urls?.regular || null;
        }
      } catch (unsplashErr) {
        console.warn("Unsplash 검색 실패:", unsplashErr instanceof Error ? unsplashErr.message : unsplashErr);
      }
    }

    return NextResponse.json({
      title,
      body_md: bodyMd,
      category,
      sourceContents: contentIds,
      thumbnail_url: thumbnailUrl,
    });
  } catch (error) {
    console.error("Curation generate error:", error);
    return NextResponse.json(
      { error: "정보공유 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
