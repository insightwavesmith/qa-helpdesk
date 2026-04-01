import { describe, it, expect } from "vitest";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

describe("toProfileId — Firebase UID → UUID v5 변환", () => {
  // SP-01: Firebase UID → 유효 UUID 반환 + 결정적
  it("Firebase UID를 유효한 UUID로 변환", () => {
    const result = toProfileId("931EZvrM96MdN8Kx0QijFgd4njk2");
    expect(uuidValidate(result)).toBe(true);
  });

  // SP-02: 기존 UUID → 그대로 반환 (Supabase 호환)
  it("이미 UUID 형식이면 그대로 반환", () => {
    const uuid = uuidv4();
    expect(toProfileId(uuid)).toBe(uuid);
  });

  // SP-03: 같은 Firebase UID 2회 호출 → 동일 UUID
  it("같은 Firebase UID는 항상 동일한 UUID 반환 (결정적)", () => {
    const uid = "931EZvrM96MdN8Kx0QijFgd4njk2";
    expect(toProfileId(uid)).toBe(toProfileId(uid));
  });

  // SP-04: 빈 문자열 → UUID 반환 (에러 아님)
  it("빈 문자열도 UUID 반환 (에러 없음)", () => {
    const result = toProfileId("");
    expect(uuidValidate(result)).toBe(true);
  });

  // 추가: 서로 다른 Firebase UID → 서로 다른 UUID
  it("다른 Firebase UID는 다른 UUID 생성", () => {
    const a = toProfileId("userA123456789012345678901");
    const b = toProfileId("userB123456789012345678901");
    expect(a).not.toBe(b);
  });

  // 추가: UUID v5 형식 확인 (버전 비트 = 5)
  it("변환 결과는 UUID v5 형식 (version bit = 5)", () => {
    const result = toProfileId("testFirebaseUID12345678");
    expect(result.charAt(14)).toBe("5");
  });
});
