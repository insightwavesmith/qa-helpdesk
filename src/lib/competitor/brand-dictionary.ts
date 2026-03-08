/**
 * 브랜드 사전 — 한글 브랜드명 → 영문명 매핑
 * 한글로 검색 시 Meta Ad Library에서 인식 못 하는 문제 해결
 */

/** 한글명(lowercase) → 영문명 매핑 */
const BRAND_MAP: Record<string, string> = {
  // 패션
  젝시미스: "xexymix",
  무신사: "musinsa",
  에이블리: "ably",
  지그재그: "zigzag",
  브랜디: "brandi",
  스타일쉐어: "styleshare",
  마플: "marple",
  스파오: "spao",
  탑텐: "topten",
  유니클로: "uniqlo",
  자라: "zara",
  에잇세컨즈: "8seconds",
  한섬: "handsome",
  코오롱: "kolon",
  // 뷰티
  올리브영: "oliveyoung",
  이니스프리: "innisfree",
  아모레퍼시픽: "amorepacific",
  닥터지: "dr.g",
  라네즈: "laneige",
  설화수: "sulwhasoo",
  미샤: "missha",
  에뛰드: "etude",
  토니모리: "tonymoly",
  // 스포츠
  나이키: "nike",
  아디다스: "adidas",
  뉴발란스: "new balance",
  푸마: "puma",
  언더아머: "under armour",
  // 이커머스
  쿠팡: "coupang",
  네이버: "naver",
  카카오: "kakao",
  당근마켓: "karrot",
  번개장터: "bunjang",
  오늘의집: "ohouse",
  마켓컬리: "kurly",
  // 식품
  배달의민족: "baemin",
  요기요: "yogiyo",
};

/**
 * 한글 브랜드명으로 영문명 조회
 * @returns 영문명 또는 null (사전에 없는 경우)
 */
export function lookupBrand(query: string): string | null {
  const normalized = query.trim().toLowerCase();
  return BRAND_MAP[normalized] ?? null;
}

/**
 * 입력이 한글을 포함하는지 확인
 */
export function containsKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

/**
 * Google Suggest API로 영문 브랜드명 추정
 * 비용 없는 방법: Google 자동완성 결과에서 영문 후보 추출
 * @returns 영문 후보 또는 null
 */
export async function suggestEnglishName(
  koreanQuery: string,
): Promise<string | null> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(koreanQuery + " brand")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    // Google Suggest 형식: [query, [suggestions]]
    const suggestions: string[] = json[1] ?? [];

    // 영문 단어가 포함된 첫 번째 후보에서 영문 부분 추출
    for (const suggestion of suggestions) {
      const englishMatch = suggestion.match(/[a-zA-Z][a-zA-Z0-9\s.]+/);
      if (englishMatch) {
        const candidate = englishMatch[0].trim().toLowerCase();
        // "brand" 같은 일반 단어 제외
        if (
          candidate.length >= 3 &&
          !["brand", "brands", "official", "korea"].includes(candidate)
        ) {
          return candidate;
        }
      }
    }

    return null;
  } catch {
    // 타임아웃 또는 네트워크 에러 → null 반환 (폴백 진행)
    return null;
  }
}
