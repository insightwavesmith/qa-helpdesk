/**
 * 타겟중복 분석 공통 유틸리티
 * overlap/route.ts 및 collect-daily/route.ts에서 공유 사용
 */

const META_API = "https://graph.facebook.com/v21.0";

export interface AdsetInfo {
  id: string;
  name: string;
  campaignName: string;
}

export interface OverlapPair {
  adset_a_name: string;
  adset_b_name: string;
  campaign_a: string;
  campaign_b: string;
  overlap_rate: number;
}

// ── Meta API 토큰 ────────────────────────────────────────────
export function getToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");
  return token;
}

// ── Meta Graph API 호출 헬퍼 ─────────────────────────────────
export async function metaGet(path: string, params: Record<string, string>) {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set("access_token", getToken());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta API: ${data.error.message ?? "Unknown error"}`);
  }
  return data;
}

// ── 활성 OUTCOME_SALES 캠페인의 광고세트 목록 ───────────────
export async function fetchActiveAdsets(accountId: string): Promise<AdsetInfo[]> {
  // 1) 활성 캠페인 (OUTCOME_SALES)
  const campaignsData = await metaGet(`act_${accountId}/campaigns`, {
    effective_status: '["ACTIVE"]',
    fields: "id,name,objective",
    limit: "100",
  });

  const salesCampaigns = (
    (campaignsData.data ?? []) as {
      id: string;
      name: string;
      objective: string;
    }[]
  ).filter((c) => c.objective === "OUTCOME_SALES");

  if (salesCampaigns.length === 0) return [];

  // 2) 각 캠페인의 활성 광고세트
  const adsets: AdsetInfo[] = [];
  for (const campaign of salesCampaigns) {
    const adsetsData = await metaGet(`${campaign.id}/adsets`, {
      effective_status: '["ACTIVE"]',
      fields: "id,name",
      limit: "100",
    });
    for (const adset of (adsetsData.data ?? []) as {
      id: string;
      name: string;
    }[]) {
      adsets.push({
        id: adset.id,
        name: adset.name,
        campaignName: campaign.name,
      });
    }
  }

  return adsets;
}

// ── 조합 reach 조회 (Meta Insights API) ──────────────────────
export async function fetchCombinedReach(
  accountId: string,
  adsetIds: string[],
  dateStart: string,
  dateEnd: string
): Promise<number> {
  const filtering = JSON.stringify([
    {
      field: "adset.id",
      operator: "IN",
      value: adsetIds,
    },
  ]);

  const data = await metaGet(`act_${accountId}/insights`, {
    filtering,
    fields: "reach",
    time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
    level: "account",
  });

  const rows = (data.data ?? []) as { reach?: string }[];
  return rows.length > 0 ? parseInt(rows[0].reach ?? "0", 10) : 0;
}

// ── adset_pair 키 생성 (항상 정렬) ──────────────────────────
export function makePairKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}
