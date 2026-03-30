import { NextResponse } from "next/server";
import { requireAdmin } from "../../_shared";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    // 캐시 우선 조회 (Phase 2)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cached, error: cacheErr } = await (svc as any)
        .from("account_sync_status")
        .select("account_id, account_name, meta_ok, meta_last_date, meta_ad_count, mixpanel_ok, mixpanel_state, updated_at");

      if (!cacheErr && cached && cached.length > 0) {
        const newest = cached[0];
        const age = Date.now() - new Date(newest.updated_at).getTime();
        if (age < 60 * 60 * 1000) { // 1시간 이내
          // ad_accounts에서 id, created_at 보충
          const { data: accounts } = await svc
            .from("ad_accounts")
            .select("id, account_id, created_at")
            .order("created_at", { ascending: false });

          const accountMap = new Map((accounts || []).map((a: { id: string; account_id: string; created_at: string | null }) => [a.account_id, a]));

          const result = cached.map((c: Record<string, unknown>) => {
            const acc = accountMap.get(c.account_id as string) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            return {
              id: acc?.id || c.account_id,
              account_id: c.account_id,
              account_name: c.account_name,
              created_at: acc?.created_at || null,
              meta: {
                ok: c.meta_ok,
                last_date: c.meta_last_date || null,
                ad_count: c.meta_ad_count || 0,
              },
              mixpanel: {
                ok: c.mixpanel_ok,
                state: c.mixpanel_state || "not_configured",
                last_date: null,
                sessions: 0,
              },
            };
          });

          const stats = {
            total: result.length,
            metaOk: result.filter((r: { meta: { ok: boolean } }) => r.meta.ok).length,
            mixpanelOk: result.filter((r: { mixpanel: { ok: boolean } }) => r.mixpanel.ok).length,
            error: result.filter((r: { meta: { ok: boolean }; mixpanel: { ok: boolean } }) => !r.meta.ok || !r.mixpanel.ok).length,
          };

          return NextResponse.json({ accounts: result, stats });
        }
      }
    } catch {
      // 캐시 테이블 없으면 폴백
    }

    // 폴백: 기존 실시간 조회
    // 1) 전체 계정 목록
    const { data: accounts, error: accountsError } = await svc
      .from("ad_accounts")
      .select("id, account_id, account_name, mixpanel_project_id, mixpanel_board_id, created_at")
      .order("created_at", { ascending: false });

    if (accountsError) throw accountsError;

    const accountIds = (accounts || []).map((a: any) => a.account_id); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (accountIds.length === 0) {
      return NextResponse.json({
        accounts: [],
        stats: {
          total: 0,
          metaOk: 0,
          mixpanelOk: 0,
          error: 0,
        },
      });
    }

    // 2) Meta 최신 수집일 + 광고 수 (최근 3일 내 데이터)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split("T")[0];

    const { data: metaData } = await svc
      .from("daily_ad_insights")
      .select("account_id, date, ad_id")
      .in("account_id", accountIds)
      .gte("date", threeDaysAgoStr)
      .order("date", { ascending: false });

    // 계정별 Meta 상태 집계
    const metaStatusMap = new Map<
      string,
      { lastDate: string; adCount: number }
    >();
    for (const row of metaData || []) {
      const existing = metaStatusMap.get(row.account_id);
      if (!existing) {
        metaStatusMap.set(row.account_id, {
          lastDate: row.date,
          adCount: 1,
        });
      } else {
        if (row.date > existing.lastDate) existing.lastDate = row.date;
        existing.adCount++;
      }
    }

    // 3) service_secrets 유무 체크
    const secretKeyNames = accountIds.map((id: any) => `secret_${id}`); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: secrets } = await svc
      .from("service_secrets" as never)
      .select("key_name" as never)
      .eq("service" as never, "mixpanel")
      .in("key_name" as never, secretKeyNames);

    const secretSet = new Set(
      ((secrets || []) as { key_name: string }[]).map((s) =>
        s.key_name.replace("secret_", "")
      )
    );

    // 3b) daily_mixpanel_insights 최근 7일 데이터 존재 여부
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const { data: mixpanelData } = await svc
      .from("daily_mixpanel_insights" as never)
      .select("account_id, date" as never)
      .in("account_id" as never, accountIds)
      .gte("date" as never, sevenDaysAgoStr)
      .order("date" as never, { ascending: false });

    const mixpanelDataSet = new Set(
      ((mixpanelData || []) as { account_id: string }[]).map((d) => d.account_id)
    );

    // 4) 결과 조합
    const result = (accounts || []).map((acc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const meta = metaStatusMap.get(acc.account_id);

      const metaOk = !!meta;

      const hasSecret = secretSet.has(acc.account_id);
      const hasProjectId = !!acc.mixpanel_project_id;
      const hasData = mixpanelDataSet.has(acc.account_id);

      // Mixpanel 설정 = service_secrets 시크릿 OR ad_accounts.mixpanel_project_id
      const isConfigured = hasSecret || hasProjectId;

      let mixpanelState: "ok" | "no_board" | "not_configured";
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

      return {
        id: acc.id,
        account_id: acc.account_id,
        account_name: acc.account_name,
        created_at: acc.created_at,
        meta: {
          ok: metaOk,
          last_date: meta?.lastDate || null,
          ad_count: meta?.adCount || 0,
        },
        mixpanel: {
          ok: mixpanelOk,
          state: mixpanelState,
          last_date: null,
          sessions: 0,
        },
      };
    });

    const stats = {
      total: result.length,
      metaOk: result.filter((r: any) => r.meta.ok).length, // eslint-disable-line @typescript-eslint/no-explicit-any
      mixpanelOk: result.filter((r: any) => r.mixpanel.ok).length, // eslint-disable-line @typescript-eslint/no-explicit-any
      error: result.filter((r: any) => !r.meta.ok || !r.mixpanel.ok).length, // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    return NextResponse.json({ accounts: result, stats });
  } catch (error) {
    console.error("Admin protractor status error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
