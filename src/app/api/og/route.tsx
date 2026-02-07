import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const categoryLabels: Record<string, string> = {
  info: "교육",
  notice: "소식",
  webinar: "웨비나",
  education: "교육",
  news: "소식",
};

async function loadFont(): Promise<ArrayBuffer | null> {
  const urls = [
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.0.1/files/noto-sans-kr-korean-700-normal.woff2",
    "https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (res.ok && res.headers.get("content-length") !== "0") {
        return await res.arrayBuffer();
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") || "BS CAMP";
  const category = searchParams.get("category") || "";

  const catLabel = categoryLabels[category] || category;

  const fontData = await loadFont();

  const fontsOption = fontData
    ? [
        {
          name: "Noto Sans KR",
          data: fontData,
          weight: 700 as const,
          style: "normal" as const,
        },
      ]
    : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #F75D5D 0%, #E54949 100%)",
          fontFamily: fontData ? "'Noto Sans KR', sans-serif" : "sans-serif",
          padding: "60px",
        }}
      >
        {/* 좌상단 로고 */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "60px",
            fontSize: "24px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          BS CAMP
        </div>

        {/* 중앙 제목 */}
        <div
          style={{
            fontSize: title.length > 30 ? "48px" : "56px",
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            lineHeight: 1.3,
            maxWidth: "900px",
            wordBreak: "keep-all",
          }}
        >
          {title}
        </div>

        {/* 하단 카테고리 배지 */}
        {catLabel && (
          <div
            style={{
              position: "absolute",
              bottom: "40px",
              padding: "8px 24px",
              background: "rgba(255,255,255,0.2)",
              borderRadius: "20px",
              fontSize: "20px",
              color: "white",
            }}
          >
            {catLabel}
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fontsOption ? { fonts: fontsOption } : {}),
    }
  );
}
