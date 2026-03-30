/**
 * purchase 중복집계 수정 TDD 테스트
 *
 * 버그: purchase → omni_purchase 순서로 폴백하면
 *       purchase가 항상 우선되어 omni_purchase(전체 전환)가 무시됨.
 * 수정: omni_purchase → purchase 순서로 변경.
 *
 * 대상 함수:
 *   - collect-daily-utils.ts: calculateMetrics
 *   - protractor/meta-collector.ts: calculateMetrics
 */
import { describe, it, expect } from "vitest";
import { calculateMetrics as calculateMetricsDaily } from "@/lib/collect-daily-utils";
import { calculateMetrics as calculateMetricsProtr } from "@/lib/protractor/meta-collector";

// ── 헬퍼: Meta API actions 배열 생성 ──────────────────────────────
function makeInsight(opts: {
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}) {
  return {
    impressions: "1000",
    clicks: "100",
    spend: "50",
    reach: "800",
    ctr: "10",
    actions: opts.actions ?? [],
    action_values: opts.action_values ?? [],
  };
}

// ── 두 모듈을 동일 테스트로 검증 ─────────────────────────────────
const modules = [
  { name: "collect-daily-utils", fn: calculateMetricsDaily },
  { name: "meta-collector", fn: calculateMetricsProtr },
] as const;

for (const { name, fn } of modules) {
  describe(`${name} — calculateMetrics purchase 우선순위`, () => {
    it("omni_purchase만 있으면 omni_purchase 값 사용", () => {
      const result = fn(
        makeInsight({
          actions: [{ action_type: "omni_purchase", value: "7" }],
          action_values: [{ action_type: "omni_purchase", value: "350000" }],
        })
      );
      expect(result.purchases).toBe(7);
      expect(result.purchase_value).toBe(350000);
    });

    it("purchase만 있으면 purchase 폴백 사용", () => {
      const result = fn(
        makeInsight({
          actions: [{ action_type: "purchase", value: "3" }],
          action_values: [{ action_type: "purchase", value: "150000" }],
        })
      );
      expect(result.purchases).toBe(3);
      expect(result.purchase_value).toBe(150000);
    });

    it("둘 다 없으면 0 반환", () => {
      const result = fn(makeInsight({}));
      expect(result.purchases).toBe(0);
      expect(result.purchase_value).toBe(0);
    });

    it("둘 다 있으면 omni_purchase만 사용 (합산 아님)", () => {
      const result = fn(
        makeInsight({
          actions: [
            { action_type: "omni_purchase", value: "10" },
            { action_type: "purchase", value: "5" },
          ],
          action_values: [
            { action_type: "omni_purchase", value: "500000" },
            { action_type: "purchase", value: "250000" },
          ],
        })
      );
      // omni_purchase(10) 우선, purchase(5) 무시
      expect(result.purchases).toBe(10);
      expect(result.purchase_value).toBe(500000);
    });

    it("omni_purchase=0이면 purchase로 폴백", () => {
      // || 연산자 특성: 0은 falsy → 폴백 발생
      const result = fn(
        makeInsight({
          actions: [
            { action_type: "omni_purchase", value: "0" },
            { action_type: "purchase", value: "4" },
          ],
          action_values: [
            { action_type: "omni_purchase", value: "0" },
            { action_type: "purchase", value: "200000" },
          ],
        })
      );
      // 0 || 4 = 4 (|| 연산자 동작)
      expect(result.purchases).toBe(4);
      expect(result.purchase_value).toBe(200000);
    });

    it("roas 계산에 purchase_value가 올바르게 반영됨", () => {
      const result = fn(
        makeInsight({
          actions: [
            { action_type: "omni_purchase", value: "10" },
            { action_type: "purchase", value: "5" },
          ],
          action_values: [
            { action_type: "omni_purchase", value: "500" },
            { action_type: "purchase", value: "250" },
          ],
        })
      );
      // roas = purchaseValue / spend = 500 / 50 = 10
      expect(result.roas).toBe(10);
    });
  });
}
