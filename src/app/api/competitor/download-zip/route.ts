import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 클라이언트에서 전달하는 광고 정보 (ZIP 다운로드용 최소 필드) */
interface ZipAdItem {
  id: string;
  pageName: string;
  imageUrl: string | null;
  videoPreviewUrl: string | null;
  displayFormat: string;
}

const MAX_ADS = 50;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * POST /api/competitor/download-zip
 * 검색 결과 이미지를 일괄 ZIP으로 다운로드
 */
export async function POST(req: NextRequest) {
  // 인증 확인
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();
    const ads: ZipAdItem[] = body.ads;

    if (!Array.isArray(ads) || ads.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 이미지가 없습니다", code: "INVALID_QUERY" },
        { status: 400 },
      );
    }

    if (ads.length > MAX_ADS) {
      return NextResponse.json(
        { error: `최대 ${MAX_ADS}건까지 다운로드 가능합니다`, code: "INVALID_QUERY" },
        { status: 400 },
      );
    }

    // 각 광고에서 이미지 URL 결정
    const downloadTargets = ads
      .map((ad) => {
        // 영상 광고는 썸네일(videoPreviewUrl)로 대체
        const url =
          ad.displayFormat === "VIDEO"
            ? ad.videoPreviewUrl ?? ad.imageUrl
            : ad.imageUrl;

        if (!url) return null;

        const safeName = (ad.pageName || "ad").replace(/[^a-zA-Z0-9가-힣]/g, "_");
        const filename = `${safeName}_${ad.id}.jpg`;

        return { url, filename };
      })
      .filter(Boolean) as { url: string; filename: string }[];

    if (downloadTargets.length === 0) {
      return NextResponse.json(
        { error: "다운로드할 이미지가 없습니다", code: "INVALID_QUERY" },
        { status: 400 },
      );
    }

    // 병렬 fetch (실패한 것은 스킵)
    const results = await Promise.allSettled(
      downloadTargets.map(async (target) => {
        const res = await fetch(target.url, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        return { filename: target.filename, data: buffer };
      }),
    );

    // ZIP 생성
    const zip = new JSZip();
    let addedCount = 0;

    // 파일명 중복 방지용 Set
    const usedNames = new Set<string>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        let { filename } = result.value;

        // 파일명 중복 시 suffix 추가
        if (usedNames.has(filename)) {
          const base = filename.replace(/\.jpg$/, "");
          let counter = 2;
          while (usedNames.has(`${base}_${counter}.jpg`)) {
            counter++;
          }
          filename = `${base}_${counter}.jpg`;
        }

        usedNames.add(filename);
        zip.file(filename, result.value.data);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      return NextResponse.json(
        { error: "이미지를 가져올 수 없습니다. 다시 검색 후 시도하세요.", code: "DOWNLOAD_FAILED" },
        { status: 500 },
      );
    }

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const zipFilename = `competitor-ads-${timestamp}.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[download-zip] ZIP 생성 실패:", err);
    return NextResponse.json(
      { error: "ZIP 다운로드에 실패했습니다", code: "DOWNLOAD_FAILED" },
      { status: 500 },
    );
  }
}
