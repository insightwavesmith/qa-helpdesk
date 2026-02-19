// T1: 텍스트 청킹 유틸리티
// 한국어 문장 경계 존중, 기본 700자 + 100자 overlap

const DEFAULT_MAX_CHARS = 700;
const DEFAULT_OVERLAP = 100;

// 한국어 문장 종결 패턴 (마침표/물음표/느낌표 + 공백 또는 줄바꿈)
const SENTENCE_END_RE = /(?<=[.!?。？！])\s+/;

/**
 * 텍스트를 chunk 배열로 분할
 * - 한국어 문장 경계 존중
 * - 기본 700자, 100자 overlap
 * - chunk_index는 0-based
 */
export function chunkText(
  text: string,
  maxChars: number = DEFAULT_MAX_CHARS,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  if (!text || text.trim().length === 0) return [];

  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = splitSentences(cleaned);
  const chunks: string[] = [];
  let currentChunk = "";
  let overlapBuffer = "";

  for (const sentence of sentences) {
    // 단일 문장이 maxChars보다 길면 강제 분할
    if (sentence.length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        overlapBuffer = getOverlapTail(currentChunk, overlap);
        currentChunk = "";
      }
      const forceSplit = forceChunk(
        overlapBuffer + sentence,
        maxChars,
        overlap
      );
      chunks.push(...forceSplit.slice(0, -1));
      currentChunk = forceSplit[forceSplit.length - 1];
      overlapBuffer = "";
      continue;
    }

    const candidate = currentChunk + sentence;
    if (candidate.length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        overlapBuffer = getOverlapTail(currentChunk, overlap);
      }
      currentChunk = overlapBuffer + sentence;
      overlapBuffer = "";
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/** 문장 분리: 마침표/물음표/느낌표 기준 */
function splitSentences(text: string): string[] {
  const parts = text.split(SENTENCE_END_RE);
  // split으로 빈 문자열이 생길 수 있으므로 필터
  return parts.filter((p) => p.length > 0).map((p, i, arr) => {
    // 마지막 문장이 아니면 공백 추가 (split으로 제거된 공백 복원)
    return i < arr.length - 1 ? p + " " : p;
  });
}

/** 텍스트 끝에서 overlap 글자만큼 추출 */
function getOverlapTail(text: string, overlap: number): string {
  if (text.length <= overlap) return text;
  return text.slice(-overlap);
}

/** maxChars 단위로 강제 분할 (문장 경계 무시) */
function forceChunk(
  text: string,
  maxChars: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length - overlap) {
      // 남은 부분이 overlap 이하면 마지막 chunk에 포함됨
      break;
    }
  }
  return chunks;
}
