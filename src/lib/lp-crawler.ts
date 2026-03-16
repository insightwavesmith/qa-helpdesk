/**
 * T7: LP(Landing Page) 기초 크롤러
 * fetch + cheerio로 LP 텍스트/메타 추출
 * Playwright 없이 기초 크롤링만 수행
 */

import * as cheerio from "cheerio";

export interface LPCrawlResult {
  headline: string | null;
  description: string | null;
  price: string | null;
  ogImageUrl: string | null;
  text: string;
  url: string;
}

/**
 * LP URL을 fetch + cheerio로 크롤링
 * OG 메타, 헤드라인, 가격 정보 추출
 * 실패 시 null 반환 (크롤링 실패 허용)
 */
export async function crawlLandingPage(url: string): Promise<LPCrawlResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn(`[lp-crawler] HTTP ${res.status} for ${url}`);
        return null;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return null;
      }

      const html = await res.text();
      return parseHTML(html, url);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[lp-crawler] Timeout for ${url}`);
    } else {
      console.warn(`[lp-crawler] Fetch failed for ${url}:`, err);
    }
    return null;
  }
}

/**
 * HTML 파싱 → LP 데이터 추출
 */
function parseHTML(html: string, url: string): LPCrawlResult {
  const $ = cheerio.load(html);

  // OG 메타 태그
  const ogTitle = $('meta[property="og:title"]').attr("content") || null;
  const ogDescription = $('meta[property="og:description"]').attr("content") || null;
  const ogImage = $('meta[property="og:image"]').attr("content") || null;

  // 헤드라인: og:title > h1 > title
  const h1Text = $("h1").first().text().trim();
  const titleText = $("title").text().trim();
  const headline = ogTitle || h1Text || titleText || null;

  // 설명: og:description > meta description
  const metaDescription = $('meta[name="description"]').attr("content") || null;
  const description = ogDescription || metaDescription || null;

  // 가격 추출 (한국어 기준)
  const price = extractPrice($);

  // OG 이미지 URL 정규화
  let ogImageUrl: string | null = null;
  if (ogImage) {
    try {
      ogImageUrl = new URL(ogImage, url).toString();
    } catch {
      ogImageUrl = ogImage;
    }
  }

  // 본문 텍스트 추출 (임베딩용)
  const text = extractBodyText($, headline, description);

  return {
    headline,
    description,
    price,
    ogImageUrl,
    text,
    url,
  };
}

/**
 * 한국 쇼핑몰 가격 패턴 추출
 */
function extractPrice($: cheerio.CheerioAPI): string | null {
  // 1. 가격 관련 class/id 검색
  const priceSelectors = [
    '[class*="price"]',
    '[class*="Price"]',
    '[id*="price"]',
    '[class*="cost"]',
    '[class*="amount"]',
    'meta[property="product:price:amount"]',
  ];

  for (const selector of priceSelectors) {
    const el = $(selector).first();
    if (el.length) {
      // meta 태그는 content 속성에서
      const content = el.attr("content") || el.text().trim();
      const price = matchPricePattern(content);
      if (price) return price;
    }
  }

  // 2. 전체 텍스트에서 가격 패턴 검색 (첫 번째 매칭)
  const bodyText = $("body").text();
  const priceMatch = bodyText.match(/(?:₩|원|KRW)\s*[\d,]+|[\d,]+\s*(?:원|₩)/);
  if (priceMatch) return priceMatch[0].trim();

  return null;
}

/**
 * 가격 텍스트 패턴 매칭
 */
function matchPricePattern(text: string): string | null {
  if (!text) return null;
  // ₩ 또는 원 포함, 숫자+콤마 패턴
  const patterns = [
    /(?:₩|원|KRW)\s*[\d,]+/,
    /[\d,]+\s*(?:원|₩)/,
    /[\d]{1,3}(?:,\d{3})+(?:\s*원)?/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * 임베딩용 본문 텍스트 추출
 * 불필요한 태그 제거 후 텍스트만 추출 (최대 2000자)
 */
function extractBodyText(
  $: cheerio.CheerioAPI,
  headline: string | null,
  description: string | null,
): string {
  // script, style, nav, footer 등 제거
  $("script, style, nav, footer, header, iframe, noscript").remove();

  // 주요 콘텐츠 영역 우선
  const mainContent =
    $("main").text().trim() ||
    $("article").text().trim() ||
    $('[role="main"]').text().trim() ||
    $(".content, .product, #content, #product").text().trim();

  const bodyText = mainContent || $("body").text().trim();

  // 공백 정리
  const cleaned = bodyText
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  // 헤드라인 + 설명 + 본문 조합 (최대 2000자)
  const parts: string[] = [];
  if (headline) parts.push(headline);
  if (description) parts.push(description);
  if (cleaned) parts.push(cleaned);

  return parts.join("\n").slice(0, 2000);
}
