/**
 * 네이버 블로그 금칙어 실시간 체크
 * section.blog.naver.com 검색 API 사용 (비인증)
 */

const NAVER_BLOG_SEARCH_URL =
  "https://section.blog.naver.com/ajax/SearchList.naver";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface NaverSearchDisplayInfo {
  displayType: string | null;
  existSuicideWord?: boolean;
}

interface NaverSearchResult {
  searchDisplayInfo?: NaverSearchDisplayInfo;
}

interface NaverSearchResponse {
  result?: NaverSearchResult;
}

/**
 * 단일 키워드에 대한 금칙어 여부를 네이버 블로그 섹션 검색 API로 확인
 */
export async function checkForbiddenWord(keyword: string): Promise<{
  isForbidden: boolean;
  isSuicideWord: boolean;
}> {
  const params = new URLSearchParams({
    countPerPage: "7",
    currentPage: "1",
    keyword: keyword,
    orderBy: "sim",
    type: "post",
  });

  try {
    const response = await fetch(`${NAVER_BLOG_SEARCH_URL}?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://section.blog.naver.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(
        `[naver-forbidden] 요청 실패: ${response.status} ${response.statusText} (keyword: ${keyword})`,
      );
      return { isForbidden: false, isSuicideWord: false };
    }

    const data: NaverSearchResponse = await response.json();
    const displayInfo = data?.result?.searchDisplayInfo;

    if (!displayInfo) {
      // displayInfo 자체가 없으면 금칙어로 판단
      return { isForbidden: true, isSuicideWord: false };
    }

    const isForbidden = displayInfo.displayType === null;
    const isSuicideWord = displayInfo.existSuicideWord === true;

    return { isForbidden, isSuicideWord };
  } catch (error) {
    console.error(`[naver-forbidden] 요청 오류 (keyword: ${keyword}):`, error);
    return { isForbidden: false, isSuicideWord: false };
  }
}

/**
 * 여러 키워드에 대한 금칙어 여부를 순차적으로 확인
 * 네이버 rate limit 방지를 위해 각 요청 사이에 200ms 딜레이 적용
 */
export async function checkForbiddenWords(keywords: string[]): Promise<
  Array<{
    keyword: string;
    isForbidden: boolean;
    isSuicideWord: boolean;
  }>
> {
  const results: Array<{
    keyword: string;
    isForbidden: boolean;
    isSuicideWord: boolean;
  }> = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const result = await checkForbiddenWord(keyword);
    results.push({ keyword, ...result });

    // 마지막 항목이 아닐 때만 딜레이 적용
    if (i < keywords.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
