import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://1bpluschool.com",
  "https://dev.1bpluschool.com",
  "http://localhost:5173",
];

function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return null;
}

export function reviewCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = getAllowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleReviewOptions(request: NextRequest): NextResponse {
  const origin = getAllowedOrigin(request);
  if (!origin) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
