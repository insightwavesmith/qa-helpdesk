/**
 * Railway Playwright 크롤링 서버 클라이언트
 * POST /crawl (단건), POST /crawl/batch (배치)
 * 환경변수: CRAWLER_URL, CRAWLER_SECRET
 */

const CRAWLER_URL =
  process.env.CRAWLER_URL ||
  "https://bscamp-crawler-production.up.railway.app";
const CRAWLER_SECRET = process.env.CRAWLER_SECRET || "";

// ── 응답 타입 ──────────────────────────────────

export interface RailwayCrawlText {
  headline: string | null;
  description: string | null;
  price: string | null;
}

export interface RailwayCrawlResult {
  url: string;
  screenshot: string | null; // base64
  ctaScreenshot: string | null; // base64
  text: RailwayCrawlText;
  ogImage: string | null;
  screenshotHash: string | null;
  ctaScreenshotHash: string | null;
}

export interface RailwayBatchResult {
  results: (RailwayCrawlResult | null)[];
  errors: string[];
}

// ── 단건 크롤링 ─────────────────────────────────

export async function crawlSingle(
  url: string,
): Promise<RailwayCrawlResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(`${CRAWLER_URL}/crawl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(CRAWLER_SECRET
            ? { Authorization: `Bearer ${CRAWLER_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(
          `[railway-crawler] Single crawl HTTP ${res.status} for ${url}`,
        );
        return null;
      }

      return (await res.json()) as RailwayCrawlResult;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[railway-crawler] Timeout (60s) for ${url}`);
    } else {
      console.warn(`[railway-crawler] Single crawl failed for ${url}:`, err);
    }
    return null;
  }
}

// ── 배치 크롤링 ─────────────────────────────────

export async function crawlBatch(
  urls: string[],
): Promise<RailwayBatchResult> {
  const empty: RailwayBatchResult = { results: [], errors: [] };
  if (urls.length === 0) return empty;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch(`${CRAWLER_URL}/crawl/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(CRAWLER_SECRET
            ? { Authorization: `Bearer ${CRAWLER_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ urls }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(
          `[railway-crawler] Batch crawl HTTP ${res.status}`,
        );
        return { results: urls.map(() => null), errors: [`HTTP ${res.status}`] };
      }

      return (await res.json()) as RailwayBatchResult;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[railway-crawler] Batch timeout (300s)`);
    } else {
      console.warn(`[railway-crawler] Batch crawl failed:`, err);
    }
    return { results: urls.map(() => null), errors: [String(err)] };
  }
}
