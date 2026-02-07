"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function getContents({
  category,
  status,
  page = 1,
  pageSize = 20,
}: {
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) {
    query = query.eq("category", category);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function getContentById(id: string) {
  const supabase = createServiceClient();

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
  category?: string;
  tags?: string[];
  status?: string;
  source_type?: string | null;
  source_ref?: string | null;
  source_hash?: string | null;
  author_id?: string | null;
}) {
  const supabase = createServiceClient();

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
    category?: string;
    tags?: string[];
    status?: string;
    source_type?: string | null;
    source_ref?: string | null;
    source_hash?: string | null;
    author_id?: string | null;
  }
) {
  const supabase = createServiceClient();

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
  const supabase = createServiceClient();

  const { error } = await supabase.from("contents").delete().eq("id", id);

  if (error) {
    console.error("deleteContent error:", error);
    return { error: error.message };
  }

  return { error: null };
}

export async function publishToPost(contentId: string) {
  const supabase = createServiceClient();

  // Fetch the content
  const { data: content, error: fetchError } = await supabase
    .from("contents")
    .select("*")
    .eq("id", contentId)
    .single();

  if (fetchError || !content) {
    console.error("publishToPost fetch error:", fetchError);
    return { data: null, error: fetchError?.message || "콘텐츠를 찾을 수 없습니다." };
  }

  // Insert into posts table
  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      title: content.title,
      content: content.body_md,
      category: "info" as const,
      is_published: true,
      published_at: new Date().toISOString(),
      content_id: contentId,
    })
    .select()
    .single();

  if (postError) {
    console.error("publishToPost insert error:", postError);
    return { data: null, error: postError.message };
  }

  // Insert distribution record
  await supabase.from("distributions").insert({
    content_id: contentId,
    channel: "post",
    channel_ref: post.id,
    rendered_title: content.title,
    rendered_body: content.body_md,
    status: "published",
    distributed_at: new Date().toISOString(),
  });

  // Update content status
  await supabase
    .from("contents")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", contentId);

  return { data: post, error: null };
}

export async function generateNewsletterFromContents(contentIds: string[]) {
  const supabase = createServiceClient();

  const { data: contents, error } = await supabase
    .from("contents")
    .select("*")
    .in("id", contentIds);

  if (error || !contents || contents.length === 0) {
    return "<p>선택된 콘텐츠가 없습니다.</p>";
  }

  const sectionsHtml = contents
    .map((c) => {
      const lines = c.body_md.split("\n").filter((l: string) => l.trim());
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

      let html = `<h3>${c.title}</h3>\n`;
      html += paragraphs.join("\n");
      if (bullets.length > 0) {
        html += `\n<ul>\n${bullets.join("\n")}\n</ul>`;
      }
      return html;
    })
    .join("\n\n");

  return `<h2>뉴스레터</h2>
<p>안녕하세요, 자사몰사관학교입니다.</p>

${sectionsHtml}

<hr />
<p><strong>총가치각도기로 내 광고 성과를 확인해보세요</strong></p>
<p>궁금한 점은 Q&amp;A 게시판에 남겨주세요.</p>`;
}
