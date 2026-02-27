import { Suspense } from "react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RealDashboard from "./real-dashboard";
import SampleDashboard from "./sample-dashboard";

/**
 * 접근 분기:
 * - admin → 실제 대시보드
 * - student/member + 광고계정 연결 → 실제 대시보드
 * - student/member 미연결 → 샘플 대시보드 (광고계정 연결 안내)
 */
export default async function ProtractorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SampleDashboard bannerType="member" />;
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  const role = profile.role;

  // admin → 실제 대시보드
  if (role === "admin") {
    return <Suspense><RealDashboard /></Suspense>;
  }

  // student/member → 광고계정 연결 여부 확인
  if (role === "student" || role === "member") {
    const { data: adAccounts } = await svc
      .from("ad_accounts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    const hasAdAccount = adAccounts && adAccounts.length > 0;

    if (hasAdAccount) {
      return <Suspense><RealDashboard /></Suspense>;
    }

    // 미연결 수강생 → 샘플 + 연결 안내
    return <SampleDashboard bannerType="unlinked" />;
  }

  // member → 샘플 + 수강 안내
  return <SampleDashboard bannerType="member" />;
}
