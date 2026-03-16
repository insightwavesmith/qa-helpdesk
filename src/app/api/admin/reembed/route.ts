import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DELAY_MS = 500;

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  // 인증 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  // admin 역할 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }

  // 요청 파라미터
  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(body.batchSize || DEFAULT_BATCH_SIZE, 500);
  const delayMs = body.delayMs || DEFAULT_DELAY_MS;

  // embedding_v2가 NULL인 청크 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chunks, error: queryErr } = await (supabase as any)
    .from("knowledge_chunks")
    .select("id, content")
    .is("embedding_v2", null)
    .not("content", "is", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (queryErr) {
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    // 남은 청크 수 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding_v2", null);

    return NextResponse.json({
      processed: 0,
      remaining: count || 0,
      errors: 0,
      message: "재임베딩할 청크가 없습니다",
    });
  }

  let processed = 0;
  let errors = 0;
  const embeddingModel = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await generateEmbedding(chunk.content, {
        taskType: "RETRIEVAL_DOCUMENT",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from("knowledge_chunks")
        .update({
          embedding_v2: embedding,
          embedding_model_v2: embeddingModel,
        })
        .eq("id", chunk.id);

      if (updateErr) {
        console.error(`[Reembed] Update failed for ${chunk.id}:`, updateErr);
        errors++;
      } else {
        processed++;
      }
    } catch (err) {
      console.error(`[Reembed] Embedding failed for ${chunk.id}:`, err);
      errors++;

      // Rate limit시 추가 대기
      if (err instanceof Error && err.message.includes("429")) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // 배치 간 딜레이 (rate limit 방지)
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // 남은 청크 수 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: remaining } = await (supabase as any)
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding_v2", null);

  return NextResponse.json({
    processed,
    remaining: remaining || 0,
    errors,
    batchSize,
    embeddingModel,
  });
}
