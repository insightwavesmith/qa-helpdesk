import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/db";
import { getContentById } from "@/actions/contents";
import NewsletterInlineEditor from "@/components/email/NewsletterInlineEditor";

async function checkIsAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.uid)
      .single();

    return profile?.role === "admin";
  } catch {
    return false;
  }
}

export default async function NewsletterEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    notFound();
  }

  const { data: content, error } = await getContentById(id);
  if (error || !content) {
    notFound();
  }

  return (
    <div className="py-6">
      <NewsletterInlineEditor
        content={{
          id: content.id,
          title: content.title,
          body_md: content.body_md,
          email_subject: content.email_subject,
          email_summary: content.email_summary,
          email_sent_at: content.email_sent_at,
          status: content.status,
        }}
      />
    </div>
  );
}
