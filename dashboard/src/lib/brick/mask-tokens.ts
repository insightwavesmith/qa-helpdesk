export function maskTokens(text: string): string {
  return text
    .replace(/xoxb-[a-zA-Z0-9-]+/g, 'xoxb-***')
    .replace(/sk-[a-zA-Z0-9]+/g, 'sk-***');
}
