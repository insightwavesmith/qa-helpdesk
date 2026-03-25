/**
 * POST /api/admin/backfill
 * T10: 백필 통합 — 광고데이터 + 믹스패널 + 타겟중복 3종 SSE 스트리밍
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { fetchAccountAds, buildInsightRows, upsertInsights } from "@/lib/protractor/meta-collector";
import { fetchMixpanelRevenue, lookupMixpanelSecret } from "@/lib/protractor/mixpanel-collector";
import {
  fetchActiveAdsets,
  fetchCombinedReach,
  fetchPerAdsetReach,
  makePairKey,
} from "@/lib/protractor/overlap-utils";

// ── SSE 타입 ──────────────────────────────────────────────────
type PhaseName = "ad" | "mixpanel" | "overlap";

interface PhaseInfo {
  phase: PhaseName;
  label: string;
}

interface PhaseSummary {
  phase: PhaseName;
  label: string;
  status: "success" | "skipped" | "error";
  totalDays: number;
  totalInserted: number;
  message?: string;
}

const PHASES: PhaseInfo[] = [
  { phase: "ad", label: "광고데이터" },
  { phase: "mixpanel", label: "믹스패널" },
  { phase: "overlap", label: "타겟중복" },
];

export async function POST(request: NextRequest) {
  // 1. admin 권한 확인
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });
  }

  let body: { account_id?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { account_id, days } = body;
  if (!account_id || !days || ![1, 7, 30, 90].includes(days)) {
    return NextResponse.json({ error: "account_id, days(1/7/30/90) 필수" }, { status: 400 });
  }

  // 계정 정보 조회
  const { data: accountRow } = await svc
    .from("ad_accounts")
    .select("account_name, user_id, mixpanel_project_id")
    .eq("account_id", account_id)
    .single();
  const accountName = (accountRow?.account_name ?? account_id) as string;
  const userId = accountRow?.user_id as string | undefined;
  const mixpanelProjectId = accountRow?.mixpanel_project_id as string | undefined;

  // 2. SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const summaries: PhaseSummary[] = [];

      try {
        // 수집 날짜 범위 생성 (오늘-1일 ~ 오늘-days일)
        const dates: string[] = [];
        for (let i = 1; i <= days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          dates.push(`${y}-${m}-${day}`);
        }
        dates.reverse(); // 오래된 날짜부터 처리

        send({ type: "start", phases: PHASES });

        // ── Phase 1: 광고데이터 ──────────────────────────────
        let adTotalInserted = 0;
        try {
          send({ type: "phase_start", phase: "ad", total: dates.length });

          for (let i = 0; i < dates.length; i++) {
            const dateStr = dates[i];
            try {
              const ads = await fetchAccountAds(account_id, dateStr);
              let inserted = 0;

              if (ads.length > 0) {
                const rows = buildInsightRows(ads, account_id, accountName, dateStr);
                inserted = await upsertInsights(svc, rows);
              }

              adTotalInserted += inserted;
              send({
                type: "phase_progress",
                phase: "ad",
                current: i + 1,
                total: dates.length,
                date: dateStr,
                detail: `${inserted}건 저장`,
              });
            } catch (e) {
              send({
                type: "day_error",
                phase: "ad",
                date: dateStr,
                message: (e as Error).message,
              });
            }

            // rate limit 방지: 2초 대기
            if (i < dates.length - 1) {
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          send({ type: "phase_complete", phase: "ad", totalDays: dates.length, totalInserted: adTotalInserted });
          summaries.push({ phase: "ad", label: "광고데이터", status: "success", totalDays: dates.length, totalInserted: adTotalInserted });
        } catch (e) {
          const msg = (e as Error).message || "광고데이터 수집 오류";
          send({ type: "phase_error", phase: "ad", message: msg });
          summaries.push({ phase: "ad", label: "광고데이터", status: "error", totalDays: 0, totalInserted: adTotalInserted, message: msg });
        }

        // ── Phase 2: 믹스패널 ──────────────────────────────
        let mixpanelTotalInserted = 0;
        try {
          if (!mixpanelProjectId) {
            send({ type: "phase_skip", phase: "mixpanel", reason: "믹스패널 미연동" });
            summaries.push({ phase: "mixpanel", label: "믹스패널", status: "skipped", totalDays: 0, totalInserted: 0, message: "믹스패널 미연동" });
          } else if (!userId) {
            send({ type: "phase_skip", phase: "mixpanel", reason: "계정 소유자 없음" });
            summaries.push({ phase: "mixpanel", label: "믹스패널", status: "skipped", totalDays: 0, totalInserted: 0, message: "계정 소유자 없음" });
          } else {
            const secretKey = await lookupMixpanelSecret(svc, account_id, userId);
            if (!secretKey) {
              send({ type: "phase_skip", phase: "mixpanel", reason: "시크릿키 없음" });
              summaries.push({ phase: "mixpanel", label: "믹스패널", status: "skipped", totalDays: 0, totalInserted: 0, message: "시크릿키 없음" });
            } else {
              send({ type: "phase_start", phase: "mixpanel", total: dates.length });

              for (let i = 0; i < dates.length; i++) {
                const dateStr = dates[i];
                // 1회 재시도
                let retries = 0;
                while (retries <= 1) {
                  try {
                    const { totalRevenue, purchaseCount } = await fetchMixpanelRevenue(
                      mixpanelProjectId,
                      secretKey,
                      dateStr
                    );

                    const { error: upsertErr } = await svc
                      .from("daily_mixpanel_insights" as never)
                      .upsert(
                        {
                          date: dateStr,
                          user_id: userId,
                          account_id: account_id,
                          project_id: mixpanelProjectId,
                          total_revenue: totalRevenue,
                          purchase_count: purchaseCount,
                          collected_at: new Date().toISOString(),
                        } as never,
                        { onConflict: "date,account_id,project_id" as never }
                      );

                    if (upsertErr) {
                      send({
                        type: "day_error",
                        phase: "mixpanel",
                        date: dateStr,
                        message: upsertErr.message,
                      });
                    } else {
                      mixpanelTotalInserted++;
                      send({
                        type: "phase_progress",
                        phase: "mixpanel",
                        current: i + 1,
                        total: dates.length,
                        date: dateStr,
                      });
                    }
                    break; // 성공 시 루프 종료
                  } catch (e) {
                    if (retries === 0 && e instanceof Error && e.name === "TimeoutError") {
                      retries++;
                      continue;
                    }
                    send({
                      type: "day_error",
                      phase: "mixpanel",
                      date: dateStr,
                      message: (e as Error).message,
                    });
                    break;
                  }
                }

                // rate limit 방지: 2초 대기
                if (i < dates.length - 1) {
                  await new Promise(r => setTimeout(r, 2000));
                }
              }

              send({ type: "phase_complete", phase: "mixpanel", totalDays: dates.length, totalInserted: mixpanelTotalInserted });
              summaries.push({ phase: "mixpanel", label: "믹스패널", status: "success", totalDays: dates.length, totalInserted: mixpanelTotalInserted });
            }
          }
        } catch (e) {
          const msg = (e as Error).message || "믹스패널 수집 오류";
          send({ type: "phase_error", phase: "mixpanel", message: msg });
          summaries.push({ phase: "mixpanel", label: "믹스패널", status: "error", totalDays: 0, totalInserted: mixpanelTotalInserted, message: msg });
        }

        // ── Phase 3: 타겟중복 ──────────────────────────────
        let overlapTotalInserted = 0;
        try {
          const adsets = await fetchActiveAdsets(account_id);
          if (adsets.length === 0) {
            send({ type: "phase_skip", phase: "overlap", reason: "활성 캠페인 없음" });
            summaries.push({ phase: "overlap", label: "타겟중복", status: "skipped", totalDays: 0, totalInserted: 0, message: "활성 캠페인 없음" });
          } else {
            // 전체 기간에 대해 1회 계산
            const dateStart = dates[0];
            const dateEnd = dates[dates.length - 1];

            // 개별 reach — Meta API에서 기간별 조회 (reach는 유니크 → 일별 합산 불가)
            let reachByAdset: Record<string, number>;
            try {
              reachByAdset = await fetchPerAdsetReach(
                account_id,
                adsets.map(a => a.id),
                dateStart,
                dateEnd
              );
            } catch {
              // Meta API 실패 시 DB fallback — 기간 내 최대 일별 reach 사용
              const { data: reachRows } = await svc
                .from("daily_ad_insights")
                .select("adset_id, reach")
                .eq("account_id", account_id)
                .gte("date", dateStart)
                .lte("date", dateEnd)
                .in("adset_id", adsets.map(a => a.id));

              reachByAdset = {};
              for (const row of (reachRows ?? []) as { adset_id: string; reach: number | null }[]) {
                if (!row.adset_id) continue;
                const val = row.reach ?? 0;
                reachByAdset[row.adset_id] = Math.max(reachByAdset[row.adset_id] ?? 0, val);
              }
            }

            const activeAdsets = adsets.filter(a => (reachByAdset[a.id] ?? 0) > 0);
            if (activeAdsets.length === 0) {
              send({ type: "phase_skip", phase: "overlap", reason: "reach 데이터 없음" });
              summaries.push({ phase: "overlap", label: "타겟중복", status: "skipped", totalDays: 0, totalInserted: 0, message: "reach 데이터 없음" });
            } else {
              // 상위 8개 adset으로 제한 (rate limit 대응)
              const sortedAdsets = [...activeAdsets].sort(
                (a, b) => (reachByAdset[b.id] ?? 0) - (reachByAdset[a.id] ?? 0)
              );
              const cappedAdsets = sortedAdsets.slice(0, 8);
              const totalPairs = (cappedAdsets.length * (cappedAdsets.length - 1)) / 2 + 1; // +1 = overall

              send({ type: "phase_start", phase: "overlap", total: totalPairs });
              let pairsDone = 0;
              const now = new Date().toISOString();

              // pair별 overlap 계산
              const startTime = Date.now();
              let deadlineHit = false;

              for (let i = 0; i < cappedAdsets.length && !deadlineHit; i++) {
                for (let j = i + 1; j < cappedAdsets.length; j++) {
                  if (Date.now() - startTime > 55_000) {
                    deadlineHit = true;
                    break;
                  }

                  const a = cappedAdsets[i];
                  const b = cappedAdsets[j];
                  const reachA = reachByAdset[a.id] ?? 0;
                  const reachB = reachByAdset[b.id] ?? 0;
                  const pairSum = reachA + reachB;

                  if (pairSum === 0) {
                    pairsDone++;
                    continue;
                  }

                  try {
                    const combinedUnique = await fetchCombinedReach(
                      account_id,
                      [a.id, b.id],
                      dateStart,
                      dateEnd
                    );
                    const pairOverlap = Math.max(0, ((pairSum - combinedUnique) / pairSum) * 100);

                    await svc.from("adset_overlap_cache" as never).upsert(
                      {
                        account_id: account_id,
                        adset_pair: makePairKey(a.id, b.id),
                        period_start: dateStart,
                        period_end: dateEnd,
                        overlap_data: {
                          overlap_rate: Math.round(pairOverlap * 10) / 10,
                          reach_a: reachA,
                          reach_b: reachB,
                          combined_unique: combinedUnique,
                          adset_a_name: a.name,
                          adset_b_name: b.name,
                          campaign_a: a.campaignName,
                          campaign_b: b.campaignName,
                        },
                        cached_at: now,
                      } as never,
                      { onConflict: "account_id,adset_pair,period_start,period_end" }
                    );

                    overlapTotalInserted++;
                    pairsDone++;
                    send({
                      type: "phase_progress",
                      phase: "overlap",
                      current: pairsDone,
                      total: totalPairs,
                      date: `${dateStart}~${dateEnd}`,
                      detail: `${a.name} × ${b.name}`,
                    });
                  } catch {
                    pairsDone++;
                    // 개별 pair 실패 시 건너뛰기
                    continue;
                  }
                }
              }

              // 전체 overlap 저장
              try {
                const individualSum = activeAdsets.reduce((sum, a) => sum + (reachByAdset[a.id] ?? 0), 0);
                const totalUnique = await fetchCombinedReach(
                  account_id,
                  activeAdsets.map(a => a.id),
                  dateStart,
                  dateEnd
                );
                const overallRate = individualSum > 0
                  ? Math.max(0, ((individualSum - totalUnique) / individualSum) * 100)
                  : 0;

                await svc.from("adset_overlap_cache" as never).upsert(
                  {
                    account_id: account_id,
                    adset_pair: "__overall__",
                    period_start: dateStart,
                    period_end: dateEnd,
                    overlap_data: {
                      overall_rate: Math.round(overallRate * 10) / 10,
                      total_unique: totalUnique,
                      individual_sum: individualSum,
                    },
                    cached_at: now,
                  } as never,
                  { onConflict: "account_id,adset_pair,period_start,period_end" }
                );
                overlapTotalInserted++;
                pairsDone++;
              } catch {
                // 전체 overlap 저장 실패는 무시
                pairsDone++;
              }

              send({
                type: "phase_progress",
                phase: "overlap",
                current: pairsDone,
                total: totalPairs,
                date: `${dateStart}~${dateEnd}`,
                detail: `${overlapTotalInserted}쌍 분석`,
              });

              send({ type: "phase_complete", phase: "overlap", totalDays: 1, totalInserted: overlapTotalInserted });
              summaries.push({ phase: "overlap", label: "타겟중복", status: "success", totalDays: 1, totalInserted: overlapTotalInserted });
            }
          }
        } catch (e) {
          const msg = (e as Error).message || "타겟중복 수집 오류";
          send({ type: "phase_error", phase: "overlap", message: msg });
          summaries.push({ phase: "overlap", label: "타겟중복", status: "error", totalDays: 0, totalInserted: overlapTotalInserted, message: msg });
        }

        // ── 전체 완료 ──────────────────────────────────────
        send({ type: "complete", summary: summaries });
      } catch (e) {
        send({ type: "error", message: (e as Error).message || "수집 중 오류 발생" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
