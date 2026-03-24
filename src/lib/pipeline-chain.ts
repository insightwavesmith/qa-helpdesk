/**
 * 파이프라인 이벤트 체인 — fire-and-forget 트리거
 *
 * collect-daily → process-media → embed + saliency (병렬)
 * chain=true 파라미터가 있을 때만 다음 단계 트리거
 */

const CLOUD_RUN_URL =
  process.env.CLOUD_RUN_URL ||
  "https://bscamp-cron-906295665279.asia-northeast3.run.app";

/**
 * 다음 파이프라인 단계를 fire-and-forget으로 트리거
 * - 응답을 기다리지 않음 (1초 후 abort)
 * - 실패해도 현재 단계에 영향 없음
 * - CRON_SECRET 없으면 스킵 (개발환경)
 */
export async function triggerNext(
  endpoints: string | string[],
  params?: Record<string, string>,
): Promise<void> {
  const targets = Array.isArray(endpoints) ? endpoints : [endpoints];
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[pipeline-chain] CRON_SECRET not set, skipping trigger");
    return;
  }

  for (const endpoint of targets) {
    try {
      const url = new URL(`/api/cron/${endpoint}`, CLOUD_RUN_URL);
      url.searchParams.set("chain", "true");
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      // Fire-and-forget: 2초 후 abort (연결 확인만)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
      })
        .then(() => clearTimeout(timer))
        .catch(() => clearTimeout(timer));

      console.log(`[pipeline-chain] triggered: ${endpoint}`);
    } catch (e) {
      console.warn(`[pipeline-chain] trigger failed: ${endpoint}`, e);
    }
  }
}
