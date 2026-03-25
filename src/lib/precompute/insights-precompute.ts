/**
 * Insights 사전집계 — collect-daily 크론 완료 후 실행
 * daily_ad_insights를 계정+일자별로 집계하여 insights_aggregated_daily에 저장
 * 5,000행 raw 쿼리 대신 30~90행 집계 데이터로 빠른 응답
 */
import type { DbClient } from "@/lib/db";

/** 집계 대상: 최근 N일 (최대 90일) */
const LOOKBACK_DAYS = 90;

export async function precomputeInsights(
  supabase: DbClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  // 1. 활성 계정 목록
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("account_id")
    .eq("active", true);

  if (!accounts || accounts.length === 0) return { computed, errors };

  // 2. 날짜 범위 계산 (최근 90일)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // 어제
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - LOOKBACK_DAYS + 1);
  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);

  // 3. 계정별 집계
  for (const account of accounts) {
    const accountId = account.account_id;

    try {
      // raw insights 조회
      const { data: rawRows, error: queryErr } = await supabase
        .from("daily_ad_insights")
        .select(
          "date,impressions,reach,clicks,spend,purchases,purchase_value," +
          "video_p3s_rate,thruplay_rate,retention_rate," +
          "reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,engagement_per_10k," +
          "click_to_purchase_rate,click_to_checkout_rate,checkout_to_purchase_rate,reach_to_purchase_rate",
        )
        .eq("account_id", accountId)
        .gte("date", startStr)
        .lte("date", endStr);

      if (queryErr) {
        errors.push(`insights [${accountId}]: ${queryErr.message}`);
        continue;
      }

      if (!rawRows || rawRows.length === 0) continue;

      const rows = rawRows as unknown as RawInsightRow[];

      // 일자별 집계
      const dailyMap = new Map<string, DailyAccum>();

      for (const row of rows) {
        const date = row.date;
        let accum = dailyMap.get(date);
        if (!accum) {
          accum = createAccum();
          dailyMap.set(date, accum);
        }
        addToAccum(accum, row);
      }

      // upsert 행 생성
      const upsertRows = Array.from(dailyMap.entries()).map(([date, acc]) => {
        const imp = acc.impressions;
        const clicks = acc.clicks;
        const p3sRaw = acc.videoP3sRaw;

        return {
          account_id: accountId,
          date,
          impressions: acc.impressions,
          reach: acc.reach,
          clicks: acc.clicks,
          spend: round(acc.spend, 2),
          purchases: acc.purchases,
          purchase_value: round(acc.purchaseValue, 2),
          ctr: imp > 0 ? round((clicks / imp) * 100, 4) : 0,
          roas: acc.spend > 0 ? round(acc.purchaseValue / acc.spend, 4) : 0,
          video_p3s_rate: imp > 0 ? round((p3sRaw / imp) * 100, 4) : null,
          thruplay_rate: imp > 0 ? round((acc.thruplayRaw / imp) * 100, 4) : null,
          retention_rate: p3sRaw > 0 ? round((acc.p100Raw / p3sRaw) * 100, 4) : null,
          reactions_per_10k: imp > 0 ? round((acc.reactionsRaw / imp) * 10000, 2) : null,
          comments_per_10k: imp > 0 ? round((acc.commentsRaw / imp) * 10000, 2) : null,
          shares_per_10k: imp > 0 ? round((acc.sharesRaw / imp) * 10000, 2) : null,
          saves_per_10k: imp > 0 ? round((acc.savesRaw / imp) * 10000, 2) : null,
          engagement_per_10k: imp > 0 ? round((acc.engagementRaw / imp) * 10000, 2) : null,
          click_to_purchase_rate: clicks > 0 ? round((acc.purchases / clicks) * 100, 4) : null,
          click_to_checkout_rate: clicks > 0 ? round((acc.checkoutRaw / clicks) * 100, 4) : null,
          checkout_to_purchase_rate: acc.checkoutRaw > 0 ? round((acc.purchases / acc.checkoutRaw) * 100, 4) : null,
          reach_to_purchase_rate: imp > 0 ? round((acc.purchases / imp) * 100, 6) : null,
          ad_count: acc.adCount,
          computed_at: new Date().toISOString(),
        };
      });

      // 배치 upsert (50행씩)
      const BATCH = 50;
      for (let i = 0; i < upsertRows.length; i += BATCH) {
        const batch = upsertRows.slice(i, i + BATCH);
        const { error: upsertErr } = await supabase
          .from("insights_aggregated_daily" as never)
          .upsert(batch as never[], { onConflict: "account_id,date" });

        if (upsertErr) {
          errors.push(`insights upsert [${accountId}]: ${upsertErr.message}`);
        } else {
          computed += batch.length;
        }
      }
    } catch (e) {
      errors.push(`insights [${accountId}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { computed, errors };
}

// ── 내부 타입 & 유틸 ──────────────────────────────────────────

interface RawInsightRow {
  date: string;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  spend: number | null;
  purchases: number | null;
  purchase_value: number | null;
  video_p3s_rate: number | null;
  thruplay_rate: number | null;
  retention_rate: number | null;
  reactions_per_10k: number | null;
  comments_per_10k: number | null;
  shares_per_10k: number | null;
  saves_per_10k: number | null;
  engagement_per_10k: number | null;
  click_to_purchase_rate: number | null;
  click_to_checkout_rate: number | null;
  checkout_to_purchase_rate: number | null;
  reach_to_purchase_rate: number | null;
}

interface DailyAccum {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  purchases: number;
  purchaseValue: number;
  // 비율 지표 역산용 raw 값
  videoP3sRaw: number;
  thruplayRaw: number;
  p100Raw: number;
  reactionsRaw: number;
  commentsRaw: number;
  sharesRaw: number;
  savesRaw: number;
  engagementRaw: number;
  checkoutRaw: number;
  adCount: number;
}

function createAccum(): DailyAccum {
  return {
    impressions: 0, reach: 0, clicks: 0, spend: 0, purchases: 0, purchaseValue: 0,
    videoP3sRaw: 0, thruplayRaw: 0, p100Raw: 0,
    reactionsRaw: 0, commentsRaw: 0, sharesRaw: 0, savesRaw: 0, engagementRaw: 0,
    checkoutRaw: 0, adCount: 0,
  };
}

function addToAccum(acc: DailyAccum, row: RawInsightRow): void {
  const imp = row.impressions ?? 0;
  const clicks = row.clicks ?? 0;
  const p3sRaw = ((row.video_p3s_rate ?? 0) / 100) * imp;

  acc.impressions += imp;
  acc.reach = Math.max(acc.reach ?? 0, row.reach ?? 0);
  acc.clicks += clicks;
  acc.spend += row.spend ?? 0;
  acc.purchases += row.purchases ?? 0;
  acc.purchaseValue += row.purchase_value ?? 0;
  acc.videoP3sRaw += p3sRaw;
  acc.thruplayRaw += ((row.thruplay_rate ?? 0) / 100) * imp;
  acc.p100Raw += ((row.retention_rate ?? 0) / 100) * p3sRaw;
  acc.reactionsRaw += ((row.reactions_per_10k ?? 0) / 10000) * imp;
  acc.commentsRaw += ((row.comments_per_10k ?? 0) / 10000) * imp;
  acc.sharesRaw += ((row.shares_per_10k ?? 0) / 10000) * imp;
  acc.savesRaw += ((row.saves_per_10k ?? 0) / 10000) * imp;
  acc.engagementRaw += ((row.engagement_per_10k ?? 0) / 10000) * imp;
  acc.checkoutRaw += ((row.click_to_checkout_rate ?? 0) / 100) * clicks;
  acc.adCount += 1;
}

function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
