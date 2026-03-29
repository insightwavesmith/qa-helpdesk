/**
 * collect-daily 배치 분할 + 동적 배치 로직 테스트
 *
 * 설계서 §4.2: batch 파라미터 없이 단일 호출 시 전체 계정 처리
 * 설계서 §4.2 방안 B: 내부 자동 분할, 하위 호환 유지
 */
import { describe, it, expect } from "vitest";

// --- 테스트 대상 함수 (collect-daily에서 export 예정) ---
import { splitIntoBatches } from "@/app/api/cron/collect-daily/route";

describe("collect-daily batch splitting", () => {
  it("150개 계정을 20개씩 8개 배치로 분할", () => {
    const accounts = Array.from({ length: 150 }, (_, i) => ({
      account_id: `${i}`,
      account_name: `acc-${i}`,
    }));
    const batches = splitIntoBatches(accounts, 20);
    expect(batches).toHaveLength(8);
    expect(batches[0]).toHaveLength(20);
    expect(batches[7]).toHaveLength(10); // 마지막 배치 나머지
  });

  it("40개 계정을 20개씩 2개 배치로 분할", () => {
    const accounts = Array.from({ length: 40 }, (_, i) => ({
      account_id: `${i}`,
      account_name: `acc-${i}`,
    }));
    const batches = splitIntoBatches(accounts, 20);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(20);
    expect(batches[1]).toHaveLength(20);
  });

  it("0개 계정이면 빈 배열 반환", () => {
    const batches = splitIntoBatches([], 20);
    expect(batches).toHaveLength(0);
  });

  it("배치 크기보다 적으면 1개 배치", () => {
    const accounts = Array.from({ length: 5 }, (_, i) => ({
      account_id: `${i}`,
      account_name: `acc-${i}`,
    }));
    const batches = splitIntoBatches(accounts, 20);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5);
  });

  it("정확히 배치 크기와 같으면 1개 배치", () => {
    const accounts = Array.from({ length: 20 }, (_, i) => ({
      account_id: `${i}`,
      account_name: `acc-${i}`,
    }));
    const batches = splitIntoBatches(accounts, 20);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);
  });

  it("모든 계정이 어딘가 배치에 포함됨 (유실 없음)", () => {
    const accounts = Array.from({ length: 153 }, (_, i) => ({
      account_id: `${i}`,
      account_name: `acc-${i}`,
    }));
    const batches = splitIntoBatches(accounts, 20);
    const totalInBatches = batches.reduce((sum, b) => sum + b.length, 0);
    expect(totalInBatches).toBe(153);
  });
});
