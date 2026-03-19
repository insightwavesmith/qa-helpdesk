import { Suspense } from "react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CreativeAnalysis from "./creative-analysis";

/**
 * /protractor/creatives — 소재 분석 페이지
 * 접근 분기:
 * - admin → 전체 ad_accounts 조회
 * - student/member + 광고계정 연결 → 본인 계정 조회
 * - 미연결 → 안내 메시지
 */
export default async function CreativesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <NoAccountGuide type="member" />;
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return <NoAccountGuide type="member" />;
  }

  const role = profile.role;

  // admin → 전체 계정 조회
  if (role === "admin") {
    const { data: allAccounts } = await svc
      .from("ad_accounts")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });

    return (
      <Suspense>
        <CreativeAnalysis initialAccounts={allAccounts ?? []} />
      </Suspense>
    );
  }

  // student/member → 본인 계정 조회
  if (role === "student" || role === "member") {
    const { data: adAccounts } = await svc
      .from("ad_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    const hasAdAccount = adAccounts && adAccounts.length > 0;

    if (hasAdAccount) {
      return (
        <Suspense>
          <CreativeAnalysis initialAccounts={adAccounts} />
        </Suspense>
      );
    }

    return <NoAccountGuide type="unlinked" />;
  }

  return <NoAccountGuide type="member" />;
}

function NoAccountGuide({ type }: { type: "member" | "unlinked" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        {type === "unlinked"
          ? "광고계정을 연결해주세요"
          : "소재 분석은 수강생 전용 기능입니다"}
      </h2>
      <p className="text-sm text-gray-500 max-w-sm">
        {type === "unlinked"
          ? "메타 광고계정을 연결하면 소재 분석 기능을 이용할 수 있습니다."
          : "자사몰사관학교 수강생으로 등록되어야 이용 가능합니다."}
      </p>
    </div>
  );
}
