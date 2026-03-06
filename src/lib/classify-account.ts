/**
 * classify-account — 광고 계정 업종 카테고리 자동 분류
 *
 * 멀티시그널 수집 → Claude Sonnet AI 종합 판단
 * 시그널 우선순위: 랜딩 URL > 광고 소재 텍스트 > 계정 이름 > FB 페이지 카테고리
 */

const META_API_BASE = "https://graph.facebook.com/v21.0";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const VALID_CATEGORIES = [
  "beauty",
  "fashion",
  "food",
  "health",
  "education",
  "home",
  "pet",
  "kids",
  "sports",
  "digital",
  "finance",
  "travel",
  "etc",
] as const;

export type AccountCategory = (typeof VALID_CATEGORIES)[number];

export interface ClassificationResult {
  category: string;
  confidence: number;
  signals: Record<string, unknown>;
}

interface AdCreative {
  body?: string;
  title?: string;
}

// ── Meta API 유틸 ────────────────────────────────────────────

async function metaGet(
  path: string,
  params: Record<string, string>,
  token: string
): Promise<Record<string, unknown> | null> {
  const url = new URL(`${META_API_BASE}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[classifyAccount] Meta API ${path} error: ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn(`[classifyAccount] Meta API ${path} fetch error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ── 시그널 1: 랜딩 URL 크롤링 ────────────────────────────────

async function crawlLandingUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; QAHelpdeskBot/1.0)",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const maxLen = 20_000; // HTML 앞부분만 파싱
    const trimmed = html.slice(0, maxLen);

    const title = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const metaDesc =
      trimmed.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim() ?? "";
    const ogTitle =
      trimmed.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim() ?? "";
    const ogDesc =
      trimmed.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim() ?? "";

    const parts = [title, metaDesc, ogTitle, ogDesc].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : null;
  } catch {
    return null;
  }
}

// ── 시그널 2: 광고 소재 텍스트 수집 ──────────────────────────

async function collectAdCreatives(
  accountId: string,
  token: string
): Promise<AdCreative[]> {
  const data = await metaGet(`act_${accountId}/ads`, {
    fields: "creative{body,title}",
    effective_status: '["ACTIVE","PAUSED"]',
    limit: "5",
  }, token);

  if (!data?.data || !Array.isArray(data.data)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.data as any[])
    .map((ad) => ({
      body: ad.creative?.body as string | undefined,
      title: ad.creative?.title as string | undefined,
    }))
    .filter((c) => c.body || c.title);
}

// ── 시그널 3: 랜딩 URL 추출 (광고에서) ──────────────────────

async function extractLandingUrls(
  accountId: string,
  token: string
): Promise<string[]> {
  const data = await metaGet(`act_${accountId}/ads`, {
    fields: "creative{object_story_spec,asset_feed_spec}",
    effective_status: '["ACTIVE","PAUSED"]',
    limit: "3",
  }, token);

  if (!data?.data || !Array.isArray(data.data)) return [];

  const urls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ad of data.data as any[]) {
    const creative = ad.creative;
    if (!creative) continue;

    // object_story_spec.link_data.link
    const linkData = creative.object_story_spec?.link_data;
    if (linkData?.link) urls.push(linkData.link);

    // asset_feed_spec.link_urls
    const assetFeed = creative.asset_feed_spec;
    if (assetFeed?.link_urls && Array.isArray(assetFeed.link_urls)) {
      for (const item of assetFeed.link_urls) {
        if (item.website_url) urls.push(item.website_url);
      }
    }
  }

  // 중복 제거, 최대 3개
  return [...new Set(urls)].slice(0, 3);
}

// ── 시그널 4: FB 페이지 카테고리 ─────────────────────────────

async function getPageCategory(
  accountId: string,
  token: string
): Promise<string | null> {
  // 광고 계정 → 연결된 promoted_object / page 조회는 제한적
  // 계정의 promoted pages를 통해 접근
  const data = await metaGet(`act_${accountId}`, {
    fields: "name",
  }, token);

  if (!data) return null;

  // 계정 이름만 반환 (page category 직접 접근은 권한 필요)
  return (data.name as string) || null;
}

// ── AI 종합 판단 (Claude Sonnet) ─────────────────────────────

async function classifyWithAI(
  signals: Record<string, unknown>
): Promise<{ category: string; confidence: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[classifyAccount] ANTHROPIC_API_KEY 미설정");
    return { category: "etc", confidence: 0 };
  }

  const prompt = `다음 시그널을 종합해서 이 광고 계정의 업종 카테고리를 판단해주세요.
반드시 아래 목록 중 하나로 답해주세요:
beauty, fashion, food, health, education, home, pet, kids, sports, digital, finance, travel, etc

시그널:
${JSON.stringify(signals, null, 2)}

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 없이 JSON만 반환:
{"category": "...", "confidence": 0.XX}

confidence는 0~1 사이 값으로, 판단 확신도입니다.
시그널이 부족하면 confidence를 낮게, 여러 시그널이 일치하면 높게 주세요.`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error("[classifyAccount] Anthropic API error:", res.status);
      return { category: "etc", confidence: 0 };
    }

    const data = await res.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    );
    const text = textBlock?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[classifyAccount] JSON not found in AI response");
      return { category: "etc", confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const category = VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "etc";
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

    return { category, confidence };
  } catch (e) {
    console.error("[classifyAccount] AI classification error:", e instanceof Error ? e.message : e);
    return { category: "etc", confidence: 0 };
  }
}

// ── 메인: classifyAccount ────────────────────────────────────

export async function classifyAccount(
  accountId: string
): Promise<ClassificationResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return { category: "etc", confidence: 0, signals: { error: "META_ACCESS_TOKEN not set" } };
  }

  const signals: Record<string, unknown> = {};

  // 시그널 1: 랜딩 URL 크롤링
  const landingUrls = await extractLandingUrls(accountId, token);
  if (landingUrls.length > 0) {
    const landingTexts: string[] = [];
    for (const url of landingUrls) {
      const text = await crawlLandingUrl(url);
      if (text) landingTexts.push(text);
    }
    if (landingTexts.length > 0) {
      signals.landing_url = landingTexts.join(" /// ");
    }
  }

  // 시그널 2: 광고 소재 텍스트
  const creatives = await collectAdCreatives(accountId, token);
  if (creatives.length > 0) {
    signals.ad_text = creatives
      .map((c) => [c.title, c.body].filter(Boolean).join(": "))
      .join(" /// ");
  }

  // 시그널 3: 계정 이름
  const accountName = await getPageCategory(accountId, token);
  if (accountName) {
    signals.account_name = accountName;
  }

  // 시그널이 하나도 없으면 분류 불가
  if (Object.keys(signals).length === 0) {
    console.warn(`[classifyAccount] ${accountId}: 시그널 없음, etc로 분류`);
    return { category: "etc", confidence: 0, signals: { error: "no signals" } };
  }

  // AI 종합 판단
  const { category, confidence } = await classifyWithAI(signals);

  return { category, confidence, signals };
}
