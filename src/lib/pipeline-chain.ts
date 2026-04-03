/**
 * 파이프라인 이벤트 체인 — 응답 대기 트리거
 *
 * collect-daily → process-media → embed + saliency (병렬)
 * chain=true 파라미터가 있을 때만 다음 단계 트리거
 */

import { notifyChainFailure } from "@/lib/cron-alert";

const CLOUD_RUN_URL =
  process.env.CLOUD_RUN_URL ||
  "https://bscamp-cron-906295665279.asia-northeast3.run.app";

export interface TriggerResult {
  endpoint: string;
  status: "triggered" | "failed" | "skipped";
  httpStatus?: number;
  error?: string;
}

/**
 * 다음 파이프라인 단계를 트리거하고 응답 대기
 * - 5초 타임아웃 (AbortError는 triggered 간주)
 * - 네트워크 에러 시 Slack 알림
 * - CRON_SECRET 없으면 전부 skipped (개발환경)
 */
export async function triggerNext(
  endpoints: string | string[],
  params?: Record<string, string>,
): Promise<TriggerResult[]> {
  const targets = Array.isArray(endpoints) ? endpoints : [endpoints];
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[pipeline-chain] CRON_SECRET not set, skipping trigger");
    return targets.map((ep) => ({ endpoint: ep, status: "skipped" as const }));
  }

  const results: TriggerResult[] = [];

  for (const endpoint of targets) {
    try {
      const url = new URL(`/api/cron/${endpoint}`, CLOUD_RUN_URL);
      url.searchParams.set("chain", "true");
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${secret}` },
          signal: controller.signal,
        });
        clearTimeout(timer);

        results.push({
          endpoint,
          status: response.ok ? "triggered" : "failed",
          httpStatus: response.status,
        });
        console.log(`[pipeline-chain] triggered: ${endpoint} (${response.status})`);
      } catch (fetchErr) {
        clearTimeout(timer);
        // AbortError = 타임아웃, fire-and-forget 특성상 triggered 간주
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          results.push({ endpoint, status: "triggered" });
          console.log(`[pipeline-chain] triggered (timeout): ${endpoint}`);
        } else {
          const errMsg = String(fetchErr);
          results.push({ endpoint, status: "failed", error: errMsg });
          console.warn(`[pipeline-chain] trigger failed: ${endpoint}`, fetchErr);
          await notifyChainFailure(endpoint, errMsg);
        }
      }
    } catch (e) {
      const errMsg = String(e);
      results.push({ endpoint, status: "failed", error: errMsg });
      console.warn(`[pipeline-chain] trigger failed: ${endpoint}`, e);
      await notifyChainFailure(endpoint, errMsg);
    }
  }

  return results;
}
