/**
 * 콘텐츠 크롤링 공용 로직
 * - crawlUrl()의 핵심 로직을 크론에서도 사용할 수 있도록 분리
 * - requireStaff() 없이 service client에서 호출 가능
 */

// ─── RSS 파싱 ────────────────────────────────────────────────

export interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
}

/**
 * RSS 피드 URL에서 아이템 목록을 파싱
 * @param feedUrl RSS 피드 URL
 * @param maxItems 최대 아이템 수
 */
export async function parseRSSFeed(
  feedUrl: string,
  maxItems = 5
): Promise<RSSItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BSCamp-Bot/1.0; +https://bscamp.app)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`RSS 요청 실패: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(xml, { xml: true });

  const items: RSSItem[] = [];

  // RSS 2.0 형식
  $("item").each((i, el) => {
    if (i >= maxItems) return false;
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").first().text().trim();
    const pubDate = $(el).find("pubDate").first().text().trim() || undefined;
    if (title && link) {
      items.push({ title, link, pubDate });
    }
  });

  // Atom 형식 (YouTube RSS 등)
  if (items.length === 0) {
    $("entry").each((i, el) => {
      if (i >= maxItems) return false;
      const title = $(el).find("title").first().text().trim();
      const link =
        $(el).find("link").attr("href") || $(el).find("link").text().trim();
      const pubDate =
        $(el).find("published").first().text().trim() ||
        $(el).find("updated").first().text().trim() ||
        undefined;
      if (title && link) {
        items.push({ title, link, pubDate });
      }
    });
  }

  return items;
}

// ─── YouTube RSS 아이템 ──────────────────────────────────────

export interface YouTubeRSSItem {
  videoId: string;
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

/**
 * YouTube 채널 RSS 피드에서 영상 목록 파싱
 */
export async function parseYouTubeRSS(
  feedUrl: string,
  maxItems = 3
): Promise<YouTubeRSSItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BSCamp-Bot/1.0; +https://bscamp.app)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`YouTube RSS 요청 실패: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(xml, { xml: true });

  const items: YouTubeRSSItem[] = [];

  $("entry").each((i, el) => {
    if (i >= maxItems) return false;
    const videoId = $(el).find("yt\\:videoId, videoId").first().text().trim();
    const title = $(el).find("title").first().text().trim();
    const link =
      $(el).find("link").attr("href") || `https://www.youtube.com/watch?v=${videoId}`;
    const pubDate = $(el).find("published").first().text().trim() || undefined;
    const description =
      $(el).find("media\\:description, description").first().text().trim() || undefined;

    if (videoId && title) {
      items.push({ videoId, title, link, pubDate, description });
    }
  });

  return items;
}

// ─── HTML → Markdown 변환 ────────────────────────────────────

/**
 * URL에서 HTML을 가져와 마크다운으로 변환
 * contents.ts의 crawlUrl() 핵심 로직 재사용
 */
export async function fetchAndParseUrl(
  url: string
): Promise<{ title: string; bodyMd: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BSCamp-Bot/1.0; +https://bscamp.app)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { error: `URL 요청 실패: ${res.status} ${res.statusText}` };
    }

    const html = await res.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // 불필요 요소 제거
    $(
      "nav, footer, sidebar, script, style, header, aside, noscript, iframe"
    ).remove();

    // title 추출: og:title > title > h1
    const title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim() ||
      $("h1").first().text().trim() ||
      "제목 없음";

    // 본문 추출: main > article > body
    let contentEl = $("main");
    if (!contentEl.length) contentEl = $("article");
    if (!contentEl.length) contentEl = $("body");

    const bodyHtml = contentEl.html() || "";

    // turndown으로 HTML -> 마크다운 변환
    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    turndown.remove(["script", "style", "nav", "footer", "aside"]);

    const bodyMd = turndown.turndown(bodyHtml).trim();

    if (!bodyMd) {
      return { error: "본문 콘텐츠를 추출할 수 없습니다." };
    }

    return { title, bodyMd };
  } catch (e) {
    console.error("fetchAndParseUrl error:", e);
    if (e instanceof Error && e.name === "TimeoutError") {
      return { error: "URL 요청 시간 초과 (15초)" };
    }
    return { error: e instanceof Error ? e.message : "URL 크롤링 실패" };
  }
}

// ─── YouTube 자막 가져오기 (TranscriptAPI.com) ───────────────

/**
 * TranscriptAPI.com으로 YouTube 자막 가져오기
 */
export async function fetchYouTubeTranscript(
  videoId: string
): Promise<string | null> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (!apiKey) {
    console.warn("[collect-youtube] TRANSCRIPT_API_KEY 미설정, 자막 스킵");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.transcriptapi.com/v1/transcript?video_id=${videoId}&language=en`,
      {
        headers: {
          "x-api-key": apiKey,
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      console.warn(
        `[collect-youtube] 자막 API 실패 (${videoId}): ${res.status}`
      );
      return null;
    }

    const data = await res.json();

    // TranscriptAPI 응답 형식: { transcript: [{ text, start, duration }] }
    if (data.transcript && Array.isArray(data.transcript)) {
      return data.transcript
        .map((seg: { text: string }) => seg.text)
        .join(" ")
        .trim();
    }

    return null;
  } catch (e) {
    console.warn(`[collect-youtube] 자막 가져오기 실패 (${videoId}):`, e);
    return null;
  }
}
