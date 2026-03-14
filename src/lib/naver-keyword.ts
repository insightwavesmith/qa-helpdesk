import crypto from "crypto";

export interface KeywordAnalysis {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  totalSearchCount: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  compIdx: string;
  plAvgDepth: number;
  pcPLAvgBid?: number;
  mobilePLAvgBid?: number;
  saturationRate?: number;
  publishedCount?: number;
}

function generateSignature(
  timestamp: string,
  method: string,
  uri: string,
  secretKey: string,
): string {
  const message = `${timestamp}.${method}.${uri}`;
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

/**
 * 네이버 API 응답에서 "< 10" 같은 문자열을 숫자로 변환
 */
function parseNaverCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("<")) return 5;
    const parsed = parseFloat(trimmed.replace(/,/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * 네이버 블로그 섹션 검색으로 키워드 발행량 조회
 */
export async function getPublishedCount(keyword: string): Promise<number> {
  try {
    const url = `https://section.blog.naver.com/ajax/SearchList.naver?countPerPage=1&currentPage=1&keyword=${encodeURIComponent(keyword)}&orderBy=sim&type=post`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://section.blog.naver.com/",
      },
    });

    if (!res.ok) return 0;

    const text = await res.text();
    // JSONP 또는 순수 JSON 모두 처리
    const jsonText = text.startsWith("_callback(")
      ? text.slice(10, -1)
      : text;

    const data = JSON.parse(jsonText) as {
      result?: { totalCount?: number };
    };
    return data?.result?.totalCount ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 네이버 검색광고 API로 키워드 검색량/경쟁도 분석
 */
export async function getKeywordAnalysis(keyword: string): Promise<{
  keyword: KeywordAnalysis | null;
  relatedKeywords: KeywordAnalysis[];
  error?: string;
}> {
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;
  const accessLicense = process.env.NAVER_AD_ACCESS_LICENSE;
  const secretKey = process.env.NAVER_AD_SECRET_KEY;

  if (!customerId || !accessLicense || !secretKey) {
    return {
      keyword: null,
      relatedKeywords: [],
      error: "API 키가 설정되지 않았습니다.",
    };
  }

  const timestamp = String(Date.now());
  const method = "GET";
  const uri = "/keywordstool";
  const signature = generateSignature(timestamp, method, uri, secretKey);

  const apiUrl = `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;

  let rawList: Record<string, unknown>[] = [];

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": accessLicense,
        "X-Customer": customerId,
        "X-Signature": signature,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        keyword: null,
        relatedKeywords: [],
        error: `네이버 API 오류: ${res.status} ${errText}`,
      };
    }

    const data = (await res.json()) as {
      keywordList?: Record<string, unknown>[];
    };
    rawList = data?.keywordList ?? [];
  } catch (e) {
    return {
      keyword: null,
      relatedKeywords: [],
      error: `네이버 API 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const mapItem = (item: Record<string, unknown>): KeywordAnalysis => {
    const pcCnt = parseNaverCount(item.monthlyPcQcCnt);
    const mobileCnt = parseNaverCount(item.monthlyMobileQcCnt);
    return {
      relKeyword: String(item.relKeyword ?? ""),
      monthlyPcQcCnt: pcCnt,
      monthlyMobileQcCnt: mobileCnt,
      totalSearchCount: pcCnt + mobileCnt,
      monthlyAvePcCtr: parseNaverCount(item.monthlyAvePcCtr),
      monthlyAveMobileCtr: parseNaverCount(item.monthlyAveMobileCtr),
      compIdx: String(item.compIdx ?? ""),
      plAvgDepth: parseNaverCount(item.plAvgDepth),
      pcPLAvgBid:
        item.pcPLAvgBid !== undefined
          ? parseNaverCount(item.pcPLAvgBid)
          : undefined,
      mobilePLAvgBid:
        item.mobilePLAvgBid !== undefined
          ? parseNaverCount(item.mobilePLAvgBid)
          : undefined,
    };
  };

  if (rawList.length === 0) {
    return { keyword: null, relatedKeywords: [] };
  }

  // 첫 번째 항목 = 입력 키워드, 나머지 = 연관 키워드
  const mainItem = mapItem(rawList[0]);
  const relatedItems = rawList.slice(1).map(mapItem);

  // 메인 키워드에만 포화도 계산
  const publishedCount = await getPublishedCount(keyword);
  const saturationRate =
    mainItem.totalSearchCount > 0
      ? (publishedCount / mainItem.totalSearchCount) * 100
      : 0;

  const mainKeyword: KeywordAnalysis = {
    ...mainItem,
    publishedCount,
    saturationRate: Math.round(saturationRate * 100) / 100,
  };

  return {
    keyword: mainKeyword,
    relatedKeywords: relatedItems,
  };
}
