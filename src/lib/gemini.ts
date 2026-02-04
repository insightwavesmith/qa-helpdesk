// Gemini API 유틸리티 (임베딩 + 생성)
// TODO: Phase 2에서 구현 예정

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const GENERATION_MODEL = "gemini-2.0-flash";

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
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

/**
 * AI 답변 생성 (RAG 기반)
 * 참고 강의 청크를 컨텍스트로 포함
 */
export async function generateAnswer(
  question: string,
  context: string[]
): Promise<string> {
  const systemPrompt = `당신은 메타(Facebook) 광고 전문가입니다. 
제공된 강의 자료를 기반으로 질문에 정확하게 답변해주세요.
답변은 한국어로, 실무에 도움이 되도록 구체적으로 작성해주세요.
강의 자료에 없는 내용은 추측하지 말고 "강의 자료에서 확인되지 않는 내용입니다"라고 안내해주세요.`;

  const contextText = context.join("\n\n---\n\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n## 참고 강의 자료\n${contextText}\n\n## 질문\n${question}`,
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
    throw new Error(`Generation API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
