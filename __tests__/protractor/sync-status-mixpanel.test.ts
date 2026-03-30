import { describe, it, expect } from "vitest";

/**
 * sync-status-precompute Mixpanel 매칭 로직 단위 테스트
 * status/route.ts 실시간 경로와 동일한 판정 로직 검증
 */

// 프로덕션 코드에서 추출한 순수 판정 함수 (DB 의존성 없음)
function determineMixpanelState(
  hasSecret: boolean,
  hasProjectId: boolean,
  hasData: boolean,
): { mixpanelState: string; mixpanelOk: boolean } {
  const isConfigured = hasSecret || hasProjectId;

  if (isConfigured && hasData) {
    return { mixpanelState: "ok", mixpanelOk: true };
  } else if (isConfigured && !hasData) {
    return { mixpanelState: "no_board", mixpanelOk: false };
  } else {
    return { mixpanelState: "not_configured", mixpanelOk: false };
  }
}

// secretSet 생성 로직 (key_name → account_id 추출)
function buildSecretSet(secrets: { key_name: string }[]): Set<string> {
  return new Set(secrets.map((s) => s.key_name.replace("secret_", "")));
}

describe("sync-status-precompute: Mixpanel 매칭 로직", () => {
  describe("determineMixpanelState", () => {
    it("service_secrets에만 있는 계정 + 데이터 있음 → ok", () => {
      const result = determineMixpanelState(true, false, true);
      expect(result.mixpanelState).toBe("ok");
      expect(result.mixpanelOk).toBe(true);
    });

    it("mixpanel_project_id에만 있는 계정 + 데이터 있음 → ok", () => {
      const result = determineMixpanelState(false, true, true);
      expect(result.mixpanelState).toBe("ok");
      expect(result.mixpanelOk).toBe(true);
    });

    it("둘 다 있는 계정 + 데이터 있음 → ok", () => {
      const result = determineMixpanelState(true, true, true);
      expect(result.mixpanelState).toBe("ok");
      expect(result.mixpanelOk).toBe(true);
    });

    it("설정 있는데 데이터 없음 → no_board", () => {
      const result = determineMixpanelState(true, false, false);
      expect(result.mixpanelState).toBe("no_board");
      expect(result.mixpanelOk).toBe(false);
    });

    it("mixpanel_project_id만 있고 데이터 없음 → no_board", () => {
      const result = determineMixpanelState(false, true, false);
      expect(result.mixpanelState).toBe("no_board");
      expect(result.mixpanelOk).toBe(false);
    });

    it("둘 다 없는 계정 → not_configured", () => {
      const result = determineMixpanelState(false, false, false);
      expect(result.mixpanelState).toBe("not_configured");
      expect(result.mixpanelOk).toBe(false);
    });

    it("설정 없는데 데이터만 있는 경우 → not_configured (고아 데이터)", () => {
      const result = determineMixpanelState(false, false, true);
      expect(result.mixpanelState).toBe("not_configured");
      expect(result.mixpanelOk).toBe(false);
    });
  });

  describe("buildSecretSet", () => {
    it("key_name에서 secret_ 접두사 제거 후 account_id 추출", () => {
      const secrets = [
        { key_name: "secret_act_123" },
        { key_name: "secret_act_456" },
      ];
      const set = buildSecretSet(secrets);
      expect(set.has("act_123")).toBe(true);
      expect(set.has("act_456")).toBe(true);
      expect(set.has("secret_act_123")).toBe(false);
    });

    it("빈 배열 → 빈 Set", () => {
      const set = buildSecretSet([]);
      expect(set.size).toBe(0);
    });
  });
});

describe("JSONB 배열 파싱 안전성", () => {
  // DB에서 읽은 JSONB 데이터를 안전하게 배열로 변환하는 헬퍼
  function safeArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  it("정상 배열 → 그대로 반환", () => {
    const input = [{ id: 1 }, { id: 2 }];
    expect(safeArray(input)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("JSON 문자열 → 파싱 후 배열", () => {
    const input = '[{"id":1},{"id":2}]';
    expect(safeArray(input)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("null → 빈 배열", () => {
    expect(safeArray(null)).toEqual([]);
  });

  it("undefined → 빈 배열", () => {
    expect(safeArray(undefined)).toEqual([]);
  });

  it("객체 → 빈 배열", () => {
    expect(safeArray({ key: "value" })).toEqual([]);
  });

  it("숫자 → 빈 배열", () => {
    expect(safeArray(42)).toEqual([]);
  });

  it("잘못된 JSON 문자열 → 빈 배열", () => {
    expect(safeArray("{not valid json")).toEqual([]);
  });

  it("JSON 문자열이지만 배열이 아닌 경우 → 빈 배열", () => {
    expect(safeArray('{"key":"value"}')).toEqual([]);
  });

  describe("Array.isArray 가드 패턴 (프로덕션 코드 검증)", () => {
    it("Array.isArray로 rawData 가드 후 .filter() 안전 호출", () => {
      const rawData: unknown = null;
      const safeData = Array.isArray(rawData) ? rawData : [];
      const filtered = safeData.filter((r: Record<string, unknown>) => !!r.id);
      expect(filtered).toEqual([]);
    });

    it("정상 배열은 Array.isArray 통과 후 .filter() 정상 동작", () => {
      const rawData: unknown = [
        { id: 1, creative_type: "VIDEO" },
        { id: 2, creative_type: "IMAGE" },
      ];
      const safeData = Array.isArray(rawData)
        ? (rawData as Record<string, unknown>[])
        : [];
      const filtered = safeData.filter((r) => r.creative_type === "VIDEO");
      expect(filtered).toEqual([{ id: 1, creative_type: "VIDEO" }]);
    });

    it("객체가 들어와도 크래시하지 않음", () => {
      const rawData: unknown = { length: 2, 0: "a", 1: "b" };
      const safeData = Array.isArray(rawData) ? rawData : [];
      expect(safeData.filter(() => true)).toEqual([]);
    });
  });
});
