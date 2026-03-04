import { ProtractorAdminClient } from "./protractor-admin-client";
import { BenchmarkAdmin } from "../../protractor/components/benchmark-admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackfillSection } from "./backfill-section";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminProtractorPage() {
  // T8: 계정 목록 서버에서 조회 → BackfillSection에 전달
  const svc = createServiceClient();
  const { data: adAccounts } = await svc
    .from("ad_accounts")
    .select("account_id, account_name")
    .eq("active", true)
    .order("account_name");

  const backfillAccounts = (adAccounts ?? []).map((a) => ({
    account_id: a.account_id as string,
    account_name: (a.account_name ?? a.account_id) as string,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">총가치각도기 관리</h1>
        <p className="text-gray-500">
          계정별 Meta 데이터 동기화 상태를 확인하고 관리합니다.
        </p>
      </div>
      <BackfillSection accounts={backfillAccounts} />
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">계정 상태</TabsTrigger>
          <TabsTrigger value="benchmark">벤치마크</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4">
          <ProtractorAdminClient />
        </TabsContent>
        <TabsContent value="benchmark" className="mt-4">
          <BenchmarkAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}
