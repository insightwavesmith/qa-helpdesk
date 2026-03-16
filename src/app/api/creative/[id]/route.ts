/**
 * GET /api/creative/[id]
 * 소재 상세 정보 (LP 스크린샷 포함)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from("ad_creative_embeddings")
    .select(
      "id, ad_id, source, brand_name, category, media_url, media_type, ad_copy, creative_type, lp_url, lp_screenshot_url, lp_cta_screenshot_url, lp_headline, lp_price, roas, ctr, click_to_purchase_rate, quality_ranking, is_active, created_at, updated_at, lp_crawled_at",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "소재를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({ creative: data });
}
