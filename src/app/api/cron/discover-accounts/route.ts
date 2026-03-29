/**
 * ═══════════════════════════════════════════════════════════════
 * discover-accounts — Meta 광고계정 자동 발견 크론
 * ═══════════════════════════════════════════════════════════════
 *
 * 역할: Meta 앱 토큰으로 접근 가능한 전체 광고계정을 발견하여
 *       ad_accounts 테이블에 UPSERT하는 주간 디스커버리 크론.
 *
 * 흐름:
 *   1. GET /me/adaccounts — 전체 계정 목록 조회 (페이지네이션)
 *   2. 각 계정 90일 impressions 체크 — 0이면 비활성으로 스킵
 *   3. 활성 계정 → ad_accounts UPSERT
 *      - 신규: is_member=false, active=true, discovered_at=now()
 *      - 기존: account_name, account_status, currency, last_checked_at 업데이트
 *   4. API 응답에 없는 기존 계정 → active=false
 *
 * Cloud Run Cron: 주 1회 월요일
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { fetchMetaWithRetry } from "@/lib/collect-daily-utils";

// ── Cloud Run Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── 순수 함수: UPSERT 로직 (테스트 가능) ────────────────────
export function buildNewAccountRow(
  account: { account_id: string; name: string; account_status: number; currency: string },
  now: string,
) {
  return {
    account_id: account.account_id,
    account_name: account.name || null,
    active: true,
    account_status: account.account_status ?? null,
    currency: account.currency ?? null,
    is_member: false,
    discovered_at: now,
    last_checked_at: now,
    updated_at: now,
  };
}

export function buildUpdateFields(
  account: { name: string; account_status: number; currency: string },
  now: string,
) {
  return {
    account_name: account.name || null,
    active: true,
    account_status: account.account_status ?? null,
    currency: account.currency ?? null,
    last_checked_at: now,
    updated_at: now,
  };
}

export function findAccountsToDeactivate(
  dbActiveIds: string[],
  apiProcessedIds: string[],
): string[] {
  const processedSet = new Set(apiProcessedIds);
  return dbActiveIds.filter((id) => !processedSet.has(id));
}

// ── Meta API 응답 타입 ────────────────────────────────────────
interface MetaAdAccount {
  id: string;           // "act_12345" 형식
  account_id: string;   // "12345" 형식 (act_ 없음)
  name: string;
  account_status: number;
  currency: string;
}

interface MetaPagingCursors {
  before: string;
  after: string;
}

interface MetaPaging {
  cursors: MetaPagingCursors;
  next?: string;
}

interface MetaPagedResponse<T> {
  data: T[];
  paging?: MetaPaging;
  error?: { message: string; type: string; code: number };
}

// ── 전체 광고계정 목록 조회 (페이지네이션) ────────────────────
async function fetchAllAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const allAccounts: MetaAdAccount[] = [];
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,account_status,currency&limit=500&access_token=${token}`;

  while (url) {
    const res = await fetchMetaWithRetry(url, { signal: AbortSignal.timeout(30_000) });
    const data: MetaPagedResponse<MetaAdAccount> = await res.json();

    if (data.error) {
      throw new Error(`Meta API /me/adaccounts 오류: ${data.error.message}`);
    }

    allAccounts.push(...(data.data ?? []));
    console.log(`[discover-accounts] 계정 배치 수집: ${data.data?.length ?? 0}건 (누계: ${allAccounts.length}건)`);

    // 다음 페이지 존재 여부 확인
    url = data.paging?.next ?? null;
  }

  return allAccounts;
}

// ── 90일 impressions 체크 (0이면 비활성) ─────────────────────
async function checkAccountActive(accountId: string, token: string): Promise<boolean> {
  try {
    const cleanId = accountId.replace(/^act_/, "");
    const url =
      `https://graph.facebook.com/v21.0/act_${cleanId}/insights?date_preset=last_90d&fields=impressions&access_token=${token}`;

    const res = await fetchMetaWithRetry(url, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json();

    if (data.error) {
      // API 오류는 활성으로 간주 (보수적 처리)
      console.log(`[discover-accounts] insights 오류 (활성 간주) [${cleanId}]: ${data.error.message}`);
      return true;
    }

    const insights: { impressions?: string }[] = data.data ?? [];
    const totalImpressions = insights.reduce((sum, row) => sum + (parseInt(row.impressions ?? "0", 10) || 0), 0);
    return totalImpressions > 0;
  } catch (e) {
    // 네트워크 오류는 활성으로 간주
    console.log(`[discover-accounts] insights 체크 실패 (활성 간주) [${accountId}]:`, e);
    return true;
  }
}

// ── GET /api/cron/discover-accounts ──────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const svc = createServiceClient();
  const cronRunId = await startCronRun("discover-accounts");

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    await completeCronRun(cronRunId, "error", 0, "META_ACCESS_TOKEN not set");
    return NextResponse.json({ error: "META_ACCESS_TOKEN not set" }, { status: 500 });
  }

  let totalApiAccounts = 0;
  let activeAccounts = 0;
  let skippedInactive = 0;
  let newAccounts = 0;
  let updatedAccounts = 0;
  let deactivated = 0;

  try {
    // 1. Meta API: 전체 광고계정 목록 조회
    console.log("[discover-accounts] Meta API /me/adaccounts 조회 시작");
    const apiAccounts = await fetchAllAdAccounts(token);
    totalApiAccounts = apiAccounts.length;
    console.log(`[discover-accounts] Meta API 응답: 총 ${totalApiAccounts}개 계정`);

    // 2. DB에서 기존 계정 목록 조회 (비교용)
    const { data: existingRows, error: existingErr } = await svc
      .from("ad_accounts")
      .select("account_id, active");

    if (existingErr) {
      throw new Error(`기존 ad_accounts 조회 실패: ${existingErr.message}`);
    }

    const existingMap = new Map<string, boolean>(
      (existingRows ?? []).map((r: any) => [r.account_id, r.active ?? false]) // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    console.log(`[discover-accounts] DB 기존 계정: ${existingMap.size}개`);

    // 3. 각 계정 90일 impressions 체크 + UPSERT
    const now = new Date().toISOString();
    const processedAccountIds: string[] = [];

    for (const account of apiAccounts) {
      // account_id에서 "act_" 프리픽스 제거
      const cleanId = (account.account_id ?? account.id.replace(/^act_/, ""));

      // 200ms 딜레이 (rate limit 주의)
      await new Promise((r) => setTimeout(r, 200));

      // 90일 impressions 체크
      const isActive = await checkAccountActive(cleanId, token);
      if (!isActive) {
        console.log(`[discover-accounts] 비활성 스킵 (90일 impressions=0): ${cleanId}`);
        skippedInactive++;
        continue;
      }

      activeAccounts++;
      processedAccountIds.push(cleanId);

      const isNew = !existingMap.has(cleanId);

      if (isNew) {
        // 신규 계정 INSERT
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertErr } = await (svc as any)
          .from("ad_accounts")
          .upsert(
            {
              account_id: cleanId,
              account_name: account.name || null,
              active: true,
              account_status: account.account_status ?? null,
              currency: account.currency ?? null,
              is_member: false,
              discovered_at: now,
              last_checked_at: now,
              updated_at: now,
            },
            { onConflict: "account_id", ignoreDuplicates: false }
          );

        if (insertErr) {
          console.error(`[discover-accounts] 신규 계정 upsert 오류 [${cleanId}]:`, insertErr.message);
        } else {
          console.log(`[discover-accounts] 신규 계정 등록: ${cleanId} (${account.name})`);
          newAccounts++;
        }
      } else {
        // 기존 계정 업데이트 (is_member 유지, 메타 정보만 갱신)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (svc as any)
          .from("ad_accounts")
          .update({
            account_name: account.name || null,
            active: true,
            account_status: account.account_status ?? null,
            currency: account.currency ?? null,
            last_checked_at: now,
            updated_at: now,
          })
          .eq("account_id", cleanId);

        if (updateErr) {
          console.error(`[discover-accounts] 기존 계정 업데이트 오류 [${cleanId}]:`, updateErr.message);
        } else {
          updatedAccounts++;
        }
      }
    }

    console.log(`[discover-accounts] UPSERT 완료: 신규 ${newAccounts}개, 업데이트 ${updatedAccounts}개`);

    // 4. API 응답에 없는 기존 활성 계정 → active=false
    if (processedAccountIds.length > 0) {
      // DB의 활성 계정 중 이번 API 응답에 없는 계정 조회
      const { data: activeRows, error: activeErr } = await svc
        .from("ad_accounts")
        .select("account_id")
        .eq("active", true);

      if (activeErr) {
        console.error("[discover-accounts] 활성 계정 조회 오류:", activeErr.message);
      } else {
        const toDeactivateIds = (activeRows ?? [])
          .map((r: any) => r.account_id) // eslint-disable-line @typescript-eslint/no-explicit-any
          .filter((id: any) => !processedAccountIds.includes(id)); // eslint-disable-line @typescript-eslint/no-explicit-any

        if (toDeactivateIds.length > 0) {
          const { error: deactivateErr } = await svc
            .from("ad_accounts")
            .update({ active: false, updated_at: now })
            .in("account_id", toDeactivateIds);

          if (deactivateErr) {
            console.error("[discover-accounts] 비활성화 오류:", deactivateErr.message);
          } else {
            deactivated = toDeactivateIds.length;
            console.log(`[discover-accounts] 비활성화 처리: ${deactivated}개 (API 응답에 없음)`);
          }
        }
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1) + "s";
    const totalRecords = newAccounts + updatedAccounts;

    await completeCronRun(cronRunId, "success", totalRecords, undefined, {
      totalApiAccounts,
      activeAccounts,
      skippedInactive,
      newAccounts,
      updatedAccounts,
      deactivated,
    });

    console.log(`[discover-accounts] 완료: ${elapsed} 소요`);

    return NextResponse.json({
      message: "discover-accounts 완료",
      elapsed,
      totalApiAccounts,
      activeAccounts,
      skippedInactive,
      newAccounts,
      updatedAccounts,
      deactivated,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[discover-accounts] 치명적 오류:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
