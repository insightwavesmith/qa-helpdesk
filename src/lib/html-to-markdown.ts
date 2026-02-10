import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/** HTML이 감지되면 마크다운으로 변환, 아니면 그대로 반환 */
export function ensureMarkdown(content: string): string {
  if (!content) return "";
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return turndown.turndown(content);
  }
  return content;
}
