import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";
import { PageViewTracker } from "@/components/tracking/page-view-tracker";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("name, phone, shop_name, shop_url, meta_account_id, mixpanel_project_id, mixpanel_secret_key, mixpanel_board_id, annual_revenue")
    .eq("id", user.uid)
    .single();

  // 광고계정 목록 조회 (활성 계정만)
  const { data: adAccounts } = await svc
    .from("ad_accounts")
    .select("id, account_id, account_name, mixpanel_project_id, mixpanel_board_id, active")
    .eq("user_id", user.uid)
    .eq("active", true)
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-3xl mx-auto">
      <PageViewTracker event="settings_viewed" />
      <SettingsForm
        profile={profile}
        userId={user.uid}
        accounts={adAccounts ?? []}
      />
    </div>
  );
}
