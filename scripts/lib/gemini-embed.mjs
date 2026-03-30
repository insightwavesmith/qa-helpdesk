// scripts/lib/gemini-embed.mjs
const MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";
const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "3072", 10);
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

// 429 재시도 설정
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Gemini 임베딩 생성 (이미지 URL 또는 텍스트)
 * - string → 텍스트 임베딩
 * - { imageUrl } → 이미지를 fetch → base64 → inline_data 임베딩
 * @param {string|{imageUrl: string}} input
 * @returns {Promise<number[]>} 벡터
 */
export async function generateEmbedding(input) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY 미설정");

  const parts = [];

  if (typeof input === "string") {
    parts.push({ text: input });
  } else if (input.imageUrl) {
    // src/lib/gemini.ts와 동일: fetch → base64 → inline_data
    const imgRes = await fetch(input.imageUrl);
    if (!imgRes.ok) {
      throw new Error(`이미지 fetch 실패: ${imgRes.status} ${input.imageUrl}`);
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.startsWith("image/")
      ? contentType.split(";")[0]
      : "image/jpeg";
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
  }

  if (parts.length === 0) {
    throw new Error("input에 text 또는 imageUrl 필요");
  }

  const body = {
    model: `models/${MODEL}`,
    content: { parts },
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: DIMENSIONS,
  };

  // Exponential backoff 재시도 (429 대응)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`[gemini-embed] 429 rate limit, ${backoff}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.embedding?.values ?? [];
  }

  throw new Error(`Gemini API: ${MAX_RETRIES}회 재시도 후에도 429 지속`);
}
