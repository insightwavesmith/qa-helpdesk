import { getOwnerAdSummaries } from "@/actions/performance";
import { OwnerAccountsClient } from "./owner-accounts-client";

export const dynamic = "force-dynamic";

export default async function AdminOwnerAccountsPage() {
  const result = await getOwnerAdSummaries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">내 광고계정 성과</h1>
        <p className="text-sm text-gray-500 mt-1">
          관리 중인 광고계정의 성과 요약을 확인하세요.
        </p>
      </div>

      <OwnerAccountsClient
        rows={result.rows}
        totalAccounts={result.totalAccounts}
        totalSpend={result.totalSpend}
        avgRoas={result.avgRoas}
      />
    </div>
  );
}
