import { NextRequest, NextResponse } from "next/server";
import { publicLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  const rl = publicLimiter.check(getClientIp(request));
  if (!rl.success) return rateLimitResponse(rl);

  const query = request.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({
      url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
    });
  }

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({
        url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
      });
    }

    const data = await res.json();
    const photo = data.results?.[0];

    if (!photo) {
      return NextResponse.json({
        url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
      });
    }

    return NextResponse.json({
      url: photo.urls?.regular || photo.urls?.small,
      alt: photo.alt_description || query,
      credit: photo.user?.name,
      creditUrl: photo.user?.links?.html,
    });
  } catch {
    return NextResponse.json({
      url: `https://placehold.co/800x400?text=${encodeURIComponent(query)}`,
    });
  }
}
