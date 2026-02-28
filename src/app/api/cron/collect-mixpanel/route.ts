import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── Mixpanel Segmentation API 호출 ──────────────────────────────
async function fetchMixpanelRevenue(
  projectId: string,
  secretKey: string,
  date: string
): Promise<{ totalRevenue: number; purchaseCount: number }> {
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };
  const baseUrl = "https://mixpanel.com/api/2.0/segmentation";

  // 1. 토탈매출: event=purchase, type=sum, on=properties["value"]
  const revenueParams = new URLSearchParams({
    project_id: projectId,
    event: "purchase",
    from_date: date,
    to_date: date,
    type: "general",
    on: 'properties["value"]',
  });

  const revenueRes = await fetch(`${baseUrl}?${revenueParams}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!revenueRes.ok) {
    if (revenueRes.status === 401) {
      throw new Error("시크릿키 만료 또는 무효");
    }
    throw new Error(`Mixpanel API ${revenueRes.status}`);
  }

  const revenueData = await revenueRes.json();
  let totalRevenue = 0;
  if (revenueData.data?.values) {
    for (const [amountStr, dailyData] of Object.entries(revenueData.data.values)) {
      const amount = Number(amountStr);
      if (!Number.isFinite(amount)) continue;
      const count = typeof dailyData === "object" && dailyData !== null
        ? Object.values(dailyData as Record<string, number>).reduce((s, v) => s + v, 0)
        : 0;
      totalRevenue += amount * count;
    }
  }

  // 2. 구매건수: event=purchase, type=general
  const countParams = new URLSearchParams({
    project_id: projectId,
    event: "purchase",
    from_date: date,
    to_date: date,
    type: "general",
  });

  const countRes = await fetch(`${baseUrl}?${countParams}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!countRes.ok) {
    throw new Error(`Mixpanel API ${countRes.status}`);
  }

  const countData = await countRes.json();
  let purchaseCount = 0;
  if (countData.data?.values) {
    for (const dailyData of Object.values(countData.data.values)) {
      if (typeof dailyData === "object" && dailyData !== null) {
        purchaseCount += Object.values(dailyData as Record<string, number>).reduce(
          (s, v) => s + v,
          0
        );
      }
    }
  }

  return { totalRevenue, purchaseCount };
}

// ── GET /api/cron/collect-mixpanel ─────────────────────────────
// Vercel Cron: 매일 03:30 UTC (KST 12:30) — collect-daily 30분 후
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date"); // optional: YYYY-MM-DD
  const yesterday = dateParam ?? new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    // 1. ad_accounts + profiles JOIN → mixpanel_project_id 있는 계정 목록
    const { data: accounts, error: accErr } = await svc
      .from("ad_accounts")
      .select("account_id, user_id, mixpanel_project_id")
      .eq("active", true)
      .not("mixpanel_project_id", "is", null);

    if (accErr) {
      throw new Error(`ad_accounts 조회 오류: ${accErr.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: "collect-mixpanel: 믹스패널 연동 계정 없음",
        date: yesterday,
        accounts: 0,
        results: [],
      });
    }

    const results: Record<string, unknown>[] = [];
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    // 2. 계정별 순차 처리 (Mixpanel rate limit: 60 queries/hour)
    for (const acc of accounts) {
      const projectId = acc.mixpanel_project_id as string;
      const accountId = acc.account_id as string;
      const userId = acc.user_id as string;

      // 시크릿키 조회: service_secrets 우선 → profiles.mixpanel_secret_key fallback
      let secretKey: string | null = null;

      const { data: secretRow } = await svc
        .from("service_secrets" as never)
        .select("key_value" as never)
        .eq("service" as never, "mixpanel")
        .eq("key_name" as never, `secret_${accountId}`)
        .single();

      if (secretRow) {
        secretKey = decrypt((secretRow as { key_value: string }).key_value);
      }

      if (!secretKey) {
        // profiles fallback
        const { data: profile } = await svc
          .from("profiles")
          .select("mixpanel_secret_key")
          .eq("id", userId)
          .single();

        secretKey = (profile?.mixpanel_secret_key as string) ?? null;
      }

      if (!secretKey) {
        console.log(`[collect-mixpanel] ${accountId}: 시크릿키 없음 → 스킵`);
        skipCount++;
        results.push({ account_id: accountId, status: "skipped", reason: "시크릿키 없음" });
        continue;
      }

      // Mixpanel API 호출 (1회 재시도)
      let retries = 0;
      while (retries <= 1) {
        try {
          const { totalRevenue, purchaseCount } = await fetchMixpanelRevenue(
            projectId,
            secretKey,
            yesterday
          );

          // UPSERT (date + account_id + project_id 기준)
          const { error: upsertErr } = await svc
            .from("daily_mixpanel_insights" as never)
            .upsert(
              {
                date: yesterday,
                user_id: userId,
                account_id: accountId,
                project_id: projectId,
                total_revenue: totalRevenue,
                purchase_count: purchaseCount,
                collected_at: new Date().toISOString(),
              } as never,
              { onConflict: "date,account_id,project_id" as never }
            );

          if (upsertErr) {
            console.error(`[collect-mixpanel] ${accountId}: UPSERT 오류`, upsertErr);
            failCount++;
            results.push({ account_id: accountId, status: "error", reason: upsertErr.message });
          } else {
            successCount++;
            results.push({
              account_id: accountId,
              status: "success",
              total_revenue: totalRevenue,
              purchase_count: purchaseCount,
            });
          }
          break; // 성공 시 루프 종료
        } catch (e) {
          if (retries === 0 && e instanceof Error && e.name === "TimeoutError") {
            retries++;
            console.log(`[collect-mixpanel] ${accountId}: 타임아웃 → 재시도`);
            continue;
          }
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[collect-mixpanel] ${accountId}: API 오류`, msg);
          failCount++;
          results.push({ account_id: accountId, status: "error", reason: msg });
          break;
        }
      }
    }

    return NextResponse.json({
      message: "collect-mixpanel completed",
      date: yesterday,
      accounts: accounts.length,
      success: successCount,
      skipped: skipCount,
      failed: failCount,
      results,
    });
  } catch (e) {
    console.error("collect-mixpanel fatal error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
