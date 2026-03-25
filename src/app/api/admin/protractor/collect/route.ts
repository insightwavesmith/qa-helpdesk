import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { getCreativeType } from "@/lib/protractor/creative-type";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";
import {
  calculateMetrics,
  normalizeRanking,
  fetchAccountAds,
} from "@/lib/collect-daily-utils";

// ── POST /api/admin/protractor/collect ────────────────────────
// 관리자 전용: 전체 또는 선택 계정 일괄 수집 (SSE 스트리밍)

export async function POST(req: NextRequest) {
  // 인증
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    return NextResponse.json({ error: "관리자 전용 기능입니다." }, { status: 403 });
  }

  // 요청 파싱
  const body = await req.json();
  const mode: string | undefined = body.mode;
  const accountIds: string[] | "all" = body.accountIds;
  const dateParam: string | undefined = body.date;
  const days: number = typeof body.days === "number" ? body.days : 90;

  // ── backfill 모드 ──────────────────────────────────────────
  if (mode === "backfill") {
    if (!accountIds || accountIds === "all" || (accountIds as string[]).length === 0) {
      return NextResponse.json({ error: "backfill은 계정 ID 지정 필수" }, { status: 400 });
    }
    const targetAccountIds = accountIds as string[];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        send({ type: "backfill_start", days, accounts: targetAccountIds.length });

        let successDays = 0;
        let failedDays = 0;

        for (let i = days; i >= 1; i--) {
          const d = new Date(Date.now() + 9 * 3600_000); // KST
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);

          try {
            for (const accId of targetAccountIds) {
              const result = await runCollectDaily(dateStr, undefined, accId);
              send({
                type: "day_complete",
                date: dateStr,
                accountId: accId,
                ads: result.results.length,
              });
            }
            successDays++;
          } catch (e) {
            failedDays++;
            send({
              type: "day_error",
              date: dateStr,
              error: e instanceof Error ? e.message : String(e),
            });
          }

          // rate limit: 날짜 간 1초 딜레이
          await new Promise(r => setTimeout(r, 1000));
        }

        send({ type: "backfill_complete", successDays, failedDays });
        controller.close();
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

  // KST 어제 날짜
  const targetDate = dateParam ?? (() => {
    const now = new Date(Date.now() + 9 * 3600_000);
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  })();

  // 수집 대상 계정 조회
  let accounts: { account_id: string; account_name: string }[];

  if (accountIds === "all") {
    const { data } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .order("account_name");
    accounts = (data ?? []).map((a: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      account_id: a.account_id as string,
      account_name: (a.account_name ?? a.account_id) as string,
    }));
  } else {
    const { data } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .in("account_id", accountIds);
    accounts = (data ?? []).map((a: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      account_id: a.account_id as string,
      account_name: (a.account_name ?? a.account_id) as string,
    }));
  }

  if (accounts.length === 0) {
    return NextResponse.json({ error: "수집할 계정이 없습니다." }, { status: 400 });
  }

  // SSE 스트리밍
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      send({ type: "start", totalAccounts: accounts.length, date: targetDate });

      let successCount = 0;
      let failedCount = 0;
      let totalAds = 0;

      for (const account of accounts) {
        send({
          type: "account_start",
          accountId: account.account_id,
          accountName: account.account_name,
        });

        try {
          const ads = await fetchAccountAds(account.account_id, targetDate);

          if (ads.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows = ads.map((ad: any) => {
              const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
              const metrics = calculateMetrics(insight);
              const creativeType = getCreativeType(ad);
              return {
                date: targetDate,
                account_id: account.account_id,
                account_name: account.account_name,
                campaign_id: ad.campaign_id ?? null,
                campaign_name: ad.campaign_name ?? null,
                adset_id: ad.adset_id ?? null,
                adset_name: ad.adset_name ?? null,
                ad_id: (ad.ad_id ?? ad.id) as string | null,
                ad_name: (ad.ad_name ?? ad.name) as string | null,
                creative_type: creativeType,
                quality_ranking: normalizeRanking(insight.quality_ranking as string),
                engagement_ranking: normalizeRanking(insight.engagement_rate_ranking as string),
                conversion_ranking: normalizeRanking(insight.conversion_rate_ranking as string),
                ...metrics,
                collected_at: new Date().toISOString(),
              };
            });

            const { error: insertErr } = await svc
              .from("daily_ad_insights")
              .upsert(rows as never[], { onConflict: "account_id,date,ad_id" });

            if (insertErr) {
              throw new Error(insertErr.message);
            }

            totalAds += rows.length;
            send({
              type: "account_complete",
              accountId: account.account_id,
              adsCount: rows.length,
            });
          } else {
            send({
              type: "account_complete",
              accountId: account.account_id,
              adsCount: 0,
            });
          }
          successCount++;
        } catch (e) {
          failedCount++;
          send({
            type: "account_error",
            accountId: account.account_id,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Rate limit 보호: 계정 간 2초 딜레이
        await new Promise(r => setTimeout(r, 2000));
      }

      send({
        type: "complete",
        summary: { success: successCount, failed: failedCount, totalAds },
      });

      controller.close();
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
