import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Facebook 페이지 URL 또는 사용자명/ID → page_id, name, picture 조회
 *
 * GET /api/facebook/page-info?url=https://www.facebook.com/oliveyoung
 * GET /api/facebook/page-info?url=oliveyoung
 * GET /api/facebook/page-info?url=123456789
 */
export async function GET(req: NextRequest) {
  const rawInput = req.nextUrl.searchParams.get("url")?.trim();

  if (!rawInput) {
    return NextResponse.json(
      { error: "URL 또는 페이지명을 입력하세요", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Meta 토큰이 설정되지 않았습니다", code: "TOKEN_MISSING" },
      { status: 503 },
    );
  }

  // URL에서 페이지 식별자 추출
  const pageIdentifier = extractPageIdentifier(rawInput);
  if (!pageIdentifier) {
    return NextResponse.json(
      { error: "올바른 Facebook 페이지 URL이나 이름을 입력하세요", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  try {
    const graphUrl = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageIdentifier)}`);
    graphUrl.searchParams.set("fields", "id,name,picture.type(small)");
    graphUrl.searchParams.set("access_token", accessToken);

    const res = await fetch(graphUrl.toString());
    const json = await res.json();

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? "페이지를 찾을 수 없습니다";
      // Facebook 특정 에러 코드 처리
      if (json.error?.code === 803 || json.error?.code === 100) {
        return NextResponse.json(
          { error: "페이지를 찾을 수 없습니다. URL이나 이름을 확인하세요", code: "PAGE_NOT_FOUND" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: msg, code: "META_API_ERROR" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      pageId: json.id as string,
      pageName: json.name as string,
      profileImageUrl:
        (json.picture?.data?.url as string | undefined) ??
        `https://graph.facebook.com/${json.id as string}/picture?type=small`,
    });
  } catch {
    return NextResponse.json(
      { error: "Meta API 호출에 실패했습니다", code: "META_API_ERROR" },
      { status: 502 },
    );
  }
}

/**
 * 다양한 입력 형식에서 Facebook 페이지 식별자 추출
 * - https://www.facebook.com/oliveyoung → oliveyoung
 * - https://www.facebook.com/pages/Name/123456789 → 123456789
 * - https://fb.com/oliveyoung → oliveyoung
 * - oliveyoung → oliveyoung (그대로)
 * - 123456789 → 123456789 (그대로)
 */
function extractPageIdentifier(input: string): string | null {
  // URL 형식인지 확인
  let normalized = input.trim();

  try {
    const urlObj = new URL(
      normalized.startsWith("http") ? normalized : `https://${normalized}`,
    );
    const hostname = urlObj.hostname.replace(/^www\./, "");

    if (hostname === "facebook.com" || hostname === "fb.com" || hostname === "m.facebook.com") {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      if (pathParts.length === 0) return null;

      // /pages/Name/ID 형식
      if (pathParts[0] === "pages" && pathParts.length >= 3) {
        return pathParts[pathParts.length - 1];
      }

      // /profile.php?id=123456789
      if (pathParts[0] === "profile.php") {
        const id = urlObj.searchParams.get("id");
        return id ?? null;
      }

      // /username 형식 (프로필이나 페이지)
      const slug = pathParts[0];
      // 단순 username이거나 page ID
      if (slug && slug !== "groups" && slug !== "events") {
        return slug;
      }
    }
  } catch {
    // URL 파싱 실패 = 순수 텍스트 입력
  }

  // 순수 텍스트 (username 또는 page ID) — 최소 길이 체크
  normalized = normalized.replace(/^@/, "");
  if (normalized.length >= 2 && normalized.length <= 100) {
    return normalized;
  }

  return null;
}
