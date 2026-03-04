/**
 * Mixpanel 수집 공통 모듈 — collect-mixpanel 크론 + backfill 공유
 * T10: 백필 통합을 위한 함수 추출
 */

import { decrypt } from "@/lib/crypto";

// ── Mixpanel Segmentation API 호출 ──────────────────────────────

export async function fetchMixpanelRevenue(
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
      const count =
        typeof dailyData === "object" && dailyData !== null
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

// ── Mixpanel 시크릿키 조회 ──────────────────────────────────────
// service_secrets 우선 → profiles.mixpanel_secret_key fallback

export async function lookupMixpanelSecret(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  accountId: string,
  userId: string
): Promise<string | null> {
  // 1. service_secrets 조회
  const { data: secretRow } = await svc
    .from("service_secrets" as never)
    .select("key_value" as never)
    .eq("service" as never, "mixpanel")
    .eq("key_name" as never, `secret_${accountId}`)
    .single();

  if (secretRow) {
    return decrypt((secretRow as { key_value: string }).key_value);
  }

  // 2. profiles fallback
  const { data: profile } = await svc
    .from("profiles")
    .select("mixpanel_secret_key")
    .eq("id", userId)
    .single();

  return (profile?.mixpanel_secret_key as string) ?? null;
}
