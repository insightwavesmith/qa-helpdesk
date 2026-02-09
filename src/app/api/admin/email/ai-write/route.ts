import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface ContentSection {
  title: string;
  content: string;
  source: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  education: "교육",
  notice: "공지",
  case_study: "고객사례",
  newsletter: "뉴스레터",
  custom: "직접 입력",
};

const TONE_INTROS: Record<string, (topic: string) => string> = {
  educational: (topic) => `오늘은 ${topic}에 대해 알아보겠습니다.`,
  casual: (topic) => `안녕하세요! 이번 주 ${topic} 소식을 전해드려요.`,
  urgent: (topic) =>
    `지금 바로 확인하세요! ${topic}에 대한 중요 업데이트입니다.`,
};

const MAX_SECTIONS = 3;

function buildSectionHtml(section: ContentSection): string {
  const lines = section.content.split("\n").filter((l) => l.trim());
  const bullets: string[] = [];
  const paragraphs: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      bullets.push(`  <li>${bulletMatch[1]}</li>`);
    } else {
      paragraphs.push(`<p>${line}</p>`);
    }
  }

  let html = `<h3>${section.title}</h3>\n`;
  html += paragraphs.join("\n");
  if (bullets.length > 0) {
    html += `\n<ul>\n${bullets.join("\n")}\n</ul>`;
  }

  return html;
}

function buildNewsletterHtml(
  title: string,
  intro: string,
  sections: ContentSection[]
): string {
  const sectionHtmls = sections
    .slice(0, MAX_SECTIONS)
    .map(buildSectionHtml)
    .join("\n\n");

  const bodyContent = sectionHtmls || "<p>아직 준비된 콘텐츠가 없습니다. 곧 업데이트 예정입니다.</p>";

  return `<h2>${title}</h2>
<p>안녕하세요, 자사몰사관학교입니다.</p>
<p>${intro}</p>

${bodyContent}

<hr />
<p><strong>총가치각도기로 내 광고 성과를 확인해보세요</strong></p>
<p>궁금한 점은 Q&amp;A 게시판에 남겨주세요.</p>`;
}

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

    const body = await request.json();
    const { category, topic, tone } = body as {
      category: string;
      topic?: string;
      tone: string;
      template?: string;
    };

    if (!category) {
      return NextResponse.json(
        { error: "카테고리는 필수입니다." },
        { status: 400 }
      );
    }

    const toneKey = tone || "educational";
    const topicLabel = topic || CATEGORY_LABELS[category] || category;
    const introFn = TONE_INTROS[toneKey] || TONE_INTROS.educational;
    const intro = introFn(topicLabel);

    let contentHtml: string;
    let sources: string[] = [];
    let firstSectionTitle: string;

    // Query contents from DB
    let query = svc
      .from("contents")
      .select("*")
      .eq("status", "ready");
    if (category && category !== "custom") {
      query = query.eq("category", category);
    }
    if (topic) {
      query = query.or(
        `title.ilike.%${topic}%,body_md.ilike.%${topic}%`
      );
    }
    const { data: contents } = await query.limit(MAX_SECTIONS);

    const sections: ContentSection[] = (contents || []).map((c) => ({
      title: c.title,
      content: c.body_md,
      source: c.source_ref || c.category,
    }));

    const selected = sections.slice(0, MAX_SECTIONS);
    sources = [...new Set(selected.map((s) => s.source))];
    firstSectionTitle = selected[0]?.title || "";

    const title = firstSectionTitle
      ? `${CATEGORY_LABELS[category] || category} - ${firstSectionTitle}`
      : CATEGORY_LABELS[category] || category;
    contentHtml = buildNewsletterHtml(title, intro, selected);

    const categoryLabel = CATEGORY_LABELS[category] || category;
    const subject = firstSectionTitle
      ? `[BS CAMP] ${categoryLabel} - ${firstSectionTitle}`
      : `[BS CAMP] ${categoryLabel}`;

    return NextResponse.json({
      subject,
      content: contentHtml,
      sources,
    });
  } catch (error) {
    console.error("AI write error:", error);
    return NextResponse.json(
      { error: "콘텐츠 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
