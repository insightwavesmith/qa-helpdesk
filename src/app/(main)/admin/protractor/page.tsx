import { ProtractorAdminClient } from "./protractor-admin-client";
import { BenchmarkAdmin } from "../../protractor/components/benchmark-admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecollectButtons } from "./recollect-buttons";

export default function AdminProtractorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">총가치각도기 관리</h1>
        <p className="text-gray-500">
          계정별 Meta / Mixpanel 데이터 동기화 상태를 확인합니다.
        </p>
      </div>
      <RecollectButtons />
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
