// Gemini API 유틸리티 (임베딩 + 생성)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const GENERATION_MODEL = "gemini-2.5-flash-preview-05-20";

/**
 * 텍스트를 벡터 임베딩으로 변환
 * Gemini text-embedding-004 사용 (768차원)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
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

/**
 * AI 답변 생성 (RAG 기반)
 * 검색된 강의 청크를 컨텍스트로 Gemini 2.5 Flash에 전달
 */
export async function generateAnswer(
  question: string,
  context: string[]
): Promise<string> {
  const systemPrompt =
    "당신은 자사몰사관학교의 메타 광고 전문 AI 어시스턴트입니다. 제공된 강의 내용을 기반으로 정확하고 실용적인 답변을 해주세요. 강의 내용에 없는 정보는 추측하지 마세요.";

  const contextText = context.join("\n\n---\n\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `## 참고 강의 자료\n${contextText}\n\n## 질문\n${question}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Generation API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
