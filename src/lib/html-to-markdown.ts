import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * 마크다운 특성이 감지되면 그대로 반환, 순수 HTML이면 마크다운으로 변환.
 * 마크다운 안에 인라인 HTML(<img>, <strong> 등)이 섞여 있어도
 * 마크다운으로 간주하여 이중 변환을 방지한다.
 */
export function ensureMarkdown(content: string): string {
  if (!content) return "";

  // 마크다운 특성 패턴: 하나라도 있으면 마크다운으로 간주
  const markdownPatterns = [
    /^#{1,6}\s/m,          // ATX 헤딩: # ~ ######
    /^\s*[-*+]\s/m,        // 비순서 리스트: - item, * item, + item
    /^\s*\d+\.\s/m,        // 순서 리스트: 1. item
    /^\s*>/m,              // 블록인용: > quote
    /```/,                 // 코드 블록 (펜스)
    /\[.+?\]\(.+?\)/,     // 인라인 링크: [text](url)
    /!\[.*?\]\(.+?\)/,    // 이미지: ![alt](url)
    /\*\*.+?\*\*/,        // 볼드: **text**
    /^\s*\|.+\|/m,        // 테이블: | col | col |
    /^---$/m,             // 수평선
  ];

  const hasMarkdown = markdownPatterns.some((pattern) => pattern.test(content));
  if (hasMarkdown) {
    return content;
  }

  // 마크다운 특성이 없고 HTML 태그가 있으면 HTML → 마크다운 변환
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return turndown.turndown(content);
  }

  return content;
}
