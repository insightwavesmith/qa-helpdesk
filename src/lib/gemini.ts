// Gemini API 유틸리티 (임베딩)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "gemini-embedding-001";

if (!GEMINI_API_KEY) {
  console.warn("[Gemini] GEMINI_API_KEY 환경변수가 설정되지 않았습니다. AI 기능이 비활성화됩니다.");
}

/**
 * 텍스트를 벡터 임베딩으로 변환
 * Gemini gemini-embedding-001 사용 (768차원, outputDimensionality 지정)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}
