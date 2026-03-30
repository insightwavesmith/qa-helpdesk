import { describe, it, expect } from "vitest";
import { parseImageUrls } from "@/lib/parse-image-urls";

describe("image_urls jsonb 쓰기/읽기 호환성", () => {
  it("JSON.stringify로 배열을 유효한 JSON 문자열로 변환", () => {
    const result = JSON.stringify(["url1", "url2"]);
    expect(result).toBe('["url1","url2"]');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("빈 배열도 유효한 JSON 문자열로 변환", () => {
    const result = JSON.stringify([]);
    expect(result).toBe("[]");
  });

  it("parseImageUrls가 JSON 문자열을 정상 파싱", () => {
    const stringified = JSON.stringify(["url1"]);
    expect(parseImageUrls(stringified)).toEqual(["url1"]);
  });

  it("parseImageUrls가 기존 배열 데이터도 호환", () => {
    expect(parseImageUrls(["url1"])).toEqual(["url1"]);
  });

  it("undefined fallback이 유효한 JSON 생성", () => {
    const maybeUndefined: string[] | undefined = undefined;
    const result = JSON.stringify(maybeUndefined || []);
    expect(result).toBe("[]");
  });
});
