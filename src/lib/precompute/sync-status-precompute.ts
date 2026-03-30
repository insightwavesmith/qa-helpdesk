/**
 * 계정 동기화 상태 사전계산 — ad_accounts + daily_ad_insights + mixpanel 상태
 */
import type { DbClient } from "@/lib/db";

export async function precomputeSyncStatus(
  supabase: DbClient
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    // 1) 전체 계정
    const { data: accounts, error: accountsError } = await supabase
      .from("ad_accounts")
      .select("account_id, account_name, mixpanel_project_id, mixpanel_board_id")
      .order("created_at", { ascending: false });

    if (accountsError) throw accountsError;
    if (!accounts || accounts.length === 0) return { computed, errors };

    const accountIds = accounts.map((a: any) => a.account_id); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 2) Meta 최근 3일 데이터
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split("T")[0];

    const { data: metaData } = await supabase
      .from("daily_ad_insights")
      .select("account_id, date, ad_id")
      .in("account_id", accountIds)
      .gte("date", threeDaysAgoStr)
      .order("date", { ascending: false });

    const metaStatusMap = new Map<string, { lastDate: string; adCount: number }>();
    for (const row of metaData || []) {
      const existing = metaStatusMap.get(row.account_id);
      if (!existing) {
        metaStatusMap.set(row.account_id, { lastDate: row.date, adCount: 1 });
      } else {
        if (row.date > existing.lastDate) existing.lastDate = row.date;
        existing.adCount++;
      }
    }

    // 3) service_secrets 유무 체크 (status/route.ts 실시간 경로와 동일)
    const secretKeyNames = accountIds.map((id: string) => `secret_${id}`);
    const { data: secrets } = await supabase
      .from("service_secrets" as never)
      .select("key_name" as never)
      .eq("service" as never, "mixpanel")
      .in("key_name" as never, secretKeyNames);

    const secretSet = new Set(
      ((secrets || []) as unknown as { key_name: string }[]).map((s) =>
        s.key_name.replace("secret_", "")
      )
    );

    // 3b) Mixpanel 데이터 존재 여부
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const { data: mixpanelData } = await supabase
      .from("daily_mixpanel_insights" as never)
      .select("account_id" as never)
      .in("account_id" as never, accountIds)
      .gte("date" as never, sevenDaysAgoStr);

    const mixpanelDataSet = new Set(
      ((mixpanelData || []) as unknown as { account_id: string }[]).map((d) => d.account_id)
    );

    // 4) UPSERT each account
    for (const acc of accounts) {
      const meta = metaStatusMap.get(acc.account_id);
      const metaOk = !!meta;

      const hasSecret = secretSet.has(acc.account_id);
      const hasProjectId = !!acc.mixpanel_project_id;
      const hasData = mixpanelDataSet.has(acc.account_id);
      const isConfigured = hasSecret || hasProjectId;

      let mixpanelState: string;
      let mixpanelOk: boolean;

      if (isConfigured && hasData) {
        mixpanelState = "ok";
        mixpanelOk = true;
      } else if (isConfigured && !hasData) {
        mixpanelState = "no_board";
        mixpanelOk = false;
      } else {
        mixpanelState = "not_configured";
        mixpanelOk = false;
      }

      await supabase
        .from("account_sync_status" as never)
        .upsert(
          {
            account_id: acc.account_id,
            account_name: acc.account_name,
            meta_ok: metaOk,
            meta_last_date: meta?.lastDate || null,
            meta_ad_count: meta?.adCount || 0,
            mixpanel_ok: mixpanelOk,
            mixpanel_state: mixpanelState,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "account_id" } as never
        );
      computed++;
    }
  } catch (err) {
    errors.push(`sync-status: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { computed, errors };
}
