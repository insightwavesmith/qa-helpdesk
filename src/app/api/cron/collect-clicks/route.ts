/**
 * GET /api/cron/collect-clicks
 * Mixpanel 클릭 이벤트 수집 → lp_click_data 테이블
 *
 * Vercel Cron: 매일 19:00 UTC (KST 다음날 04:00)
 * collect-mixpanel 30분 후 실행
 *
 * 흐름:
 *   1. ad_accounts에서 mixpanel_project_id 있는 계정 조회
 *   2. lookupMixpanelSecret으로 시크릿키 조회
 *   3. fetchMixpanelClicks로 $mp_click / $autocapture 이벤트 수집
 *   4. LP URL → landing_pages.id 매핑
 *   5. lp_click_data INSERT
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import {
  fetchMixpanelClicks,
  lookupMixpanelSecret,
} from "@/lib/protractor/mixpanel-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// URL 정규화 — landing_pages.canonical_url과 매칭용
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // 프래그먼트, utm 파라미터 제거
    u.hash = "";
    const keysToRemove: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (
        key.startsWith("utm_") ||
        key.startsWith("fbclid") ||
        key.startsWith("gclid") ||
        key === "ref" ||
        key === "source"
      ) {
        keysToRemove.push(key);
      }
    });
    for (const k of keysToRemove) u.searchParams.delete(k);
    // trailing slash 제거
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySvc = svc as any;
  const cronRunId = await startCronRun("collect-clicks");
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const accountFilter = searchParams.get("account_id"); // 특정 계정만

  // KST 기준 어제
  const yesterday =
    dateParam ??
    (() => {
      const now = new Date(Date.now() + 9 * 3600_000);
      now.setDate(now.getDate() - 1);
      return now.toISOString().slice(0, 10);
    })();

  try {
    // 1. Mixpanel 연동 계정 조회
    let accountQuery = anySvc
      .from("ad_accounts")
      .select("account_id, user_id, mixpanel_project_id")
      .eq("active", true)
      .not("mixpanel_project_id", "is", null);

    if (accountFilter) {
      accountQuery = accountQuery.eq("account_id", accountFilter);
    }

    const { data: accounts, error: accErr } = await accountQuery;

    if (accErr) throw new Error(`ad_accounts 조회 오류: ${accErr.message}`);
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: "collect-clicks: Mixpanel 연동 계정 없음",
        date: yesterday,
      });
    }

    // 2. landing_pages URL 맵 로드 (전체 — 보통 2K건 미만)
    const { data: lpRows } = await anySvc
      .from("landing_pages")
      .select("id, canonical_url, original_urls, account_id");

    // URL → lp_id 맵 구축
    const urlToLpId: Map<string, string> = new Map();
    if (lpRows) {
      for (const lp of lpRows) {
        const canonicalNorm = normalizeUrl(lp.canonical_url);
        urlToLpId.set(canonicalNorm, lp.id);
        // original_urls도 매핑
        if (Array.isArray(lp.original_urls)) {
          for (const origUrl of lp.original_urls) {
            urlToLpId.set(normalizeUrl(origUrl), lp.id);
          }
        }
      }
    }

    console.log(
      `[collect-clicks] LP URL 맵: ${urlToLpId.size}건, 계정: ${accounts.length}개`
    );

    let totalEvents = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const accountResults: Record<string, unknown>[] = [];

    // 3. 계정별 클릭 수집
    for (const acc of accounts) {
      const projectId = acc.mixpanel_project_id as string;
      const accountId = acc.account_id as string;
      const userId = acc.user_id as string;

      const secretKey = await lookupMixpanelSecret(svc, accountId, userId);
      if (!secretKey) {
        console.log(`[collect-clicks] ${accountId}: 시크릿키 없음 → 스킵`);
        accountResults.push({
          account_id: accountId,
          status: "skipped",
          reason: "시크릿키 없음",
        });
        continue;
      }

      try {
        const clickEvents = await fetchMixpanelClicks(
          projectId,
          secretKey,
          yesterday
        );
        totalEvents += clickEvents.length;

        if (clickEvents.length === 0) {
          accountResults.push({
            account_id: accountId,
            status: "success",
            events: 0,
            inserted: 0,
          });
          continue;
        }

        // 4. LP URL 매핑 + lp_click_data 벌크 INSERT
        const rows: Record<string, unknown>[] = [];

        for (const evt of clickEvents) {
          const normalizedUrl = normalizeUrl(evt.pageUrl);
          const lpId = urlToLpId.get(normalizedUrl);

          if (!lpId) {
            totalSkipped++;
            continue;
          }

          rows.push({
            lp_id: lpId,
            click_x: evt.clickX,
            click_y: evt.clickY,
            page_width: evt.pageWidth,
            page_height: evt.pageHeight,
            element_tag: evt.elementTag,
            element_text: evt.elementText,
            element_selector: evt.elementSelector,
            device: evt.device,
            referrer: evt.referrer,
            mixpanel_user_id: evt.mixpanelUserId,
            clicked_at: evt.clickedAt,
          });
        }

        if (rows.length > 0) {
          // 배치 100건씩 INSERT
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);
            const { error: insertErr } = await anySvc
              .from("lp_click_data")
              .insert(batch);

            if (insertErr) {
              console.error(
                `[collect-clicks] ${accountId}: INSERT 오류 (batch ${i})`,
                insertErr.message
              );
              totalFailed += batch.length;
            } else {
              totalInserted += batch.length;
            }
          }
        }

        accountResults.push({
          account_id: accountId,
          status: "success",
          events: clickEvents.length,
          matched: rows.length,
          skipped: clickEvents.length - rows.length,
          inserted: rows.length,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[collect-clicks] ${accountId}: 오류`, msg);
        accountResults.push({
          account_id: accountId,
          status: "error",
          reason: msg,
        });
      }

      // Mixpanel rate limit 방지
      await new Promise((r) => setTimeout(r, 500));
    }

    await completeCronRun(
      cronRunId,
      totalFailed > 0 ? "partial" : "success",
      totalInserted,
      totalFailed > 0 ? `${totalFailed}건 INSERT 실패` : undefined
    );

    return NextResponse.json({
      message: "collect-clicks completed",
      date: yesterday,
      accounts: accounts.length,
      total_events: totalEvents,
      inserted: totalInserted,
      skipped_no_lp: totalSkipped,
      failed: totalFailed,
      results: accountResults,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("collect-clicks fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
