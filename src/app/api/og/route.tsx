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

const gradientMap: Record<string, [string, string]> = {
  info: ["#F75D5D", "#E54949"],
  education: ["#F75D5D", "#E54949"],
  notice: ["#10B981", "#059669"],
  news: ["#10B981", "#059669"],
  webinar: ["#F97316", "#EA580C"],
};
const defaultGradient: [string, string] = ["#1a1a2e", "#2d2d4e"];

const categoryEmoji: Record<string, string> = {
  info: "\u{1F4DA}",
  education: "\u{1F4DA}",
  notice: "\u{1F4F0}",
  news: "\u{1F4F0}",
  webinar: "\u{1F399}\uFE0F",
};
const defaultEmoji = "\u{1F4A1}";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const title = searchParams.get("title") || "BS CAMP";
    const category = searchParams.get("category") || "";
    const catLabel = categoryLabels[category] || category;
    const [gradStart, gradEnd] = gradientMap[category] || defaultGradient;
    const emoji = categoryEmoji[category] || defaultEmoji;

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
            background: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)`,
            padding: "60px",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "40px",
              left: "60px",
              fontSize: "24px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              display: "flex",
            }}
          >
            BS CAMP
          </div>
          <div
            style={{
              fontSize: title.length > 30 ? "48px" : "56px",
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              lineHeight: 1.3,
              maxWidth: "900px",
              display: "flex",
            }}
          >
            {title}
          </div>
          {catLabel ? (
            <div
              style={{
                position: "absolute",
                bottom: "40px",
                padding: "8px 24px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "20px",
                fontSize: "20px",
                color: "white",
                display: "flex",
              }}
            >
              {emoji} {catLabel}
            </div>
          ) : null}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e) {
    return new Response(`OG Error: ${e}`, { status: 500 });
  }
}
