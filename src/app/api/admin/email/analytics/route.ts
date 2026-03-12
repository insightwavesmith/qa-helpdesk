import { NextResponse } from "next/server";
import { requireAdmin } from "../../_shared";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 3 ? local.slice(0, 3) + "****" : local + "****";
  return `${masked}@${domain}`;
}

export async function GET() {
  try {
    const auth = await requireAdmin(["admin", "assistant"]);
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    // 캐시 우선 조회 (Phase 2)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cached, error: cacheErr } = await (svc as any)
        .from("email_campaign_stats")
        .select("subject, content_id, sent_at, recipients, opens, clicks, open_rate, click_rate, sends_json, updated_at")
        .order("sent_at", { ascending: false });

      if (!cacheErr && cached && cached.length > 0) {
        const newest = cached[0];
        const age = Date.now() - new Date(newest.updated_at).getTime();
        if (age < 24 * 60 * 60 * 1000) { // 24시간 이내
          const campaigns = cached.map((c: Record<string, unknown>) => ({
            subject: c.subject,
            sentAt: c.sent_at,
            contentId: c.content_id,
            recipients: c.recipients,
            opens: c.opens,
            clicks: c.clicks,
            openRate: Number(c.open_rate),
            clickRate: Number(c.click_rate),
            sends: c.sends_json || [],
          }));
          return NextResponse.json({ campaigns });
        }
      }
    } catch {
      // 캐시 테이블 없으면 폴백
    }

    // 폴백: 기존 실시간 집계
    const { data: sends, error } = await svc
      .from("email_sends")
      .select("id, subject, recipient_email, recipient_type, status, sent_at, opened_at, clicked_at, content_id")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("analytics error:", error);
      return NextResponse.json({ error: "성과 데이터 조회에 실패했습니다." }, { status: 500 });
    }

    // subject별 그룹핑 → 발송 목록 생성
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

    const campaigns = Array.from(grouped.values()).map((g) => ({
      subject: g.subject,
      sentAt: g.sentAt,
      contentId: g.contentId,
      recipients: g.recipients,
      opens: g.opens,
      clicks: g.clicks,
      openRate: g.recipients > 0 ? Math.round((g.opens / g.recipients) * 1000) / 10 : 0,
      clickRate: g.recipients > 0 ? Math.round((g.clicks / g.recipients) * 1000) / 10 : 0,
      sends: g.sends,
    }));

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("analytics error:", err);
    return NextResponse.json(
      { error: "성과 데이터 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
