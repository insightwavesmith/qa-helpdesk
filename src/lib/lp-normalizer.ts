// ──────────────────────────────────────────────
// LP URL 정규화 모듈
// normalize-lps.mjs의 normalizeUrl + classifyUrl 로직을 TypeScript 모듈로 변환
// surl 리다이렉트 해소는 제외 (collect-daily 성능 우선)
// ──────────────────────────────────────────────

// 외부 도메인 목록 (page_type='external')
export const EXTERNAL_DOMAINS = new Set([
  "fb.com",
  "facebook.com",
  "instagram.com",
  "l.facebook.com",
  "naver.com",
  "link.naver.com",
]);

/**
 * URL 정규화
 * - 프로토콜 없으면 https:// 추가
 * - UTM/쿼리스트링 제거
 * - www./m. 프리픽스 제거
 * - 후행 슬래시 제거 (루트 "/" 제외)
 * - surl 리다이렉트 해소는 하지 않음
 */
export function normalizeUrl(raw: string): { canonical: string; hostname: string } | null {
  if (!raw || raw.trim() === "") return null;

  let url = raw.trim();

  // 프로토콜 없으면 추가
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // 파싱 불가
  }

  // UTM 등 쿼리스트링 제거
  parsed.search = "";
  parsed.hash = "";

  // /utm_source=... 형태 path param 제거
  let pathname = parsed.pathname.replace(/\/utm_[^/]*/gi, "");

  // 도메인 정규화: www. / m. 제거
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  if (hostname.startsWith("m.")) hostname = hostname.slice(2);

  // 후행 슬래시 제거 (루트 "/" 제외)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const canonical = `${parsed.protocol}//${hostname}${pathname}`;
  return { canonical, hostname };
}

/**
 * URL 분류
 * - page_type: "external" | "article" | "product"
 * - platform: "cafe24" | "smartstore" | "oliveyoung" | "custom"
 */
export function classifyUrl(
  canonical: string,
  hostname: string
): { page_type: string; platform: string } {
  // page_type
  let page_type = "product";
  if (EXTERNAL_DOMAINS.has(hostname)) {
    page_type = "external";
  } else if (/\/article\//i.test(canonical)) {
    page_type = "article";
  }

  // platform
  let platform = "custom";
  if (/surl|product\/detail\.html/i.test(canonical)) {
    platform = "cafe24";
  } else if (/smartstore\.naver\.com/i.test(canonical)) {
    platform = "smartstore";
  } else if (/oliveyoung/i.test(canonical)) {
    platform = "oliveyoung";
  }

  return { page_type, platform };
}
