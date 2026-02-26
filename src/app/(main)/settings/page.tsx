import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone, shop_name, shop_url, meta_account_id, mixpanel_project_id, mixpanel_secret_key, mixpanel_board_id, annual_revenue")
    .eq("id", user.id)
    .single();

  // 광고계정 목록 조회 (활성 계정만)
  const svc = createServiceClient();
  const { data: adAccounts } = await svc
    .from("ad_accounts")
    .select("id, account_id, account_name, mixpanel_project_id, mixpanel_board_id, active")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  return (
    <SettingsForm
      profile={profile}
      userId={user.id}
      accounts={adAccounts ?? []}
    />
  );
}
