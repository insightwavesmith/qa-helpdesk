import { AccountsClient } from "./accounts-client";

export default function AdminAccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">광고계정 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          수강생에게 광고계정을 배정합니다.
        </p>
      </div>

      <AccountsClient />
    </div>
  );
}
