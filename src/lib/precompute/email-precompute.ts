/**
 * 이메일 캠페인 통계 사전계산 — email_sends → subject별 집계
 */
import type { SupabaseClient } from "@supabase/supabase-js";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 3 ? local.slice(0, 3) + "****" : local + "****";
  return `${masked}@${domain}`;
}

export async function precomputeEmailCampaigns(
  supabase: SupabaseClient
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    const { data: sends, error } = await supabase
      .from("email_sends")
      .select("id, subject, recipient_email, recipient_type, status, sent_at, opened_at, clicked_at, content_id")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    // subject별 그룹핑
    const grouped = new Map<
      string,
      {
        subject: string;
        sentAt: string | null;
        contentId: string | null;
        recipients: number;
        opens: number;
        clicks: number;
        sends: { id: string; email: string; type: string | null; openedAt: string | null; clickedAt: string | null }[];
      }
    >();

    for (const s of sends || []) {
      const key = s.subject || "제목 없음";
      if (!grouped.has(key)) {
        grouped.set(key, {
          subject: key,
          sentAt: s.sent_at,
          contentId: s.content_id,
          recipients: 0,
          opens: 0,
          clicks: 0,
          sends: [],
        });
      }
      const g = grouped.get(key)!;
      g.recipients++;
      if (s.opened_at) g.opens++;
      if (s.clicked_at) g.clicks++;
      g.sends.push({
        id: s.id,
        email: maskEmail(s.recipient_email),
        type: s.recipient_type,
        openedAt: s.opened_at,
        clickedAt: s.clicked_at,
      });
    }

    // UPSERT each campaign
    for (const g of grouped.values()) {
      const openRate = g.recipients > 0 ? Math.round((g.opens / g.recipients) * 1000) / 10 : 0;
      const clickRate = g.recipients > 0 ? Math.round((g.clicks / g.recipients) * 1000) / 10 : 0;

      await supabase
        .from("email_campaign_stats" as never)
        .upsert(
          {
            subject: g.subject,
            content_id: g.contentId,
            sent_at: g.sentAt,
            recipients: g.recipients,
            opens: g.opens,
            clicks: g.clicks,
            open_rate: openRate,
            click_rate: clickRate,
            sends_json: g.sends,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "subject" } as never
        );
      computed++;
    }
  } catch (err) {
    errors.push(`email: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { computed, errors };
}
