/**
 * POST /api/admin/creative-embed-3072
 * 768차원 임베딩 배치 실행 (이미지 + 텍스트)
 * embedding_3072 IS NULL인 row를 배치로 처리
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const batchSize: number = typeof body.batchSize === "number" ? body.batchSize : 50;

  const supabase = createServiceClient();

  // embedding_3072 IS NULL인 row 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fetchError } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("id, ad_id, media_url, ad_copy")
    .is("embedding_3072", null)
    .eq("is_active", true)
    .limit(batchSize);

  if (fetchError) {
    console.error("[creative-embed-3072] 조회 실패:", fetchError);
    return NextResponse.json(
      { error: "소재 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      processed: 0,
      embedded: 0,
      errors: 0,
      remaining: 0,
      message: "임베딩할 소재가 없습니다.",
    });
  }

  let embedded = 0;
  let errors = 0;

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    // 이미지 임베딩 (media_url 있는 경우)
    if (row.media_url) {
      try {
        updates.embedding_3072 = await generateEmbedding(
          { imageUrl: row.media_url as string },
          { dimensions: 3072, taskType: "SEMANTIC_SIMILARITY" },
        );
      } catch (err) {
        console.error(
          `[creative-embed-3072] 이미지 임베딩 실패 ${row.ad_id}:`,
          err,
        );
        errors++;
      }
    }

    // 텍스트 임베딩 (ad_copy 있는 경우)
    const adCopy = row.ad_copy as string | null;
    if (adCopy && adCopy.trim().length > 3) {
      try {
        updates.text_embedding_3072 = await generateEmbedding(adCopy, {
          dimensions: 3072,
          taskType: "SEMANTIC_SIMILARITY",
        });
      } catch (err) {
        console.error(
          `[creative-embed-3072] 텍스트 임베딩 실패 ${row.ad_id}:`,
          err,
        );
        errors++;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.embedded_at = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("ad_creative_embeddings")
        .update(updates)
        .eq("id", row.id);

      if (updateError) {
        console.error(
          `[creative-embed-3072] UPDATE 실패 ${row.ad_id}:`,
          updateError,
        );
        errors++;
      } else {
        embedded++;
      }
    }
  }

  // 잔여 건수 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: remaining } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("id", { count: "exact", head: true })
    .is("embedding_3072", null)
    .eq("is_active", true);

  return NextResponse.json({
    processed: rows.length,
    embedded,
    errors,
    remaining: remaining ?? 0,
  });
}
