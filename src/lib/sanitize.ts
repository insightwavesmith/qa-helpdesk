import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "b", "i",
      "h1", "h2", "h3", "h4",
      "ul", "ol", "li",
      "blockquote", "a", "img", "code", "pre",
      "table", "thead", "tbody", "tr", "td", "th",
      "hr", "div", "span", "figure", "figcaption",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "class", "style", "id", "loading",
      "data-unsplash-query",
    ],
    ALLOW_DATA_ATTR: false,
  });
}
