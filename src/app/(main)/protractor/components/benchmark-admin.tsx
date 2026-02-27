"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Info, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// 타입 정의
// ============================================================

interface BenchmarkAdminRow {
  id?: string;
  creative_type: string;
  ranking_type: string;
  ranking_group: string;
  sample_count?: number;
  calculated_at?: string;
  // 13개 지표 (avg_ prefix)
  avg_video_p3s_rate?: number;
  avg_thruplay_rate?: number;
  avg_retention_rate?: number;
  avg_reactions_per_10k?: number;
  avg_comments_per_10k?: number;
  avg_shares_per_10k?: number;
  avg_saves_per_10k?: number;
  avg_engagement_per_10k?: number;
  avg_ctr?: number;
  avg_click_to_checkout_rate?: number;
  avg_click_to_purchase_rate?: number;
  avg_checkout_to_purchase_rate?: number;
  avg_roas?: number;
  [key: string]: string | number | undefined;
}

// ============================================================
// 지표 목록
// ============================================================

const METRIC_DEFS: { label: string; key: string }[] = [
  { label: "3초 시청률", key: "avg_video_p3s_rate" },
  { label: "ThruPlay율", key: "avg_thruplay_rate" },
  { label: "지속 비율", key: "avg_retention_rate" },
  { label: "좋아요/만노출", key: "avg_reactions_per_10k" },
  { label: "댓글/만노출", key: "avg_comments_per_10k" },
  { label: "공유/만노출", key: "avg_shares_per_10k" },
  { label: "저장/만노출", key: "avg_saves_per_10k" },
  { label: "참여/만노출", key: "avg_engagement_per_10k" },
  { label: "CTR", key: "avg_ctr" },
  { label: "클릭→결제시작", key: "avg_click_to_checkout_rate" },
  { label: "클릭→구매", key: "avg_click_to_purchase_rate" },
  { label: "결제→구매", key: "avg_checkout_to_purchase_rate" },
  { label: "ROAS", key: "avg_roas" },
];

const CREATIVE_TYPES = ["VIDEO", "IMAGE", "CATALOG"] as const;
type CreativeType = (typeof CREATIVE_TYPES)[number];

const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  VIDEO: "영상",
  IMAGE: "이미지",
  CATALOG: "카탈로그",
};

const RANKING_TYPES = ["engagement", "conversion", "quality"] as const;
type RankingType = (typeof RANKING_TYPES)[number];

const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  engagement: "참여도",
  conversion: "전환율",
  quality: "품질",
};

const GROUP_LABELS: Record<string, string> = {
  above_avg: "상위 (ABOVE_AVERAGE)",
  average: "평균 (AVERAGE)",
  below_average: "하위 (BELOW_AVERAGE)",
};

// ============================================================
// 포맷 헬퍼
// ============================================================

function fmtVal(key: string, val: number | undefined): string {
  if (val == null) return "-";
  const isPercent = key.includes("rate") || key.includes("ctr");
  const isRoas = key.includes("roas");
  if (isRoas) return val.toFixed(2);
  if (isPercent) return val.toFixed(2) + "%";
  return val.toFixed(1);
}

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

// ============================================================
// 지표 테이블 (ranking_type × ranking_group)
// ============================================================

