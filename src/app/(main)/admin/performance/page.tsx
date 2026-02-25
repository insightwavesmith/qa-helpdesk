import { getStudentPerformance } from "@/actions/performance";
import { PerformanceClient } from "./performance-client";

export const dynamic = "force-dynamic";

export default async function AdminPerformancePage() {
  const result = await getStudentPerformance();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">수강생 성과</h1>
        <p className="text-sm text-gray-500 mt-1">
          수강생별 광고 성과를 기수별로 확인하세요.
        </p>
      </div>

      <PerformanceClient
        initialRows={result.rows}
        initialSummary={result.summary}
        cohorts={result.cohorts}
      />
    </div>
  );
}
