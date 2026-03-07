/**
 * 경쟁사 광고 AI 분석 모듈
 * - ai-proxy 경유 또는 Anthropic API 직접 호출
 * - t3-curation-proxy 패턴 재사용
 */

import type { CompetitorAd, CompetitorInsight } from "@/types/competitor";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface AnthropicResponseData {
  content: Array<{ type: string; text?: string }>;
}

/** AI_PROXY_URL 경유 호출 */
async function callViaProxy(
  proxyUrl: string,
  proxyKey: string,
  body: Record<string, unknown>,
): Promise<AnthropicResponseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(proxyKey ? { "x-proxy-key": proxyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`프록시 ${res.status}: ${errText.substring(0, 200)}`);
    }

    return (await res.json()) as AnthropicResponseData;
  } finally {
    clearTimeout(timer);
  }
}

/** Anthropic API 직접 호출 (H2: 120s timeout 추가) */
async function callAnthropicDirect(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<AnthropicResponseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Anthropic API ${res.status}: ${errText.substring(0, 200)}`,
      );
    }

    return (await res.json()) as AnthropicResponseData;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `당신은 디지털 마케팅 광고 분석 전문가입니다.
주어진 Meta Ad Library 광고 데이터를 분석하여 브랜드의 광고 전략과 패턴을 파악합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "longRunningAdCount": (30일 이상 운영된 광고 수),
  "totalAdCount": (전체 광고 수),
  "videoRatio": (영상 광고 비율 0~1, 판단 불가 시 0),
  "imageRatio": (이미지 광고 비율 0~1, 판단 불가 시 1),
  "platformDistribution": {
    "facebook": (비율 0~1),
    "instagram": (비율 0~1),
    "messenger": (비율 0~1)
  },
  "hookTypes": [
    {
      "type": "할인형|후기형|성분형|감성형|기타",
      "count": (해당 훅 유형 광고 수),
      "percentage": (비율 0~100),
      "examples": ["대표 광고 문구 1~2개"]
    }
  ],
  "seasonPattern": [
    { "month": 1, "adCount": (해당 월 시작 광고 수) },
    ...
  ],
  "keyProducts": ["핵심 제품/프로모션 키워드 3~5개"],
  "summary": "3~5문장의 한국어 인사이트 요약. 브랜드의 광고 전략 특징, 주력 상품, 시즌 패턴, 추천 벤치마킹 포인트를 포함."
}`;

function buildUserPrompt(ads: CompetitorAd[]): string {
  const adSummaries = ads.map((ad) => ({
    id: ad.id,
    pageName: ad.pageName,
    body: ad.body.substring(0, 200),
    startDate: ad.startDate,
    endDate: ad.endDate,
    durationDays: ad.durationDays,
    isActive: ad.isActive,
    platforms: ad.platforms,
  }));

  return `다음 ${ads.length}개 광고 데이터를 분석하세요:\n\n${JSON.stringify(adSummaries, null, 2)}`;
}

/**
 * 광고 데이터를 AI로 분석하여 인사이트 생성
 */
export async function analyzeAds(
  ads: CompetitorAd[],
): Promise<CompetitorInsight> {
  const proxyUrl = process.env.AI_PROXY_URL;
  const proxyKey = process.env.AI_PROXY_KEY ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(ads),
      },
    ],
  };

  let responseData: AnthropicResponseData;

  // 프록시 우선, 실패 시 직접 호출
  if (proxyUrl) {
    try {
      responseData = await callViaProxy(proxyUrl, proxyKey, body);
    } catch {
      if (!apiKey) throw new Error("AI 분석 실패: API 키가 설정되지 않았습니다");
      responseData = await callAnthropicDirect(apiKey, body);
    }
  } else if (apiKey) {
    responseData = await callAnthropicDirect(apiKey, body);
  } else {
    throw new Error("AI_PROXY_URL 또는 ANTHROPIC_API_KEY가 필요합니다");
  }

  const textContent = responseData.content.find((c) => c.type === "text");
  if (!textContent?.text) {
    throw new Error("AI 응답이 비어있습니다");
  }

  // JSON 파싱 (코드블록 감싸져 있을 수 있음)
  let jsonStr = textContent.text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // 필수 필드 검증 (H3 — unsafe 캐스트 방지)
  if (
    typeof parsed.longRunningAdCount !== "number" ||
    typeof parsed.totalAdCount !== "number" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.hookTypes) ||
    !Array.isArray(parsed.seasonPattern)
  ) {
    throw new Error("AI 응답 형식이 올바르지 않습니다");
  }

  const insight: CompetitorInsight = {
    longRunningAdCount: parsed.longRunningAdCount,
    totalAdCount: parsed.totalAdCount,
    videoRatio: parsed.videoRatio ?? 0,
    imageRatio: parsed.imageRatio ?? 1,
    platformDistribution: parsed.platformDistribution ?? {
      facebook: 0,
      instagram: 0,
      messenger: 0,
    },
    hookTypes: parsed.hookTypes,
    seasonPattern: parsed.seasonPattern,
    keyProducts: parsed.keyProducts ?? [],
    summary: parsed.summary,
    analyzedAt: new Date().toISOString(),
  };

  return insight;
}
