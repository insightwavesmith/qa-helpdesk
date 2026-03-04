/**
 * POST /api/admin/backfill
 * T8: 과거데이터 수동 수집 — SSE 스트리밍으로 진행 상태 전송
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAccountAds, buildInsightRows, upsertInsights } from "@/lib/protractor/meta-collector";

export const maxDuration = 300; // 5분 (Vercel Pro)

export async function POST(request: NextRequest) {
  // 1. admin 권한 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });
  }

  let body: { account_id?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { account_id, days } = body;
  if (!account_id || !days || ![7, 30, 90].includes(days)) {
    return NextResponse.json({ error: "account_id, days(7/30/90) 필수" }, { status: 400 });
  }

  // 계정명 조회
  const { data: accountRow } = await svc
    .from("ad_accounts")
    .select("account_name")
    .eq("account_id", account_id)
    .single();
  const accountName = accountRow?.account_name ?? account_id;

  // 2. SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // 수집 날짜 범위 생성 (오늘-1일 ~ 오늘-days일)
        const dates: string[] = [];
        for (let i = 1; i <= days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          dates.push(`${y}-${m}-${day}`);
        }
        dates.reverse(); // 오래된 날짜부터 처리

        send({ type: "start", total: dates.length, accountId: account_id });

        let totalInserted = 0;

        for (let i = 0; i < dates.length; i++) {
          const dateStr = dates[i];
          try {
            const ads = await fetchAccountAds(account_id, dateStr);
            let inserted = 0;

            if (ads.length > 0) {
              const rows = buildInsightRows(ads, account_id, accountName, dateStr);
              inserted = await upsertInsights(svc, rows);
            }

            totalInserted += inserted;
            send({
              type: "progress",
              current: i + 1,
              total: dates.length,
              date: dateStr,
              inserted,
            });
          } catch (e) {
            send({
              type: "dayError",
              date: dateStr,
              message: (e as Error).message,
            });
          }

          // rate limit 방지: 2초 대기
          if (i < dates.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        send({ type: "complete", totalDays: dates.length, totalInserted });
      } catch (e) {
        send({ type: "error", message: (e as Error).message || "수집 중 오류 발생" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
