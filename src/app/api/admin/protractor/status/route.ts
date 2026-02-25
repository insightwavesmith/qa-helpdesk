import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // 인증 + admin 권한 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    // 1) 전체 계정 목록
    const { data: accounts, error: accountsError } = await svc
      .from("ad_accounts")
      .select("id, account_id, account_name, created_at")
      .order("created_at", { ascending: false });

    if (accountsError) throw accountsError;

    const accountIds = (accounts || []).map((a) => a.account_id);

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
    const secretKeyNames = accountIds.map((id) => `secret_${id}`);
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

    // 4) 결과 조합
    const result = (accounts || []).map((acc) => {
      const meta = metaStatusMap.get(acc.account_id);
      const hasSecret = secretSet.has(acc.account_id);

      const metaOk = !!meta;
      const mixpanelOk = false;

      const mixpanelState: "no_data" | "not_configured" = hasSecret ? "no_data" : "not_configured";

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
      metaOk: result.filter((r) => r.meta.ok).length,
      mixpanelOk: result.filter((r) => r.mixpanel.ok).length,
      error: result.filter((r) => !r.meta.ok || !r.mixpanel.ok).length,
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
