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

// ── Mixpanel Export API — 클릭 이벤트 수집 ──────────────────────
// data.mixpanel.com/api/2.0/export 엔드포인트 사용 (raw events, JSONL)

export interface MixpanelClickEvent {
  pageUrl: string;
  clickX: number;
  clickY: number;
  pageWidth: number | null;
  pageHeight: number | null;
  elementTag: string | null;
  elementText: string | null;
  elementSelector: string | null;
  device: string | null;
  referrer: string | null;
  mixpanelUserId: string | null;
  clickedAt: string; // ISO
}

export async function fetchMixpanelClicks(
  projectId: string,
  secretKey: string,
  date: string
): Promise<MixpanelClickEvent[]> {
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const params = new URLSearchParams({
    project_id: projectId,
    from_date: date,
    to_date: date,
    event: '["$mp_click","$autocapture"]',
  });

  const res = await fetch(
    `https://data.mixpanel.com/api/2.0/export?${params}`,
    {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    if (res.status === 402) {
      // Export API는 유료 플랜 필요할 수 있음 — Segmentation API fallback
      return fetchMixpanelClicksViaSegmentation(projectId, secretKey, date);
    }
    throw new Error(`Mixpanel Export API ${res.status}`);
  }

  const text = await res.text();
  const events: MixpanelClickEvent[] = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      const props = evt.properties || {};

      // URL이 있는 이벤트만 (LP 매핑용)
      const pageUrl =
        props.$current_url || props.$url || props.url || props.current_url;
      if (!pageUrl) continue;

      events.push({
        pageUrl,
        clickX: Number(props.$element_position_x ?? props.click_x ?? 0),
        clickY: Number(props.$element_position_y ?? props.click_y ?? 0),
        pageWidth: props.$screen_width ? Number(props.$screen_width) : null,
        pageHeight: props.$screen_height ? Number(props.$screen_height) : null,
        elementTag: props.$element_tag_name || props.element_tag || null,
        elementText:
          (props.$element_text || props.element_text || "").slice(0, 200) ||
          null,
        elementSelector:
          props.$element_selector || props.element_selector || null,
        device: props.$device_type || props.$device || props.device || null,
        referrer: props.$referrer || props.referrer || null,
        mixpanelUserId: props.distinct_id || evt.properties?.distinct_id || null,
        clickedAt: props.time
          ? new Date(props.time * 1000).toISOString()
          : new Date().toISOString(),
      });
    } catch {
      // 파싱 실패 라인은 스킵
    }
  }

  return events;
}

// Segmentation API fallback — Export API 권한 없을 때
// 클릭 수만 카운트 (좌표 없음), 기본 집계용
async function fetchMixpanelClicksViaSegmentation(
  projectId: string,
  secretKey: string,
  date: string
): Promise<MixpanelClickEvent[]> {
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const baseUrl = "https://mixpanel.com/api/2.0/segmentation";

  // $mp_click 이벤트 카운트만 조회
  const params = new URLSearchParams({
    project_id: projectId,
    event: "$mp_click",
    from_date: date,
    to_date: date,
    type: "general",
    on: 'properties["$current_url"]',
  });

  const res = await fetch(`${baseUrl}?${params}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // $mp_click 없으면 $autocapture 시도
    const params2 = new URLSearchParams({
      project_id: projectId,
      event: "$autocapture",
      from_date: date,
      to_date: date,
      type: "general",
      on: 'properties["$current_url"]',
    });

    const res2 = await fetch(`${baseUrl}?${params2}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res2.ok) return [];
    const data2 = await res2.json();
    return parseSegmentationClickData(data2, date);
  }

  const data = await res.json();
  return parseSegmentationClickData(data, date);
}

function parseSegmentationClickData(
  data: { data?: { values?: Record<string, Record<string, number>> } },
  date: string
): MixpanelClickEvent[] {
  const events: MixpanelClickEvent[] = [];
  if (!data.data?.values) return events;

  // Segmentation API는 URL별 카운트만 반환 — 좌표 없음
  for (const [url, dailyData] of Object.entries(data.data.values)) {
    const count =
      typeof dailyData === "object"
        ? Object.values(dailyData).reduce((s, v) => s + v, 0)
        : 0;
    if (count > 0 && url !== "$overall") {
      // 클릭 수만큼 이벤트 생성 (좌표 0,0 — Segmentation API 한계)
      for (let i = 0; i < Math.min(count, 100); i++) {
        events.push({
          pageUrl: url,
          clickX: 0,
          clickY: 0,
          pageWidth: null,
          pageHeight: null,
          elementTag: null,
          elementText: null,
          elementSelector: null,
          device: null,
          referrer: null,
          mixpanelUserId: null,
          clickedAt: `${date}T12:00:00.000Z`,
        });
      }
    }
  }

  return events;
}
