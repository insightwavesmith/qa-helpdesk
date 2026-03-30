/**
 * GET /api/cron/track-performance
 * 성과 변화 추적 크론 — change_log의 미처리 항목에 before/after 7일 성과 데이터 채움
 * Cloud Run Cron: 매일 1회 또는 수동 호출
 *
 * 동작:
 *   1. change_log에서 performance_before IS NULL인 항목 조회 (최대 50건)
 *   2. 각 항목의 entity_type이 'creative'면 → creatives 테이블에서 ad_id 조회
 *   3. change_detected_at 기준 before 7일 / after 7일 daily_ad_insights 평균 계산
 *   4. performance_before, performance_after, performance_change 업데이트
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 50;
const DAYS_WINDOW = 7;

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

interface PerformanceMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  ctr: number;
  cpc: number;
  days: number;
}

function computeAvg(
  rows: Array<{
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    purchases: number | null;
    purchase_value: number | null;
    roas: number | null;
    ctr: number | null;
  }>,
): PerformanceMetrics | null {
  if (!rows || rows.length === 0) return null;

  const n = rows.length;
  const sum = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    purchase_value: 0,
    roas: 0,
    ctr: 0,
  };

  for (const r of rows) {
    sum.spend += r.spend ?? 0;
    sum.impressions += r.impressions ?? 0;
    sum.clicks += r.clicks ?? 0;
    sum.purchases += r.purchases ?? 0;
    sum.purchase_value += r.purchase_value ?? 0;
    sum.roas += r.roas ?? 0;
    sum.ctr += r.ctr ?? 0;
  }

  return {
    spend: round2(sum.spend / n),
    impressions: round2(sum.impressions / n),
    clicks: round2(sum.clicks / n),
    purchases: round2(sum.purchases / n),
    purchase_value: round2(sum.purchase_value / n),
    roas: round2(sum.roas / n),
    ctr: round2(sum.ctr / n),
    cpc: sum.clicks > 0 ? round2(sum.spend / sum.clicks) : 0,
    days: n,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function computeChange(
  before: PerformanceMetrics,
  after: PerformanceMetrics,
): Record<string, number> {
  const change: Record<string, number> = {};
  const keys: (keyof PerformanceMetrics)[] = [
    "spend",
    "impressions",
    "clicks",
    "purchases",
    "purchase_value",
    "roas",
    "ctr",
    "cpc",
  ];

  for (const key of keys) {
    const b = before[key] as number;
    const a = after[key] as number;
    if (b === 0) {
      change[`${key}_diff`] = a;
      change[`${key}_pct`] = a > 0 ? 100 : 0;
    } else {
      change[`${key}_diff`] = round2(a - b);
      change[`${key}_pct`] = round2(((a - b) / Math.abs(b)) * 100);
    }
  }

  return change;
}

function computeConfidence(
  before: PerformanceMetrics | null,
  after: PerformanceMetrics | null,
): "low" | "medium" | "high" {
  if (!before || !after) return "low";
  if (before.days < 3 || after.days < 3) return "low";
  if (before.days >= 5 && after.days >= 5) return "high";
  return "medium";
}

export async function GET(req: NextRequest) {
  return handleTrack(req);
}

export async function POST(req: NextRequest) {
  return handleTrack(req);
}

async function handleTrack(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  const stats = { processed: 0, skipped: 0, errors: 0, noData: 0 };

  try {
    // 1. change_log에서 performance_before가 NULL인 항목 (미처리)
    const { data: pendingLogs, error: fetchErr } = await db
      .from("change_log")
      .select("id, entity_type, entity_id, account_id, change_detected_at")
      .is("performance_before", null)
      .order("change_detected_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      return NextResponse.json(
        { error: "change_log 조회 실패", detail: fetchErr.message },
        { status: 500 },
      );
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      return NextResponse.json({
        message: "처리할 change_log 없음",
        ...stats,
      });
    }

    // 2. 각 change_log 처리
    for (const log of pendingLogs as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      account_id: string;
      change_detected_at: string;
    }>) {
      try {
        // entity_type에 따라 ad_id 조회
        let adId: string | null = null;

        if (log.entity_type === "creative") {
          // creatives 테이블에서 ad_id 가져오기
          const { data: creative } = await db
            .from("creatives")
            .select("ad_id")
            .eq("id", log.entity_id)
            .single();

          adId = creative?.ad_id ?? null;
        } else if (log.entity_type === "lp") {
          // LP는 직접 ad_id가 없음 → creative_lp_map에서 연결된 소재들 조회
          const { data: mappings } = await db
            .from("creative_lp_map")
            .select("creative_id")
            .eq("lp_id", log.entity_id)
            .limit(1);

          if (mappings && mappings.length > 0) {
            const { data: creative } = await db
              .from("creatives")
              .select("ad_id")
              .eq("id", mappings[0].creative_id)
              .single();

            adId = creative?.ad_id ?? null;
          }
        }

        if (!adId) {
          // ad_id 없으면 성과 추적 불가 → 빈 값으로 마킹 (재시도 방지)
          await db
            .from("change_log")
            .update({
              performance_before: {},
              performance_after: {},
              performance_change: {},
              confidence: "low",
            })
            .eq("id", log.id);

          stats.noData++;
          continue;
        }

        // 3. before/after 7일 성과 데이터 조회
        const changeDate = new Date(log.change_detected_at);
        const beforeStart = new Date(
          changeDate.getTime() - DAYS_WINDOW * 24 * 60 * 60 * 1000,
        );
        const afterEnd = new Date(
          changeDate.getTime() + DAYS_WINDOW * 24 * 60 * 60 * 1000,
        );

        const beforeStartStr = beforeStart.toISOString().split("T")[0];
        const changeDateStr = changeDate.toISOString().split("T")[0];
        const afterEndStr = afterEnd.toISOString().split("T")[0];

        // before 기간: change_detected_at - 7일 ~ change_detected_at
        const { data: beforeRows } = await db
          .from("daily_ad_insights")
          .select(
            "spend, impressions, clicks, purchases, purchase_value, roas, ctr",
          )
          .eq("ad_id", adId)
          .gte("date", beforeStartStr)
          .lt("date", changeDateStr);

        // after 기간: change_detected_at ~ change_detected_at + 7일
        const { data: afterRows } = await db
          .from("daily_ad_insights")
          .select(
            "spend, impressions, clicks, purchases, purchase_value, roas, ctr",
          )
          .eq("ad_id", adId)
          .gte("date", changeDateStr)
          .lte("date", afterEndStr);

        const beforeAvg = computeAvg(beforeRows ?? []);
        const afterAvg = computeAvg(afterRows ?? []);

        const perfChange =
          beforeAvg && afterAvg ? computeChange(beforeAvg, afterAvg) : {};

        const confidence = computeConfidence(beforeAvg, afterAvg);

        // 4. change_log 업데이트
        const { error: updateErr } = await db
          .from("change_log")
          .update({
            performance_before: beforeAvg ?? {},
            performance_after: afterAvg ?? {},
            performance_change: perfChange,
            confidence,
          })
          .eq("id", log.id);

        if (updateErr) {
          console.error(
            `[track-performance] update 실패 (${log.id}):`,
            updateErr.message,
          );
          stats.errors++;
        } else {
          stats.processed++;
        }
      } catch (err) {
        console.error(`[track-performance] 항목 처리 실패 (${log.id}):`, err);
        stats.errors++;
      }
    }

    return NextResponse.json({
      message: "성과 변화 추적 완료",
      total: pendingLogs.length,
      ...stats,
    });
  } catch (err) {
    console.error("[track-performance] Fatal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), ...stats },
      { status: 500 },
    );
  }
}
