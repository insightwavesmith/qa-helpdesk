import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
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

    // email_sends에서 subject별 집계 (content_id는 마이그레이션 후 추가된 컬럼)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sends, error } = await (svc as any)
      .from("email_sends")
      .select("id, subject, recipient_email, recipient_type, status, sent_at, opened_at, clicked_at, content_id")
      .eq("status", "sent")
      .order("sent_at", { ascending: false });

    if (error) {
      console.error("analytics error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // subject별 그룹핑 → 발송 목록 생성
    const grouped = new Map<
      string,
      {
        subject: string;
        sentAt: string;
        contentId: string | null;
        recipients: number;
        opens: number;
        clicks: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sends: any[];
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
        email: s.recipient_email,
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