function MetricTable({
  rows,
  creativeType,
}: {
  rows: BenchmarkAdminRow[];
  creativeType: CreativeType;
}) {
  const filtered = rows.filter((r) => r.creative_type === creativeType);

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        해당 크리에이티브 타입 데이터 없음
      </div>
    );
  }

  // ranking_type별로 그루핑
  const byType: Record<string, BenchmarkAdminRow[]> = {};
  for (const row of filtered) {
    if (!byType[row.ranking_type]) byType[row.ranking_type] = [];
    byType[row.ranking_type].push(row);
  }

  const rankingTypes = RANKING_TYPES.filter((t) => byType[t]);

  return (
    <div className="space-y-6">
      {rankingTypes.map((rankType) => {
        const typeRows = byType[rankType] ?? [];
        // ranking_group 순서: above_avg → average → below_average
        const orderedGroups = ["above_avg", "average", "below_average"];
        const groups = orderedGroups.filter((g) => typeRows.some((r) => r.ranking_group === g));

        // sample_count, calculated_at 대표값
        const sampleCount = typeRows[0]?.sample_count;
        const calcAt = typeRows[0]?.calculated_at;

        return (
          <div key={rankType}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">
                {RANKING_TYPE_LABELS[rankType] ?? rankType}
              </span>
              {sampleCount != null && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                  샘플 {sampleCount.toLocaleString("ko-KR")}개
                </span>
              )}
              {calcAt && (
                <span className="text-[11px] text-gray-400">수집: {fmtDate(calcAt)}</span>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-600">지표</TableHead>
                    {groups.map((g) => (
                      <TableHead key={g} className="text-right text-xs font-semibold text-gray-600">
                        {GROUP_LABELS[g] ?? g}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRIC_DEFS.map((metric) => (
                    <TableRow key={metric.key} className="hover:bg-gray-50/50">
                      <TableCell className="text-xs text-gray-700">{metric.label}</TableCell>
                      {groups.map((g) => {
                        const row = typeRows.find((r) => r.ranking_group === g);
                        const val = row?.[metric.key] as number | undefined;
                        return (
                          <TableCell
                            key={g}
                            className={`text-right text-xs font-medium ${
                              g === "above_avg"
                                ? "text-green-700"
                                : g === "below_average"
                                ? "text-red-600"
                                : "text-gray-700"
                            }`}
                          >
                            {fmtVal(metric.key, val)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function BenchmarkAdmin() {
  const [rows, setRows] = useState<BenchmarkAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);
  const [creativeTab, setCreativeTab] = useState<CreativeType>("VIDEO");

  // 벤치마크 데이터 로드
  const loadBenchmarks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/protractor/benchmarks");
      const json = await res.json();
      if (res.ok && json.data) {
        setRows(json.data as BenchmarkAdminRow[]);
      }
    } catch {
      // 에러 무시
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBenchmarks();
  }, []);

  // 수동 재수집
  const handleCollect = async () => {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch("/api/protractor/benchmarks/collect", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        setCollectMsg("재수집이 완료되었습니다. 데이터를 새로고침합니다.");
        await loadBenchmarks();
      } else {
        setCollectMsg(json.error ?? "재수집 중 오류가 발생했습니다.");
      }
    } catch {
      setCollectMsg("재수집 요청에 실패했습니다.");
    } finally {
      setCollecting(false);
    }
  };

  // 최근 수집 이력 (calculated_at 기준 최근 5건)
  const historyDates = Array.from(
    new Set(
      rows
        .filter((r) => r.calculated_at)
        .map((r) => fmtDate(r.calculated_at))
    )
  )
    .sort()
    .reverse()
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 계산 방식 안내 배너 */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">벤치마크 계산 방식</span>
        </div>
        <ul className="space-y-1 text-xs text-blue-700">
          <li>
            <span className="font-medium">모집단:</span> 전체 활성 광고 계정
          </li>
          <li>
            <span className="font-medium">필터:</span> impressions ≥ 3,500, ACTIVE 광고만
          </li>
          <li>
            <span className="font-medium">분류:</span>{" "}
            creative_type × ranking_type × ranking_group 조합
          </li>
        </ul>
      </div>

      {/* 수동 재수집 */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Database className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">벤치마크 수동 재수집</p>
            <p className="text-xs text-gray-500">
              전체 광고 데이터를 기반으로 벤치마크를 다시 계산합니다
            </p>
          </div>
        </div>
        <Button
          onClick={handleCollect}
          disabled={collecting}
          className="bg-[#F75D5D] text-white hover:bg-[#E54949]"
          size="sm"
        >
          {collecting ? (
            <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          {collecting ? "수집 중..." : "벤치마크 재수집"}
        </Button>
      </div>

      {/* 수집 메시지 */}
      {collectMsg && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
          {collectMsg}
        </div>
      )}

      {/* 수집 이력 */}
      {historyDates.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-gray-500">최근 수집 이력 (최대 5회)</p>
          <div className="flex flex-wrap gap-2">
            {historyDates.map((d, i) => (
              <span
                key={d}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  i === 0
                    ? "bg-[#F75D5D]/10 font-semibold text-[#F75D5D]"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {i === 0 ? "최신 " : ""}{d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 벤치마크 데이터 테이블 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-bold text-gray-900">크리에이티브 타입별 벤치마크 값</h3>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Database className="h-8 w-8" />
            <p className="mt-2 text-sm">벤치마크 데이터가 없습니다</p>
            <p className="mt-1 text-xs">재수집 버튼을 눌러 데이터를 수집하세요</p>
          </div>
        ) : (
          <Tabs
            value={creativeTab}
            onValueChange={(v) => setCreativeTab(v as CreativeType)}
          >
            <TabsList className="mb-4">
              {CREATIVE_TYPES.map((ct) => (
                <TabsTrigger key={ct} value={ct}>
                  {CREATIVE_TYPE_LABELS[ct]}
                </TabsTrigger>
              ))}
            </TabsList>

            {CREATIVE_TYPES.map((ct) => (
              <TabsContent key={ct} value={ct}>
                <MetricTable rows={rows} creativeType={ct} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
