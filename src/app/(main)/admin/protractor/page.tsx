import { ProtractorAdminClient } from "./protractor-admin-client";

export default function AdminProtractorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">총가치각도기 관리</h1>
        <p className="text-gray-500">
          계정별 Meta / Mixpanel 데이터 동기화 상태를 확인합니다.
        </p>
      </div>
      <ProtractorAdminClient />
    </div>
  );
}
