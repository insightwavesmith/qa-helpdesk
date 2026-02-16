"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";
import { generate as ksGenerate, type ConsumerType } from "@/lib/knowledge";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("권한이 없습니다.");
  return svc;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 간단한 마크다운→HTML 변환 (TipTap 호환) */
function mdToHtml(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      // headings
      if (trimmed.startsWith("### ")) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      // list items
      if (/^[-*]\s/.test(trimmed)) {
        const text = escapeHtml(trimmed.slice(2));
        return `<li>${applyInlineFormatting(text)}</li>`;
      }
      // paragraph
      return `<p>${applyInlineFormatting(escapeHtml(trimmed))}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

/** 인라인 마크다운 서식 변환 (bold, italic) */
function applyInlineFormatting(html: string): string {
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** 마크다운 기호 제거 (요약용) */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

export async function getContents({
  type,
  category,
  status,
  page = 1,
  pageSize = 20,
}: {
  type?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await requireAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (type) {
    query = query.eq("type", type);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (status) {
    if (status.includes(",")) {
      query = query.in("status", status.split(","));
    } else {
      query = query.eq("status", status);
    }
  } else {
    // 기본: archived 제외
    query = query.neq("status", "archived");
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function getContentById(id: string) {
  const supabase = await requireAdmin();

  const { data, error } = await supabase
    .from("contents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getContentById error:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function createContent(input: {
  title: string;
  body_md: string;
  summary?: string | null;
  thumbnail_url?: string | null;
  type?: string;
  category?: string;
  tags?: string[];
  status?: string;
  source_type?: string | null;
  source_ref?: string | null;
  source_hash?: string | null;
  author_id?: string | null;
  email_summary?: string | null;
}) {
  const supabase = await requireAdmin();

  const { data, error } = await supabase
    .from("contents")
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error("createContent error:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function updateContent(
  id: string,
  input: {
    title?: string;
    body_md?: string;
    summary?: string | null;
    thumbnail_url?: string | null;
    type?: string;
    category?: string;
    tags?: string[];
    status?: string;
    source_type?: string | null;
    source_ref?: string | null;
    source_hash?: string | null;
    author_id?: string | null;
    email_subject?: string | null;
    email_summary?: string | null;
    email_cta_text?: string | null;
    email_cta_url?: string | null;
  }
) {
  const supabase = await requireAdmin();

  const { data, error } = await supabase
    .from("contents")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("updateContent error:", error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function deleteContent(id: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase.from("contents").delete().eq("id", id);

  if (error) {
    console.error("deleteContent error:", error);
    return { error: error.message };
  }

  return { error: null };
}

export async function publishContent(contentId: string) {
  const supabase = await requireAdmin();

  // Update content status to published
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("contents")
    .update({
      status: "published",
      published_at: now,
      updated_at: now,
    })
    .eq("id", contentId)
    .select()
    .single();

  if (updateError) {
    console.error("publishContent update error:", updateError);
    return { data: null, error: updateError.message };
  }

  // Insert distribution record
  const { error: distError } = await supabase.from("distributions").insert({
    content_id: contentId,
    channel: "post",
    channel_ref: contentId,
    rendered_title: updated.title,
    rendered_body: updated.body_md,
    status: "published",
    distributed_at: now,
  });
  if (distError) console.error("Distribution insert error:", distError);

  return { data: updated, error: null };
}

export async function generateNewsletterFromContents(contentIds: string[]) {
  const supabase = await requireAdmin();

  const { data: contents, error } = await supabase
    .from("contents")
    .select("*")
    .in("id", contentIds);

  if (error || !contents || contents.length === 0) {
    return "<p>선택된 콘텐츠가 없습니다.</p>";
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://qa-knowledge-base.vercel.app";
  const typeLabels: Record<string, string> = {
    education: "교육", notice: "공지", case_study: "고객사례",
    webinar: "웨비나", promo: "홍보",
  };

  const sectionsHtml = contents
    .map((c) => {
      const contentType = c.type || "education";
      const typeLabel = typeLabels[contentType] || contentType;

      if (contentType === "education" || contentType === "notice") {
        const summaryHtml = c.summary
          ? `<p style="color:#333;font-size:14px;line-height:1.6;margin:0">${escapeHtml(c.summary)}</p>`
          : `<p style="color:#333;font-size:14px;line-height:1.6;margin:0">${escapeHtml(stripMarkdown(c.body_md).slice(0, 200))}</p>`;
        return `<div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px">
  <p style="color:#666;font-size:12px;margin:0">${escapeHtml(typeLabel)}</p>
  <h3 style="font-size:18px;font-weight:bold;margin:8px 0">${escapeHtml(c.title)}</h3>
  ${summaryHtml}
  <p style="margin-top:12px"><a href="${siteUrl}/posts?content_id=${c.id}" style="background:#F75D5D;color:white;padding:8px 20px;border-radius:4px;text-decoration:none">자세히 보기</a></p>
</div>`;
      }

      if (contentType === "case_study") {
        const bodyHtml = mdToHtml(c.body_md);
        return `<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">
  <p style="color:#F75D5D;font-size:12px;font-weight:bold;margin:0">${escapeHtml(typeLabel)}</p>
  <h3 style="font-size:18px;font-weight:bold;margin:8px 0">${escapeHtml(c.title)}</h3>
  <div style="color:#333;font-size:14px;line-height:1.6">${bodyHtml}</div>
</div>`;
      }

      if (contentType === "webinar") {
        const summaryHtml = c.summary
          ? escapeHtml(c.summary)
          : escapeHtml(stripMarkdown(c.body_md).slice(0, 200));
        return `<div style="background:#2D2D2D;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px">
  <p style="color:#E85A2A;font-size:12px;font-weight:bold;margin:0">LIVE 웨비나</p>
  <h3 style="font-size:20px;font-weight:bold;color:#fff;margin:8px 0">${escapeHtml(c.title)}</h3>
  <p style="color:#ccc;font-size:14px;margin:8px 0">${summaryHtml}</p>
  <p style="margin-top:12px"><a href="${c.source_ref || siteUrl}" style="background:#E85A2A;color:white;padding:10px 28px;border-radius:500px;text-decoration:none;font-weight:bold">신청하기</a></p>
</div>`;
      }

      // promo
      const promoDesc = c.summary
        ? escapeHtml(c.summary)
        : escapeHtml(stripMarkdown(c.body_md).slice(0, 150));
      const ctaUrl = c.source_ref || siteUrl;
      return `<div style="background:#FFF5F5;border:2px solid #F75D5D;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px">
  <h3 style="font-size:20px;font-weight:bold;color:#1a1a2e;margin:0">${escapeHtml(c.title)}</h3>
  <p style="color:#666;font-size:14px;margin:8px 0">${promoDesc}</p>
  <p style="margin-top:12px"><a href="${ctaUrl}" style="background:#F75D5D;color:white;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold">신청하기</a></p>
</div>`;
    })
    .join("\n\n");

  return sectionsHtml;
}

export async function getContentAsEmailHtml(contentId: string) {
  const supabase = await requireAdmin();

  const { data, error } = await supabase
    .from("contents")
    .select("title, body_md, email_subject, email_summary, email_cta_text, email_cta_url")
    .eq("id", contentId)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  const html = mdToHtml(data.body_md);
  const subject = data.email_subject || data.title;

  return {
    data: {
      html,
      subject,
      email_cta_text: data.email_cta_text as string | null,
      email_cta_url: data.email_cta_url as string | null,
    },
    error: null,
  };
}

export async function updateContentEmailSentAt(contentId: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase
    .from("contents")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", contentId);

  if (error) {
    console.error("updateContentEmailSentAt error:", error);
    return { error: error.message };
  }

  return { error: null };
}

export async function embedContent(contentId: string) {
  const supabase = await requireAdmin();

  const { data: content, error: fetchError } = await supabase
    .from("contents")
    .select("title, body_md")
    .eq("id", contentId)
    .single();

  if (fetchError || !content) {
    return { error: fetchError?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  try {
    const embedding = await generateEmbedding(content.title + " " + content.body_md);
    const { error: updateError } = await supabase
      .from("contents")
      .update({ embedding } as Record<string, unknown>)
      .eq("id", contentId);

    if (updateError) {
      return { error: updateError.message };
    }
    return { error: null };
  } catch (e) {
    console.error("embedContent error:", e);
    return { error: e instanceof Error ? e.message : "임베딩 생성 실패" };
  }
}

export async function embedAllContents() {
  const supabase = await requireAdmin();

  const { data: contents, error } = await supabase
    .from("contents")
    .select("id, title, body_md")
    .is("embedding", null);

  if (error) {
    return { count: 0, error: error.message };
  }

  const BATCH_SIZE = 5;
  let successCount = 0;
  const items = contents || [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const embedding = await generateEmbedding(c.title + " " + c.body_md);
        const { error: updateError } = await supabase
          .from("contents")
          .update({ embedding } as Record<string, unknown>)
          .eq("id", c.id);
        if (updateError) throw updateError;
      })
    );
    successCount += results.filter((r) => r.status === "fulfilled").length;
  }

  return { count: successCount, error: null };
}

export async function crawlUrl(
  url: string
): Promise<{ title: string; bodyMd: string } | { error: string }> {
  await requireAdmin();

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; QA-Helpdesk-Bot/1.0; +https://qa-helpdesk.vercel.app)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { error: `URL 요청 실패: ${res.status} ${res.statusText}` };
    }

    const html = await res.text();

    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // 불필요 요소 제거
    $("nav, footer, sidebar, script, style, header, aside, noscript, iframe").remove();

    // title 추출: og:title > title > h1
    const title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim() ||
      $("h1").first().text().trim() ||
      "제목 없음";

    // 본문 추출: main > article > body
    let contentEl = $("main");
    if (!contentEl.length) contentEl = $("article");
    if (!contentEl.length) contentEl = $("body");

    const bodyHtml = contentEl.html() || "";

    // turndown으로 HTML -> 마크다운 변환
    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    turndown.remove(["script", "style", "nav", "footer", "aside"]);

    const bodyMd = turndown.turndown(bodyHtml).trim();

    if (!bodyMd) {
      return { error: "본문 콘텐츠를 추출할 수 없습니다." };
    }

    return { title, bodyMd };
  } catch (e) {
    console.error("crawlUrl error:", e);
    if (e instanceof Error && e.name === "TimeoutError") {
      return { error: "URL 요청 시간 초과 (15초)" };
    }
    return { error: e instanceof Error ? e.message : "URL 크롤링 실패" };
  }
}

const CONTENT_BASE_STYLE = `## 공통 스타일
- ~해요 체 사용 (예: "설정할 수 있어요", "확인해보세요")
- 마켓핏랩 블로그 스타일: 전문적이되 읽기 쉬운 톤
- 전문 용어 → 괄호 설명 (ROAS(광고비 대비 수익률))
- 첫 줄: # 제목 (한국어, 영어 금지)
- 제목에 영어만 단독 사용 금지 (예: ❌ "ASC Campaign Guide" → ✅ "어드밴티지+ 쇼핑 캠페인 완전 가이드")
- 이미지 위치는 [이미지: 설명] 형식으로 표시

## 메타 광고 전문 지식
- 2024-2025 안드로메다 알고리즘: AI 기반 광고-유저 매칭 100배 가속화
- ODAX 6가지 캠페인 목표: 인지도, 트래픽, 참여, 리드, 앱 홍보, 판매
- 3계층 구조: 캠페인(목표) → 광고세트(타겟/예산) → 광고(소재)
- CBO vs ABO: CBO = AI 자동 분배(권장), ABO = 수동 지정
- 어드밴티지+(ASC): AI 완전 자동화 캠페인, 소재 다양성이 핵심
- 타겟팅: 커스텀/유사/관심사/어드밴티지+ 오디언스, 넓은 타겟이 2025년 트렌드
- 픽셀 + 전환 API(CAPI): 함께 사용해야 95%+ 데이터 정확도
- 크리에이티브: 다양한 소재 3-5개/광고세트, 2-3주 리프레시 주기`;

const TYPE_PROMPTS: Record<string, { system: string; userPrefix: string; emailSummaryGuide: string }> = {
  education: {
    system: `당신은 자사몰사관학교의 메타 광고 전문 교육 콘텐츠 작성자입니다.

${CONTENT_BASE_STYLE}

## 교육 콘텐츠 구조 (필수)
1. **도입부**: 한 줄 요약 + 왜 읽어야 하는지 + 대상 독자
2. **넘버링된 h2 소제목** (## 1. OOO, ## 2. OOO)
3. **비교는 반드시 마크다운 테이블 사용**
4. **핵심 포인트는 > 인용문(blockquote)으로 하이라이트**
5. **문단은 2-4문장 이내로 짧게**
6. **실무 팁은 볼드** (**팁:** ~하면 더 효과적이에요)
7. **정리**: 핵심 3줄 요약 + 다음 액션 제안
- 3,000자 이상 작성`,
    userPrefix: "다음 주제에 대한 메타 광고 전문가 교육 콘텐츠를 작성해주세요",
    emailSummaryGuide: `800~1000자 분량의 이메일 요약을 작성하세요:
- 핵심 포인트 3~4개를 넘버링하여 정리
- 각 포인트는 2~3문장으로 요약
- 마지막에 "자세히 보기" CTA 유도 문구`,
  },
  case_study: {
    system: `당신은 자사몰사관학교의 고객 성공사례 작성 전문가입니다.

${CONTENT_BASE_STYLE}

## 고객사례 구조 (필수)
1. **한 줄 성과 요약** (예: "ROAS 450% 달성, 월 매출 3배 성장")
2. **비포(Before)**: 기존 문제 상황, 고객 페인포인트
3. **솔루션(Solution)**: 자사몰사관학교에서 배운 핵심 전략
4. **애프터(After)**: 수치 중심 성과 (ROAS, 매출, CPA 등)
5. **핵심 인사이트**: 다른 대표님들이 참고할 포인트
6. **고객 한마디**: 후기 톤 인용문
- 수치는 반드시 볼드 처리 (**ROAS 380%**)
- 2,000자 이상 작성`,
    userPrefix: "다음 주제에 대한 고객 성공사례를 작성해주세요",
    emailSummaryGuide: `성과 하이라이트 중심 이메일 요약:
- ROAS, 매출, CPA 등 핵심 수치를 볼드로 강조
- 비포→애프터 변화를 한눈에 보여주는 구성
- "전체 사례 보기" CTA`,
  },
  webinar: {
    system: `당신은 자사몰사관학교의 웨비나/라이브 안내 콘텐츠 작성 전문가입니다.

${CONTENT_BASE_STYLE}

## 웨비나 안내 구조 (필수)
1. **제목**: 웨비나 주제 (임팩트 있게)
2. **일시/장소**: 날짜, 시간, 플랫폼 (Zoom 등)
3. **이런 분께 추천**: 대상 청중 3~4가지
4. **다룰 내용**: 어젠다 5~7개 (넘버링)
5. **참여 혜택**: 특전, 자료 제공 등
6. **강사 소개**: 스미스 대표 약력
7. **신청 방법**: CTA 안내
- 참여를 유도하는 긴급성 표현 포함
- 1,500자 이상 작성`,
    userPrefix: "다음 주제에 대한 웨비나 안내 콘텐츠를 작성해주세요",
    emailSummaryGuide: `웨비나 이메일 요약:
- 일시 + 주제 명확히
- 어젠다 핵심 3~4개
- 참여 혜택 강조
- "지금 등록하기" CTA`,
  },
  notice: {
    system: `당신은 자사몰사관학교의 공지사항 작성 전문가입니다.

${CONTENT_BASE_STYLE}

## 공지사항 구조 (필수)
1. **핵심 요약**: 1~2문장으로 변경 사항 요약
2. **상세 내용**: 변경 배경, 적용 일시, 영향 범위
3. **주의 사항**: 회원이 알아야 할 점
4. **문의 안내**: 질문 시 연락처
- 간결하고 명확하게 작성
- 500~1,000자`,
    userPrefix: "다음 내용에 대한 공지사항을 작성해주세요",
    emailSummaryGuide: `공지 이메일 요약:
- 변경사항 핵심만 1~2문단
- 적용 일시 명시
- "자세히 보기" CTA`,
  },
  promo: {
    system: `당신은 자사몰사관학교의 프로모션/마케팅 콘텐츠 작성 전문가입니다.

${CONTENT_BASE_STYLE}

## 프로모션 구조 (필수)
1. **헤드라인**: 혜택 중심 한 줄 (예: "지금 등록하면 30% 할인!")
2. **소셜프루프**: 수강생 수, 평균 ROAS 등 신뢰 지표
3. **핵심 혜택**: 3~5가지 불릿 포인트
4. **긴급성**: 마감 기한, 한정 인원 등
5. **가격/조건**: 원가 vs 할인가, 포함 사항
6. **CTA**: 강한 행동 유도 ("지금 신청하기")
7. **FAQ**: 자주 묻는 질문 2~3개
- 설득력 있는 톤, 혜택 반복 강조
- 1,500자 이상 작성`,
    userPrefix: "다음 내용에 대한 프로모션 콘텐츠를 작성해주세요",
    emailSummaryGuide: `프로모션 이메일 요약:
- 핵심 혜택 + 할인/특전 강조 (볼드)
- 마감 기한/한정 인원 긴급성
- "지금 신청하기" 강한 CTA`,
  },
};

// 콘텐츠 타입 → KnowledgeService Consumer 매핑
const CONTENT_TO_CONSUMER: Record<string, ConsumerType> = {
  education: "education",
  case_study: "education",
  webinar: "webinar",
  notice: "education",
  promo: "promo",
};

// emailSummaryGuide에 추가할 배너키 안내 (BANNER_MAP 키 13개)
const BANNER_KEYS_GUIDE = `

### 배너키 안내
이메일 요약의 각 섹션에 아래 배너키를 ### 헤딩으로 사용하세요. 반드시 2~4개 이상 포함:
INSIGHT, INSIGHT 01, INSIGHT 02, INSIGHT 03, KEY POINT, CHECKLIST, 강의 미리보기, 핵심 주제, 이런 분들을 위해, 웨비나 일정, INTERVIEW, 핵심 변화, 성과

### 구조 예시
### INSIGHT
핵심 인사이트 내용...

### KEY POINT
핵심 포인트 내용...

### CHECKLIST
✅ 체크항목 1
✅ 체크항목 2`;

// 타입별 뉴스레터 배너키 필수 조합
const BANNER_KEYS_BY_TYPE: Record<string, string> = {
  education: `필수 배너키 (반드시 아래 순서·포맷대로 ### 헤딩 사용, 이 목록 외 배너키 생성 금지):

### INSIGHT
핵심 인사이트 텍스트 (1개)
> 💡 팁 (선택)

### KEY POINT
✅ **제목** — 설명
✅ **제목** — 설명

### CHECKLIST
✅ 질문형 텍스트
✅ 질문형 텍스트`,
  webinar: `필수 배너키 (반드시 아래 순서·포맷대로 ### 헤딩 사용, 이 목록 외 배너키 생성 금지):

### 웨비나 일정 안내
📅 날짜/시간/플랫폼 + 설명

### INSIGHT
핵심 인사이트 텍스트

### KEY POINT
✅ **제목** — 설명
✅ **제목** — 설명

### CHECKLIST
✅ 텍스트
✅ 텍스트

### 이런 분들을 위해
- 대상 1
- 대상 2`,
  case_study: `필수 배너키 (반드시 아래 순서·포맷대로 ### 헤딩 사용, 이 목록 외 배너키 생성 금지):

### 성과
#### 소제목
| 지표 | Before | After |
| --- | --- | --- |

### INTERVIEW
> "인용문" — 수강생 X님

### 핵심 변화
✅ **제목** — 설명
✅ **제목** — 설명`,
};

export async function generateEmailSummary(
  contentId: string
): Promise<{ emailSummary: string } | { error: string }> {
  const svc = await requireAdmin();

  // 1. content 조회
  const { data: content, error: fetchError } = await svc
    .from("contents")
    .select("body_md, type")
    .eq("id", contentId)
    .single();

  if (fetchError || !content) {
    return { error: fetchError?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  if (!content.body_md || !content.body_md.trim()) {
    return { error: "본문이 없습니다." };
  }

  const contentType = content.type || "education";
  const bannerGuide = BANNER_KEYS_BY_TYPE[contentType] || BANNER_KEYS_BY_TYPE.education;

  // 2. KS 호출 (limit:0 → RAG 검색 스킵, body_md를 컨텍스트로 직접 전달)
  try {
    const result = await ksGenerate({
      query: `다음 본문을 기반으로 뉴스레터 이메일 요약을 작성해주세요.

## 본문
${content.body_md}

## 작성 규칙
- 800~1000자 분량
- ~해요 체 사용
- 마크다운 형식 유지
- 각 섹션은 ### 배너키 형식의 헤딩으로 시작

## 절대 규칙
- 반드시 아래 지정된 배너키만 ### 헤딩으로 사용하세요
- 아래 목록에 없는 배너키(강의 미리보기, 핵심 주제, INSIGHT 01, INSIGHT 02, INSIGHT 03 등) 절대 생성 금지
- 배너키 순서를 반드시 준수하세요

${bannerGuide}`,
      consumerType: "newsletter",
      limit: 0,
      systemPromptOverride: `당신은 자사몰사관학교의 뉴스레터 전문 작성자입니다.
본문 내용을 기반으로 이메일 뉴스레터 요약을 작성합니다.
반드시 지정된 배너키만 ### 헤딩으로 사용하세요.
지정 배너키 외 다른 ### 헤딩을 생성하면 실패로 간주됩니다.
~해요 체를 사용하고, 핵심 수치는 **볼드**로 강조하세요.`,
      contentId,
    });

    const emailSummary = result.content.trim();

    if (!emailSummary) {
      return { error: "AI가 뉴스레터를 생성하지 못했습니다." };
    }

    // 3. DB 업데이트
    const { error: updateError } = await svc
      .from("contents")
      .update({ email_summary: emailSummary, updated_at: new Date().toISOString() })
      .eq("id", contentId);

    if (updateError) {
      return { error: updateError.message };
    }

    return { emailSummary };
  } catch (e) {
    console.error("generateEmailSummary error:", e);
    if (e instanceof Error && e.message.includes("시간 초과")) {
      return { error: "시간 초과. 다시 시도해주세요." };
    }
    return { error: e instanceof Error ? e.message : "뉴스레터 생성 실패" };
  }
}

export async function reviseContentWithAI(
  contentId: string,
  target: "body_md" | "email_summary",
  instruction: string
): Promise<{ revised: string } | { error: string }> {
  const svc = await requireAdmin();

  if (!instruction.trim()) {
    return { error: "수정 지시를 입력해주세요." };
  }

  // 1. 현재 콘텐츠 조회
  const { data: content, error: fetchError } = await svc
    .from("contents")
    .select("body_md, email_summary, type")
    .eq("id", contentId)
    .single();

  if (fetchError || !content) {
    return { error: fetchError?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  const currentText =
    target === "body_md" ? content.body_md : content.email_summary;

  if (!currentText) {
    return {
      error:
        target === "email_summary"
          ? "이메일 요약이 없습니다. 먼저 생성해주세요."
          : "본문이 없습니다.",
    };
  }

  // 2. KS 호출: limit:0으로 RAG 검색 스킵 (수정에는 기존 텍스트만 필요)
  try {
    const consumerType =
      target === "body_md"
        ? (CONTENT_TO_CONSUMER[content.type || "education"] || "education")
        : "newsletter";

    const result = await ksGenerate({
      query: `다음 텍스트를 수정해주세요.

## 수정 지시
${instruction}

## 현재 텍스트
${currentText}

수정된 전체 텍스트만 출력하세요. 설명이나 주석 없이 텍스트만.`,
      consumerType,
      limit: 0,
      systemPromptOverride: `당신은 자사몰사관학교의 콘텐츠 편집자입니다.
지시에 따라 텍스트를 수정하되, 원문의 핵심 내용과 구조는 유지하세요.
마크다운 형식을 유지하세요.`,
      contentId,
    });

    return { revised: result.content };
  } catch (e) {
    console.error("reviseContentWithAI error:", e);
    if (e instanceof Error && e.message.includes("시간 초과")) {
      return { error: "수정 요청 시간이 초과되었습니다. 다시 시도해주세요." };
    }
    return { error: e instanceof Error ? e.message : "AI 수정 요청 실패" };
  }
}

export async function generateContentWithAI(
  topic: string,
  type: string = "education"
): Promise<{ title: string; bodyMd: string } | { error: string }> {
  await requireAdmin();

  const typePrompt = TYPE_PROMPTS[type] || TYPE_PROMPTS.education;
  const consumerType = CONTENT_TO_CONSUMER[type] || "education";

  try {
    const query = `${typePrompt.userPrefix}: ${topic}`;

    const result = await ksGenerate({
      query,
      consumerType,
      systemPromptOverride: typePrompt.system,
    });

    const text = result.content;

    if (!text.trim()) {
      return { error: "AI가 콘텐츠를 생성하지 못했습니다." };
    }

    // 첫 줄(# 제목)을 title로, 나머지를 bodyMd로 분리
    const lines = text.trim().split("\n");
    let title = topic;
    let bodyMd = text.trim();

    const firstLine = lines[0].trim();
    if (firstLine.startsWith("# ")) {
      title = firstLine.slice(2).trim();
      bodyMd = lines.slice(1).join("\n").trim();
    }

    return { title, bodyMd };
  } catch (e) {
    console.error("generateContentWithAI error:", e);
    return { error: e instanceof Error ? e.message : "AI 콘텐츠 생성 실패" };
  }
}
