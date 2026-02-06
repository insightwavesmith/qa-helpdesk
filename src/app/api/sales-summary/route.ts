import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
