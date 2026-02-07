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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") || "BS CAMP";
  const category = searchParams.get("category") || "";

  const catLabel = categoryLabels[category] || category;

  const fontUrl =
    "https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLTq8H4hfeE.woff";
  const fontBuffer = await fetch(fontUrl).then((res) => res.arrayBuffer());

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
          fontFamily: "'Noto Sans KR', sans-serif",
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
      fonts: [
        {
          name: "Noto Sans KR",
          data: fontBuffer,
          weight: 700,
          style: "normal" as const,
        },
      ],
    }
  );
}
