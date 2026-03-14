const BLOG_EDITOR_PATTERNS = [
  /postwrite/i,
  /Redirect=Write/i,
  /PostWriteForm/i,
  /WriterForm/i,
  /blog\.naver\.com\/.*\/postwrite/i,
  /blog\.naver\.com\/PostWriteForm/i,
];

const CAFE_EDITOR_PATTERNS = [
  /cafe\.naver\.com\/.*\/write/i,
  /cafe\.naver\.com\/ArticleWrite/i,
  /cafe\.naver\.com\/.*ArticleWrite/i,
];

/**
 * URL이 네이버 SmartEditor 페이지인지 판별 (블로그 또는 카페)
 */
export function isEditorPage(url: string): boolean {
  return isBlogEditor(url) || isCafeEditor(url);
}

/**
 * URL이 네이버 블로그 에디터 페이지인지 판별
 */
export function isBlogEditor(url: string): boolean {
  return BLOG_EDITOR_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * URL이 네이버 카페 에디터 페이지인지 판별
 */
export function isCafeEditor(url: string): boolean {
  return CAFE_EDITOR_PATTERNS.some((pattern) => pattern.test(url));
}
