/**
 * JSONB image_urls 컬럼 파싱 유틸리티
 *
 * 기존 데이터가 JSON.stringify로 이중 인코딩되어 문자열로 저장된 경우와
 * 정상적으로 배열로 저장된 경우 모두 처리한다.
 */
export function parseImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === "string");
    } catch {
      // JSON 파싱 실패 — 무시
    }
  }
  return [];
}
