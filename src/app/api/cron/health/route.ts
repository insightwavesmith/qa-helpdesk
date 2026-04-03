import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_CRONS: { name: string; expectedInterval: string }[] = [
  { name: "collect-daily", expectedInterval: "1d" },
  { name: "collect-daily-1", expectedInterval: "1d" },
  { name: "collect-daily-2", expectedInterval: "1d" },
  { name: "collect-daily-3", expectedInterval: "1d" },
  { name: "collect-daily-4", expectedInterval: "1d" },
  { name: "process-media", expectedInterval: "1d" },
  { name: "embed-creatives", expectedInterval: "1d" },
  { name: "creative-saliency", expectedInterval: "1d" },
  { name: "video-saliency", expectedInterval: "1d" },
  { name: "video-scene-analysis", expectedInterval: "1d" },
  { name: "run-prescription", expectedInterval: "1d" },
  { name: "discover-accounts", expectedInterval: "7d" },
  { name: "organic-benchmark", expectedInterval: "1d" },
  { name: "backfill-ai-answers", expectedInterval: "1d" },
  { name: "publish-scheduled", expectedInterval: "1d" },
  { name: "analyze-lp-saliency", expectedInterval: "1d" },
  { name: "precompute", expectedInterval: "1d" },
  { name: "analyze-competitors", expectedInterval: "7d" },
  { name: "competitor-check", expectedInterval: "7d" },
  { name: "crawl-lps", expectedInterval: "1d" },
  { name: "track-performance", expectedInterval: "1d" },
  { name: "cleanup-deleted", expectedInterval: "7d" },
];

function isHealthy(
  data: { finished_at?: string; status?: string } | null,
  interval: string,
): boolean {
  if (!data?.finished_at) return false;
  if (data.status === "error") return false;
  const elapsed = Date.now() - new Date(data.finished_at).getTime();
  const maxMs =
    interval === "7d"
      ? 7 * 24 * 3600 * 1000 * 1.5
      : 24 * 3600 * 1000 * 1.5;
  return elapsed < maxMs;
}

function verifyCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const results: Array<{
    name: string;
    lastRun: string | null;
    lastStatus: string;
    recordsCount: number;
    healthy: boolean;
  }> = [];

  for (const cron of ALL_CRONS) {
    const { data } = await svc
      .from("cron_runs")
      .select("status, finished_at, records_count, error_message")
      .eq("cron_name", cron.name)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    results.push({
      name: cron.name,
      lastRun: data?.finished_at ?? null,
      lastStatus: data?.status ?? "never",
      recordsCount: data?.records_count ?? 0,
      healthy: isHealthy(data, cron.expectedInterval),
    });
  }

  const healthyCount = results.filter((r) => r.healthy).length;
  const unhealthyCount = results.length - healthyCount;
  const status =
    unhealthyCount === 0
      ? "ok"
      : unhealthyCount <= 3
        ? "degraded"
        : "critical";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    total: results.length,
    healthy: healthyCount,
    unhealthy: unhealthyCount,
    crons: results,
  });
}
