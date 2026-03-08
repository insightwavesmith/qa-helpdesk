import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdFromCache, isUrlExpired } from "@/lib/competitor/ad-cache";
import {
  searchMetaAds,
  MetaAdError,
} from "@/lib/competitor/meta-ad-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/download
 * 서버사이드 프록시로 fbcdn에서 이미지/영상 다운로드
 */
export async function GET(req: NextRequest) {
  // 인증 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const adId = searchParams.get("ad_id");
  const type = searchParams.get("type") as "image" | "video" | null;

  if (!adId || !type || !["image", "video"].includes(type)) {
    return NextResponse.json(
      { error: "ad_id와 type(image|video) 파라미터가 필요합니다", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  try {
    // 캐시에서 조회
    let cachedAd = await getAdFromCache(adId);
    console.log("[download] 캐시 조회:", adId, cachedAd ? "있음" : "없음");

    // 캐시 없거나 URL 만료 시 재검색
    if (!cachedAd || isUrlExpired(cachedAd)) {
      console.log("[download] 캐시 없음 또는 만료 → 재검색 시도", {
        hasCache: !!cachedAd,
        expired: cachedAd ? isUrlExpired(cachedAd) : false,
        pageName: cachedAd?.page_name,
      });
      try {
        // ad_archive_id로 직접 검색은 불가 → page_name으로 재검색
        if (cachedAd?.page_name) {
          await searchMetaAds({ searchTerms: cachedAd.page_name, limit: 50 });
          cachedAd = await getAdFromCache(adId);
        }
      } catch (err) {
        console.error("[download] 재검색 실패:", err);
        if (err instanceof MetaAdError) {
          return NextResponse.json(
            { error: "미디어 URL이 만료되었습니다. 다시 검색해 주세요.", code: "URL_EXPIRED" },
            { status: 410 },
          );
        }
      }
    }

    if (!cachedAd) {
      return NextResponse.json(
        { error: "광고를 찾을 수 없습니다. 다시 검색해 주세요.", code: "AD_NOT_FOUND" },
        { status: 404 },
      );
    }

    // URL 결정
    const mediaUrl =
      type === "video" ? cachedAd.video_url : cachedAd.image_url;

    if (!mediaUrl) {
      console.log("[download] 미디어 URL 없음:", {
        type,
        hasImage: !!cachedAd.image_url,
        hasVideo: !!cachedAd.video_url,
        displayFormat: cachedAd.display_format,
      });
      return NextResponse.json(
        { error: "다운로드할 미디어가 없습니다", code: "AD_NOT_FOUND" },
        { status: 404 },
      );
    }

    // fbcdn에서 프록시 다운로드
    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if (!mediaRes.ok) {
      console.error("[download] fbcdn 응답 실패:", {
        status: mediaRes.status,
        statusText: mediaRes.statusText,
        url: mediaUrl.substring(0, 100),
      });
      return NextResponse.json(
        { error: "파일을 다운로드할 수 없습니다. 다시 검색 후 시도하세요.", code: "DOWNLOAD_FAILED" },
        { status: 502 },
      );
    }

    // 파일명 생성
    const safeName = (cachedAd.page_name || "ad").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const ext = type === "video" ? "mp4" : "jpg";
    const filename = `${safeName}_${adId}.${ext}`;

    // Content-Type 결정
    const contentType =
      type === "video" ? "video/mp4" : "image/jpeg";

    const body = mediaRes.body;
    if (!body) {
      return NextResponse.json(
        { error: "파일을 다운로드할 수 없습니다.", code: "DOWNLOAD_FAILED" },
        { status: 502 },
      );
    }

    return new NextResponse(body as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[download] 다운로드 실패:", err);
    return NextResponse.json(
      { error: "다운로드에 실패했습니다", code: "DOWNLOAD_FAILED" },
      { status: 500 },
    );
  }
}
