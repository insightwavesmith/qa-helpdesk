/**
 * GET /api/creative/[id]
 * 소재 상세 정보 (LP 스크린샷 포함)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from("creatives")
    .select(`
      id, ad_id, source, brand_name, category, creative_type, lp_url, is_active, created_at, updated_at,
      creative_media!inner(media_url, media_type, ad_copy, storage_url)
    `)
    .eq("ad_id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "소재를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 결과 평탄화 (creative_media 필드를 최상위로)
  const media = data.creative_media as Record<string, unknown>;
  const { creative_media: _cm, ...rest } = data;
  void _cm;
  const flattened = {
    ...rest,
    media_url: (media?.storage_url as string) || (media?.media_url as string) || null,
    media_type: (media?.media_type as string) || null,
    ad_copy: (media?.ad_copy as string) || null,
    storage_url: (media?.storage_url as string) || null,
  };

  return NextResponse.json({ creative: flattened });
}
