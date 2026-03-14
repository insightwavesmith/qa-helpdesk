export interface BlogBenchmark {
  url: string;
  title: string;
  charCount: number;
  imageCount: number;
  externalLinkCount: number;
  quoteCount: number;
  dividerCount: number;
  hashtagCount: number;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function countCharacters(text: string): number {
  return text.replace(/\s/g, "").length;
}

function extractBlogIdAndLogNo(
  url: string,
): { blogId: string; logNo: string } | null {
  // postUrl 형태: https://blog.naver.com/{blogId}/{logNo}
  const match = url.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (match) {
    return { blogId: match[1], logNo: match[2] };
  }
  return null;
}

async function fetchBlogPost(postUrl: string): Promise<string | null> {
  const ids = extractBlogIdAndLogNo(postUrl);
  if (!ids) return null;

  const { blogId, logNo } = ids;

  // PostView API 사용
  const viewUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Log`;

  try {
    const res = await fetch(viewUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Referer: "https://blog.naver.com/",
      },
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    console.error(`[blog-scraper] fetch 실패: ${viewUrl}`);
    return null;
  }
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match) {
    return match[1].replace(/\s*:.*$/, "").trim();
  }

  // 네이버 블로그 제목 클래스 시도
  const seMatch = html.match(
    /class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
  );
  if (seMatch) {
    return stripHtmlTags(seMatch[1]).trim();
  }

  return "";
}

function extractBodyHtml(html: string): string {
  // 네이버 블로그 Smart Editor 3 본문 영역
  const se3Match = html.match(
    /<div[^>]+class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
  );
  if (se3Match) return se3Match[1];

  // Smart Editor 2 본문
  const se2Match = html.match(
    /<div[^>]+id="postViewArea"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (se2Match) return se2Match[1];

  // viewTypeSelector (구버전 에디터)
  const legacyMatch = html.match(
    /<div[^>]+id="viewTypeSelector"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (legacyMatch) return legacyMatch[1];

  // fallback: body 전체
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function countImages(bodyHtml: string): number {
  const imgMatches = bodyHtml.match(/<img[^>]+>/gi) ?? [];

  // 프로필/아이콘 등 소형 이미지 제외 시도 (se-image 계열만 카운트)
  // 네이버 Smart Editor 이미지 컨테이너
  const seImageMatches = bodyHtml.match(
    /class="[^"]*se-image[^"]*"|class="[^"]*postListImg[^"]*"/gi,
  );
  if (seImageMatches && seImageMatches.length > 0) {
    return seImageMatches.length;
  }

  return imgMatches.length;
}

function countExternalLinks(bodyHtml: string): number {
  const hrefMatches = bodyHtml.match(/href="([^"]+)"/gi) ?? [];
  let count = 0;

  for (const match of hrefMatches) {
    const hrefValue = match.replace(/^href="/, "").replace(/"$/, "");
    if (
      hrefValue.startsWith("http") &&
      !hrefValue.includes("blog.naver.com") &&
      !hrefValue.includes("naver.com")
    ) {
      count++;
    }
  }

  return count;
}

function countQuotes(bodyHtml: string): number {
  // <blockquote> 태그
  const blockquoteMatches = bodyHtml.match(/<blockquote[^>]*>/gi) ?? [];

  // 네이버 블로그 인용 클래스
  const seOglinkMatches =
    bodyHtml.match(/class="[^"]*se-module-oglink[^"]*"/gi) ?? [];
  const seQuoteMatches =
    bodyHtml.match(/class="[^"]*se-quotation[^"]*"/gi) ?? [];

  return blockquoteMatches.length + seOglinkMatches.length + seQuoteMatches.length;
}

function countDividers(bodyHtml: string): number {
  // <hr> 태그
  const hrMatches = bodyHtml.match(/<hr[^>]*>/gi) ?? [];

  // 네이버 블로그 구분선 클래스
  const seHrMatches =
    bodyHtml.match(/class="[^"]*se-module-horizontalLine[^"]*"/gi) ?? [];
  const seHrClass = bodyHtml.match(/class="[^"]*se-hr[^"]*"/gi) ?? [];

  return hrMatches.length + seHrMatches.length + seHrClass.length;
}

function countHashtags(bodyHtml: string): number {
  // 네이버 블로그 태그 영역
  const tagAreaMatch = bodyHtml.match(
    /class="[^"]*blog_tag[^"]*"[^>]*>([\s\S]*?)(?:<\/[^>]+>){1,3}/i,
  );
  if (tagAreaMatch) {
    const tagLinks = tagAreaMatch[1].match(/<a[^>]*>/gi) ?? [];
    if (tagLinks.length > 0) return tagLinks.length;
  }

  // se-hashtag 클래스
  const seHashtagMatches =
    bodyHtml.match(/class="[^"]*se-hashtag[^"]*"/gi) ?? [];
  if (seHashtagMatches.length > 0) return seHashtagMatches.length;

  // 텍스트에서 #태그 추출 (순수 텍스트 기반)
  const plainText = stripHtmlTags(bodyHtml);
  const hashtagMatches = plainText.match(/#[가-힣a-zA-Z0-9_]+/g) ?? [];

  return hashtagMatches.length;
}

async function benchmarkSingleBlog(
  postUrl: string,
): Promise<BlogBenchmark | null> {
  const html = await fetchBlogPost(postUrl);
  if (!html) return null;

  const title = extractTitle(html);
  const bodyHtml = extractBodyHtml(html);
  const plainText = stripHtmlTags(bodyHtml);

  return {
    url: postUrl,
    title,
    charCount: countCharacters(plainText),
    imageCount: countImages(bodyHtml),
    externalLinkCount: countExternalLinks(bodyHtml),
    quoteCount: countQuotes(bodyHtml),
    dividerCount: countDividers(bodyHtml),
    hashtagCount: countHashtags(bodyHtml),
  };
}

export async function benchmarkTopBlogs(
  keyword: string,
  count: number = 3,
): Promise<{
  blogs: BlogBenchmark[];
  average: Omit<BlogBenchmark, "url" | "title">;
}> {
  const emptyAverage = {
    charCount: 0,
    imageCount: 0,
    externalLinkCount: 0,
    quoteCount: 0,
    dividerCount: 0,
    hashtagCount: 0,
  };

  // 1. 네이버 블로그 검색 API로 상위 N개 URL 추출
  let postUrls: string[] = [];
  try {
    const searchUrl = `https://section.blog.naver.com/ajax/SearchList.naver?countPerPage=${count}&currentPage=1&keyword=${encodeURIComponent(keyword)}&orderBy=sim&type=post`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `https://section.blog.naver.com/BlogHome.naver?keyword=${encodeURIComponent(keyword)}`,
      },
    });

    if (!searchRes.ok) {
      console.error(`[blog-scraper] 검색 API 실패: ${searchRes.status}`);
      return { blogs: [], average: emptyAverage };
    }

    const rawText = await searchRes.text();

    // 네이버 블로그 검색 API는 //eslint-disable 주석과 함께 JSON을 반환하기도 함
    // 앞에 붙는 비JSON 문자 제거
    const jsonStart = rawText.indexOf("{");
    if (jsonStart === -1) {
      console.error("[blog-scraper] JSON 파싱 불가: 응답에 { 없음");
      return { blogs: [], average: emptyAverage };
    }

    const jsonText = rawText.slice(jsonStart);
    const data = JSON.parse(jsonText) as {
      result?: {
        searchList?: Array<{ postUrl?: string }>;
      };
    };

    const searchList = data?.result?.searchList ?? [];
    postUrls = searchList
      .filter((item) => typeof item.postUrl === "string" && item.postUrl)
      .map((item) => item.postUrl as string)
      .slice(0, count);
  } catch (err) {
    console.error("[blog-scraper] 검색 API 오류:", err);
    return { blogs: [], average: emptyAverage };
  }

  if (postUrls.length === 0) {
    return { blogs: [], average: emptyAverage };
  }

  // 2. 각 블로그 글 크롤링 (500ms 딜레이)
  const blogs: BlogBenchmark[] = [];

  for (const url of postUrls) {
    try {
      const result = await benchmarkSingleBlog(url);
      if (result) {
        blogs.push(result);
      } else {
        console.error(`[blog-scraper] 크롤링 실패 (null): ${url}`);
      }
    } catch (err) {
      console.error(`[blog-scraper] 크롤링 오류: ${url}`, err);
    }

    // 500ms 딜레이 (마지막 항목 제외)
    if (url !== postUrls[postUrls.length - 1]) {
      await delay(500);
    }
  }

  if (blogs.length === 0) {
    return { blogs: [], average: emptyAverage };
  }

  // 3. 평균값 계산 (소수점 1자리 반올림)
  const n = blogs.length;
  const round1 = (v: number) => Math.round((v / n) * 10) / 10;

  const average = {
    charCount: round1(blogs.reduce((s, b) => s + b.charCount, 0)),
    imageCount: round1(blogs.reduce((s, b) => s + b.imageCount, 0)),
    externalLinkCount: round1(
      blogs.reduce((s, b) => s + b.externalLinkCount, 0),
    ),
    quoteCount: round1(blogs.reduce((s, b) => s + b.quoteCount, 0)),
    dividerCount: round1(blogs.reduce((s, b) => s + b.dividerCount, 0)),
    hashtagCount: round1(blogs.reduce((s, b) => s + b.hashtagCount, 0)),
  };

  return { blogs, average };
}
