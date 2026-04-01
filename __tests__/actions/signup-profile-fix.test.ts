import { describe, it, expect, vi, beforeEach } from "vitest";
import { validate as uuidValidate } from "uuid";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

// Mock DB client — flat chaining structure
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

// 체이닝: from → select → eq → maybeSingle/single
//         from → insert → (thenable, await resolves directly)
mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });
mockSelect.mockReturnValue({ eq: mockEq });
mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle, single: mockSingle });
mockInsert.mockReturnValue({ error: null });

vi.mock("@/lib/db", () => ({
  createServiceClient: () => ({ from: mockFrom }),
  createDbClient: () => ({ from: mockFrom }),
}));

// auth.ts 함수 import (mock 적용된 상태)
import { ensureProfile, getProfileById } from "@/actions/auth";

const FIREBASE_UID = "931EZvrM96MdN8Kx0QijFgd4njk2";
const EXPECTED_UUID = toProfileId(FIREBASE_UID);
const SUPABASE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("SP-05~SP-10: Gateway 함수 통합 테스트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 프로필 없음
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockInsert.mockReturnValue({ error: null });
    // 체이닝 재설정
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle, single: mockSingle });
  });

  // SP-05: Firebase UID로 ensureProfile → UUID v5로 INSERT
  it("SP-05: ensureProfile — Firebase UID를 UUID v5로 변환하여 INSERT", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await ensureProfile(FIREBASE_UID, "test@test.com", { name: "테스트" });

    expect(result.error).toBeNull();
    // .eq("id", ???)에 전달된 값이 UUID v5인지 확인
    expect(mockEq).toHaveBeenCalledWith("id", EXPECTED_UUID);
    // INSERT에 전달된 id가 UUID v5인지 확인
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: EXPECTED_UUID }),
    );
    // 결과가 유효한 UUID인지
    expect(uuidValidate(EXPECTED_UUID)).toBe(true);
  });

  // SP-06: 동일 Firebase UID 재호출 → 기존 row 발견 → INSERT 스킵
  it("SP-06: ensureProfile — 이미 존재하면 INSERT 스킵", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: EXPECTED_UUID }, error: null });

    const result = await ensureProfile(FIREBASE_UID, "test@test.com", { name: "테스트" });

    expect(result.error).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // SP-07: 기존 Supabase UUID → 변환 없이 그대로 사용
  it("SP-07: ensureProfile — Supabase UUID는 변환 없이 통과", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureProfile(SUPABASE_UUID, "test@test.com", { name: "테스트" });

    expect(mockEq).toHaveBeenCalledWith("id", SUPABASE_UUID);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUPABASE_UUID }),
    );
  });

  // SP-08: Firebase UID로 getProfileById → 변환된 UUID로 조회
  it("SP-08: getProfileById — Firebase UID를 UUID v5로 변환하여 조회", async () => {
    mockSingle.mockResolvedValue({
      data: { name: "테스트", role: "student" },
      error: null,
    });

    const result = await getProfileById(FIREBASE_UID);

    expect(result.data).toBeTruthy();
    expect(mockEq).toHaveBeenCalledWith("id", EXPECTED_UUID);
  });

  // SP-09: Firebase UID가 DB에 없는 경우 ensureProfile로 복구 가능
  it("SP-09: 프로필 없는 Firebase UID → ensureProfile로 생성 성공", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInsert.mockReturnValue({ error: null });

    const result = await ensureProfile(FIREBASE_UID, "new@test.com", {
      name: "신규유저",
      invite_code: "ABC123",
    });

    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXPECTED_UUID,
        role: "student",
        invite_code_used: "ABC123",
      }),
    );
  });

  // SP-10: 기존 Supabase 유저 → getProfileById 정상 조회
  it("SP-10: Supabase UUID 유저 → 기존 프로필 정상 조회", async () => {
    mockSingle.mockResolvedValue({
      data: { name: "기존유저", role: "admin" },
      error: null,
    });

    const result = await getProfileById(SUPABASE_UUID);

    expect(result.data?.name).toBe("기존유저");
    expect(mockEq).toHaveBeenCalledWith("id", SUPABASE_UUID);
  });

  // 추가: Firebase UID 원본이 .eq()에 절대 전달되지 않는지
  it("Firebase UID 원본이 .eq()에 절대 전달되지 않음", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureProfile(FIREBASE_UID, "test@test.com", { name: "테스트" });

    const eqCalls = mockEq.mock.calls;
    for (const call of eqCalls) {
      expect(call[1]).not.toBe(FIREBASE_UID);
      expect(uuidValidate(call[1] as string)).toBe(true);
    }
  });
});
