import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      "https://dashboard-api-906295665279.asia-northeast3.run.app/sales-summary",
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 }, // cache 5 min
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Upstream error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Sales summary proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sales summary" },
      { status: 500 }
    );
  }
}
