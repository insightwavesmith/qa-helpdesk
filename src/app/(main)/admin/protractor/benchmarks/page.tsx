import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BenchmarkAdmin } from "@/app/(main)/protractor/components/benchmark-admin";

/**
 * 관리자 전용 벤치마크 관리 페이지
 * 벤치마크 데이터 확인 + 수동 재수집
 */
export default async function BenchmarkManagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">벤치마크 관리</h1>
        <p className="text-gray-500">
          GCP 방식 벤치마크 데이터를 확인하고 수동으로 재수집합니다.
        </p>
      </div>
      <BenchmarkAdmin />
    </div>
  );
}
