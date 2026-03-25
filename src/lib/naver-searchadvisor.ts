/**
 * 네이버 서치어드바이저 API 클라이언트
 * 환경변수: NAVER_SEARCHADVISOR_API_KEY
 */

export interface NaverAnalyticsRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
}

/**
 * 네이버 서치어드바이저 사이트 분석 데이터 조회
 * 환경변수 미설정 시 빈 배열 반환
 */
export async function getSiteAnalytics(
  startDate: string,
  endDate: string,
): Promise<NaverAnalyticsRow[]> {
  const apiKey = process.env.NAVER_SEARCHADVISOR_API_KEY;

  if (!apiKey) {
    return [];
  }

  const siteUrl = "https://bscamp.app";
  const apiUrl = "https://searchadvisor.naver.com/api/v1/sites/analytics";

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteUrl,
        startDate,
        endDate,
      }),
    });

    if (!response.ok) {
      console.error(`네이버 서치어드바이저 API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.rows ?? [];
  } catch (error) {
    console.error("네이버 서치어드바이저 API 호출 실패:", error);
    return [];
  }
}
