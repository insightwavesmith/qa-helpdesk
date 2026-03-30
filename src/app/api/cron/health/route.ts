import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

function verifyCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date();

  const cronNames = ["collect-daily", "collect-mixpanel", "collect-benchmarks"];
  const checks: Record<string, { lastRun: string | null; status: string | null; ok: boolean }> = {};
  const missing: string[] = [];

  for (const name of cronNames) {
    // collect-benchmarks는 주 1회이므로 7일 기준
    const hoursThreshold = name === "collect-benchmarks" ? 168 : 25;
    const since = new Date(now.getTime() - hoursThreshold * 60 * 60 * 1000).toISOString();

    const { data } = await db
      .from("cron_runs")
      .select("started_at, status")
      .eq("cron_name", name)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      checks[name] = { lastRun: data[0].started_at, status: data[0].status, ok: true };
    } else {
      checks[name] = { lastRun: null, status: null, ok: false };
      missing.push(name);
    }
  }

  return NextResponse.json({
    healthy: missing.length === 0,
    checks,
    missing,
    checkedAt: now.toISOString(),
  });
}
