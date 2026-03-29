/**
 * discover-accounts 계정 UPSERT 로직 테스트
 *
 * 설계서 §8.3: 기존 is_member=true 보존 검증
 * - 신규 계정: is_member=false로 INSERT
 * - 기존 계정: is_member 유지, 메타 정보만 UPDATE
 * - API에서 사라진 계정: active=false
 */
import { describe, it, expect } from "vitest";

// discover-accounts의 UPSERT 로직을 순수 함수로 추출하여 테스트
// 실제 구현은 route.ts에서 DB 호출하지만, 핵심 로직 검증

import {
  buildNewAccountRow,
  buildUpdateFields,
  findAccountsToDeactivate,
} from "@/app/api/cron/discover-accounts/route";

describe("discover-accounts upsert logic", () => {
  const now = "2026-03-30T00:00:00.000Z";

  describe("buildNewAccountRow", () => {
    it("신규 계정은 is_member=false, active=true", () => {
      const row = buildNewAccountRow(
        { account_id: "999", name: "새계정", account_status: 1, currency: "KRW" },
        now
      );
      expect(row.is_member).toBe(false);
      expect(row.active).toBe(true);
      expect(row.account_id).toBe("999");
      expect(row.discovered_at).toBe(now);
    });
  });

  describe("buildUpdateFields", () => {
    it("기존 계정 업데이트 시 is_member 필드 없음 (보존)", () => {
      const fields = buildUpdateFields(
        { name: "변경된이름", account_status: 1, currency: "KRW" },
        now
      );
      expect(fields).not.toHaveProperty("is_member");
      expect(fields.account_name).toBe("변경된이름");
      expect(fields.active).toBe(true);
      expect(fields.last_checked_at).toBe(now);
    });
  });

  describe("findAccountsToDeactivate", () => {
    it("API 응답에 없는 활성 계정 목록 반환", () => {
      const dbActiveIds = ["111", "222", "333", "444"];
      const apiProcessedIds = ["111", "333"];
      const toDeactivate = findAccountsToDeactivate(dbActiveIds, apiProcessedIds);
      expect(toDeactivate).toEqual(["222", "444"]);
    });

    it("전부 API에 있으면 빈 배열", () => {
      const dbActiveIds = ["111", "222"];
      const apiProcessedIds = ["111", "222"];
      const toDeactivate = findAccountsToDeactivate(dbActiveIds, apiProcessedIds);
      expect(toDeactivate).toEqual([]);
    });

    it("DB에 활성 계정 없으면 빈 배열", () => {
      const toDeactivate = findAccountsToDeactivate([], ["111"]);
      expect(toDeactivate).toEqual([]);
    });
  });
});
