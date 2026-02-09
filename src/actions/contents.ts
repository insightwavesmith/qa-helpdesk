"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";

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
  const categoryLabels: Record<string, string> = {
    education: "교육", notice: "공지", case_study: "고객사례",
  };

  const sectionsHtml = contents
    .map((c) => {
      const contentType = c.type || "info";
      const catLabel = categoryLabels[c.category] || c.category;

      if (contentType === "info") {
        const summaryHtml = c.summary
          ? `<p style="color:#333;font-size:14px;line-height:1.6;margin:0">${escapeHtml(c.summary)}</p>`
          : `<p style="color:#333;font-size:14px;line-height:1.6;margin:0">${escapeHtml(stripMarkdown(c.body_md).slice(0, 200))}</p>`;
        return `<div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px">
  <p style="color:#666;font-size:12px;margin:0">${escapeHtml(catLabel)}</p>
  <h3 style="font-size:18px;font-weight:bold;margin:8px 0">${escapeHtml(c.title)}</h3>
  ${summaryHtml}
  <p style="margin-top:12px"><a href="${siteUrl}/posts?content_id=${c.id}" style="background:#F75D5D;color:white;padding:8px 20px;border-radius:4px;text-decoration:none">자세히 보기</a></p>
</div>`;
      }

      if (contentType === "result") {
        const bodyHtml = mdToHtml(c.body_md);
        return `<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px">
  <p style="color:#F75D5D;font-size:12px;font-weight:bold;margin:0">수강생 성과</p>
  <h3 style="font-size:18px;font-weight:bold;margin:8px 0">${escapeHtml(c.title)}</h3>
  <div style="color:#333;font-size:14px;line-height:1.6">${bodyHtml}</div>
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
    .select("title, body_md, email_subject, email_summary")
    .eq("id", contentId)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  const html = mdToHtml(data.body_md);
  const subject = data.email_subject || data.title;

  return {
    data: { html, subject },
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

  let successCount = 0;
  for (const c of contents || []) {
    try {
      const embedding = await generateEmbedding(c.title + " " + c.body_md);
      const { error: updateError } = await supabase
        .from("contents")
        .update({ embedding } as Record<string, unknown>)
        .eq("id", c.id);

      if (!updateError) successCount++;
    } catch (e) {
      console.error(`embedAllContents error for ${c.id}:`, e);
    }
  }

  return { count: successCount, error: null };
}
