import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { fetchMixpanelRevenue, lookupMixpanelSecret } from "@/lib/protractor/mixpanel-collector";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── GET /api/cron/collect-mixpanel ─────────────────────────────
// Vercel Cron: 매일 18:30 UTC (KST 다음날 03:30) — collect-daily 30분 후
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const cronRunId = await startCronRun("collect-mixpanel");
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date"); // optional: YYYY-MM-DD
  // KST(UTC+9) 기준 어제 날짜
  const yesterday = dateParam ?? (() => {
    const now = new Date(Date.now() + 9 * 3600_000); // UTC → KST
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  })();

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
      const secretKey = await lookupMixpanelSecret(svc, accountId, userId);

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

    await completeCronRun(
      cronRunId,
      failCount > 0 ? "partial" : "success",
      successCount,
      failCount > 0 ? `${failCount}건 실패` : undefined
    );

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
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("collect-mixpanel fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
