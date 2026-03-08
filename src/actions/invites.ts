"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-utils";

// ---------------------------------------------------------------------------
// useInviteCode — 가입 완료 후 호출 (초대코드 사용 처리 + student_registry 매칭)
// DB RPC 함수(consume_invite_code)로 원자적 처리: FOR UPDATE 행잠금 + 단일 트랜잭션
// ---------------------------------------------------------------------------
export async function useInviteCode(
  userId: string,
  userEmail: string,
  code: string
): Promise<{ error: string | null }> {
  try {
    const svc = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcError } = await (svc.rpc as any)(
      "consume_invite_code",
      {
        p_user_id: userId,
        p_email: userEmail,
        p_code: code.trim(),
      }
    );

    if (rpcError) {
      console.error("[useInviteCode] RPC error:", rpcError);
      return { error: "초대코드 사용 처리 중 오류가 발생했습니다" };
    }

    // RPC 함수는 jsonb_build_object('error', ...) 반환
    const result = data as { error: string | null } | null;
    if (result?.error) {
      console.error("[useInviteCode] RPC returned error:", result.error);
      return { error: result.error };
    }

    return { error: null };
  } catch (err) {
    console.error("useInviteCode unexpected error:", err);
    return { error: "서버 오류가 발생했습니다" };
  }
}

// ---------------------------------------------------------------------------
// getInviteCodes — 관리자용: 전체 초대코드 목록
// ---------------------------------------------------------------------------
export async function getInviteCodes() {
  const svc = await requireAdmin();

  const { data, error } = await svc
    .from("invite_codes")
    .select("*")
    .order("expires_at", { ascending: false });

  if (error) {
    console.error("getInviteCodes error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

// ---------------------------------------------------------------------------
// createInviteCode — 관리자용: 초대코드 생성
// ---------------------------------------------------------------------------
export async function createInviteCode(input: {
  code: string;
  cohort: string;
  expiresAt: string;
  maxUses: number;
}): Promise<{ error: string | null }> {
  const svc = await requireAdmin();

  // auth check already done by requireAdmin; get userId for created_by
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await svc.from("invite_codes").insert({
    code: input.code.trim(),
    cohort: input.cohort,
    expires_at: input.expiresAt,
    max_uses: input.maxUses,
    used_count: 0,
    created_by: user!.id,
  });

  if (error) {
    console.error("createInviteCode error:", error);
    // 중복 코드 에러 처리
    if (error.code === "23505") {
      return { error: "이미 존재하는 초대코드입니다" };
    }
    return { error: error.message };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// updateInviteCodeExpiry — 관리자용: 초대코드 만료일 연장 (재활성화)
// ---------------------------------------------------------------------------
export async function updateInviteCodeExpiry(
  code: string,
  expiresAt: string
): Promise<{ error: string | null }> {
  const svc = await requireAdmin();

  const { error } = await svc
    .from("invite_codes")
    .update({ expires_at: expiresAt } as never)
    .eq("code", code);

  if (error) {
    console.error("updateInviteCodeExpiry error:", error);
    return { error: error.message };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// deleteInviteCode — 관리자용: 초대코드 삭제
// ---------------------------------------------------------------------------
export async function deleteInviteCode(
  code: string
): Promise<{ error: string | null }> {
  const svc = await requireAdmin();

  const { error } = await svc
    .from("invite_codes")
    .delete()
    .eq("code", code);

  if (error) {
    console.error("deleteInviteCode error:", error);
    return { error: error.message };
  }

  return { error: null };
}
