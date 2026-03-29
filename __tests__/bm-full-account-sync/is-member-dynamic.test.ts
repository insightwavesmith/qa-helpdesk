/**
 * creatives is_member 동적 판단 테스트
 *
 * 설계서 §4.3: ad_accounts.is_member 맵 기반 동적 설정
 * - is_member=true 계정 → creatives.is_member=true, source="member"
 * - is_member=false 계정 → creatives.is_member=false, source="discovered"
 * - 맵에 없는 계정 → is_member=false (기본값)
 */
import { describe, it, expect } from "vitest";

// --- 테스트 대상 함수 (collect-daily에서 export 예정) ---
import { getIsMember, getSource } from "@/app/api/cron/collect-daily/route";

describe("creatives is_member dynamic lookup", () => {
  const memberMap = new Map<string, boolean>([
    ["111", true],
    ["222", true],
    ["333", false],
    ["444", false],
  ]);

  describe("getIsMember", () => {
    it("수강생 계정(is_member=true) → true", () => {
      expect(getIsMember(memberMap, "111")).toBe(true);
    });

    it("비수강생 계정(is_member=false) → false", () => {
      expect(getIsMember(memberMap, "333")).toBe(false);
    });

    it("맵에 없는 계정 → false (기본값)", () => {
      expect(getIsMember(memberMap, "99999")).toBe(false);
    });

    it("빈 맵 → false", () => {
      expect(getIsMember(new Map(), "111")).toBe(false);
    });
  });

  describe("getSource", () => {
    it("is_member=true → source='member'", () => {
      expect(getSource(memberMap, "111")).toBe("member");
    });

    it("is_member=false → source='discovered'", () => {
      expect(getSource(memberMap, "333")).toBe("discovered");
    });

    it("맵에 없는 계정 → source='discovered'", () => {
      expect(getSource(memberMap, "99999")).toBe("discovered");
    });
  });
});
