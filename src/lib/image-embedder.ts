// T4: Image Vision Pipeline — 이미지 → Gemini Vision → 텍스트 → 임베딩
// 실패 시 이미지만 저장, 임베딩 보류

import { generateVisionText, generateEmbedding } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";

const VISION_PROMPT = `이 이미지는 메타(Facebook) 광고 교육 자료의 일부입니다.
이미지에 보이는 내용을 한국어로 상세히 설명하세요.

포함할 것:
- 화면/도표에 표시된 모든 텍스트와 숫자
- UI 요소의 위치와 관계
- 차트/그래프가 있으면 데이터 트렌드
- 이 이미지가 설명하는 개념이나 프로세스

200~400자로 작성하세요.`;

interface EmbedImageResult {
  chunkId: string | null;
  description: string;
  status: "success" | "vision_only" | "failed";
  error?: string;
}

/**
 * 이미지 URL → Vision 텍스트 → 임베딩 → knowledge_chunks INSERT
 * 실패 시 이미지만 저장 (임베딩 보류)
 */
export async function embedImage(
  imageUrl: string,
  context: { sourceType: string; lectureName: string; contentId?: string }
): Promise<EmbedImageResult> {
  // 1. Vision으로 텍스트 설명 생성
  const description = await generateVisionText(imageUrl, VISION_PROMPT);

  if (!description || description.trim().length < 10) {
    console.warn("[ImageEmbed] Vision returned empty description");
    return { chunkId: null, description: "", status: "failed", error: "Vision 텍스트 생성 실패" };
  }

  // 2. 텍스트 임베딩 생성
  let embedding: number[];
  try {
    embedding = await generateEmbedding(description);
  } catch (err) {
    console.error("[ImageEmbed] Embedding failed:", err);
    // 임베딩 실패해도 설명은 반환 (나중에 재시도 가능)
    return { chunkId: null, description, status: "vision_only", error: "임베딩 생성 실패" };
  }

  // 3. knowledge_chunks INSERT
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("knowledge_chunks")
    .insert({
      lecture_name: context.lectureName,
      week: context.sourceType,
      chunk_index: 0,
      content: description,
      embedding,
      source_type: context.sourceType,
      priority: getPriorityForImage(context.sourceType),
      content_id: context.contentId || null,
      chunk_total: 1,
      image_url: imageUrl,
      embedding_model: "gemini-embedding-001",
      metadata: { type: "image", vision_model: "gemini-2.0-flash" },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ImageEmbed] INSERT failed:", error);
    return { chunkId: null, description, status: "vision_only", error: error.message };
  }

  return { chunkId: data.id, description, status: "success" };
}

function getPriorityForImage(sourceType: string): number {
  switch (sourceType) {
    case "lecture":
    case "blueprint":
      return 1;
    case "qa":
      return 2;
    default:
      return 3;
  }
}
