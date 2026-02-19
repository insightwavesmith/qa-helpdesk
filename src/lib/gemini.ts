// Gemini API 유틸리티 (임베딩 + Flash 텍스트 생성 + Vision)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "gemini-embedding-001";
const FLASH_MODEL = "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

// ─── Gemini Flash 텍스트 생성 (T0) ──────────────────────────

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Gemini 2.0 Flash로 텍스트 생성
 * 429 시 1회 재시도 (2초 대기), 실패 시 빈 문자열 반환
 */
export async function generateFlashText(
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!GEMINI_API_KEY) return "";

  const temperature = options?.temperature ?? 0.1;
  const maxTokens = options?.maxTokens ?? 1024;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `${GEMINI_BASE}/${FLASH_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
        }
      );

      if (res.status === 429 && attempt === 0) {
        console.warn("[Gemini Flash] 429 rate limit, retrying in 2s...");
        await delay(2000);
        continue;
      }

      if (!res.ok) {
        console.error(`[Gemini Flash] API error: ${res.status}`);
        return "";
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (err) {
      console.error("[Gemini Flash] Error:", err);
      return "";
    }
  }
  return "";
}

// ─── Gemini Vision 텍스트 생성 (T0) ─────────────────────────

/**
 * 이미지 URL → Gemini Vision으로 텍스트 설명 생성
 * 이미지를 fetch → base64 → Gemini API 전달
 */
export async function generateVisionText(
  imageUrl: string,
  prompt: string
): Promise<string> {
  if (!GEMINI_API_KEY) return "";

  try {
    // 이미지 fetch → base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[Gemini Vision] Image fetch failed: ${imgRes.status}`);
      return "";
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg";
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30초 timeout

    try {
      const res = await fetch(
        `${GEMINI_BASE}/${FLASH_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Data } },
                { text: prompt },
              ],
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        console.error(`[Gemini Vision] API error: ${res.status}`);
        return "";
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[Gemini Vision] Timeout (30s)");
    } else {
      console.error("[Gemini Vision] Error:", err);
    }
    return "";
  }
}
