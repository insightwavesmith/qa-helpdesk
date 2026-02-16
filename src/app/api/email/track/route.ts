import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// 1x1 투명 GIF (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://qa-helpdesk.vercel.app";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("t");
  const sendId = searchParams.get("sid");

  if (!sendId) {
    // 잘못된 요청이라도 빠르게 응답
    if (type === "click") {
      return NextResponse.redirect(SITE_URL, 302);
    }
    return new NextResponse(TRANSPARENT_GIF, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  // 비동기 DB 업데이트 (응답 차단 방지)
  const updatePromise = (async () => {
    try {
      const svc = createServiceClient();
      const now = new Date().toISOString();

      if (type === "open") {
        // opened_at이 null일 때만 업데이트 (첫 열람만 기록)
        await svc
          .from("email_sends")
          .update({ opened_at: now })
          .eq("id", sendId)
          .is("opened_at", null);
      } else if (type === "click") {
        await svc
          .from("email_sends")
          .update({ clicked_at: now })
          .eq("id", sendId)
          .is("clicked_at", null);
      }

      // email_logs 집계 갱신: 해당 send의 subject + sent_at 기준으로 email_logs 찾아 COUNT 업데이트
      const { data: send } = await svc
        .from("email_sends")
        .select("subject")
        .eq("id", sendId)
        .single();

      if (send?.subject) {
        // subject가 같은 email_sends에서 열람/클릭 집계
        const { count: openCount } = await svc
          .from("email_sends")
          .select("*", { count: "exact", head: true })
          .eq("subject", send.subject)
          .not("opened_at", "is", null);

        const { count: clickCount } = await svc
          .from("email_sends")
          .select("*", { count: "exact", head: true })
          .eq("subject", send.subject)
          .not("clicked_at", "is", null);

        // email_logs 업데이트 (subject 매칭)
        // total_opens/total_clicks는 마이그레이션으로 추가되는 컬럼 (타입 미반영)
        await svc
          .from("email_logs")
          .update({
            total_opens: openCount || 0,
            total_clicks: clickCount || 0,
          } as Record<string, unknown>)
          .eq("subject", send.subject);
      }
    } catch (err) {
      console.error("[email/track] DB update error:", err);
    }
  })();

  if (type === "click") {
    const url = searchParams.get("url");
    const redirectUrl = url || SITE_URL;

    // fire-and-forget: 응답 후 비동기 DB 업데이트
    updatePromise.catch(() => {});

    return NextResponse.redirect(redirectUrl, 302);
  }

  // open tracking: 투명 GIF 반환
  updatePromise.catch(() => {});

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
