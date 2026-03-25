import { Suspense } from "react";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/db";
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
  const user = await getCurrentUser();

  if (!user) {
    return <SampleDashboard bannerType="member" />;
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  const role = profile.role;

  // admin → 실제 대시보드 (전체 계정 조회)
  if (role === "admin") {
    const { data: allAccounts } = await svc
      .from("ad_accounts")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    return <Suspense><RealDashboard initialAccounts={allAccounts ?? []} /></Suspense>;
  }

  // student/member → 광고계정 연결 여부 확인
  if (role === "student" || role === "member") {
    const { data: adAccounts } = await svc
      .from("ad_accounts")
      .select("*")
      .eq("user_id", user.uid)
      .eq("active", true)
      .order("created_at", { ascending: false });

    const hasAdAccount = adAccounts && adAccounts.length > 0;

    if (hasAdAccount) {
      return <Suspense><RealDashboard initialAccounts={adAccounts} /></Suspense>;
    }

    // 미연결 수강생 → 샘플 + 연결 안내
    return <SampleDashboard bannerType="unlinked" />;
  }

  // member → 샘플 + 수강 안내
  return <SampleDashboard bannerType="member" />;
}
