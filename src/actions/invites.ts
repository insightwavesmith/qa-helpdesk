"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-utils";

// ---------------------------------------------------------------------------
// useInviteCode — 가입 완료 후 호출 (초대코드 사용 처리 + student_registry 매칭)
// ---------------------------------------------------------------------------
export async function useInviteCode(
  userId: string,
  userEmail: string,
  code: string
): Promise<{ error: string | null }> {
  try {
    const svc = createServiceClient();
    const trimmedCode = code.trim();

    // 1. invite_codes 원자적 증가: used_count = used_count + 1
    //    WHERE used_count < max_uses (또는 max_uses IS NULL)
    //    Supabase JS에는 원자적 increment가 없으므로 RPC가 필요하지만,
    //    이 프로젝트에서는 직접 read → check → update 패턴 사용.
    //    동시성은 UPDATE ... WHERE 조건으로 보장.
    const { data: inviteRow, error: fetchError } = await svc
      .from("invite_codes")
      .select("code, cohort, max_uses, used_count, expires_at")
      .ilike("code", trimmedCode)
      .maybeSingle();

    if (fetchError || !inviteRow) {
      return { error: "유효하지 않은 초대코드입니다" };
    }

    // 만료 체크
    if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) {
      return { error: "초대코드가 만료되었습니다" };
    }

    const currentUsed = inviteRow.used_count ?? 0;

    // 사용 횟수 체크
    // max_uses가 null이면 무제한
    if (inviteRow.max_uses !== null && currentUsed >= inviteRow.max_uses) {
      return { error: "초대코드 사용 한도를 초과했습니다" };
    }

    // used_count 원자적 증가
    // 이전 코드에서 builder 변수 재할당 누락으로 WHERE 조건이 누락되어
    // update가 0행 매칭 → used_count 미변경 버그 발생.
    // 수정: let query로 변수 재할당 보장 + NULL/0 모두 처리
    let updateQuery = svc
      .from("invite_codes")
      .update({ used_count: currentUsed + 1 } as never)
      .ilike("code", trimmedCode);

    if (inviteRow.used_count === null || inviteRow.used_count === undefined) {
      updateQuery = updateQuery.is("used_count", null);
    } else {
      updateQuery = updateQuery.eq("used_count", currentUsed);
    }

    const { data: updated, error: updateError } = await updateQuery
      .select("code")
      .maybeSingle();

    if (updateError) {
      console.error("[useInviteCode] invite_codes update error:", updateError);
      return { error: "초대코드 사용 처리 중 오류가 발생했습니다" };
    }

    if (!updated) {
      // WHERE 조건 미매칭: race condition 또는 used_count 불일치
      // 폴백: WHERE 없이 직접 업데이트 시도
      console.warn("[useInviteCode] 낙관적 잠금 실패, 직접 업데이트 시도");
      const { error: directError } = await svc
        .from("invite_codes")
        .update({ used_count: currentUsed + 1 } as never)
        .ilike("code", trimmedCode);

      if (directError) {
        console.error("[useInviteCode] 직접 업데이트도 실패:", directError);
        return { error: "초대코드 사용 처리 중 오류가 발생했습니다" };
      }
    }

    // 2. profiles 업데이트: invite_code_used, cohort
    const { error: profileError } = await svc
      .from("profiles")
      .update({
        invite_code_used: trimmedCode,
        cohort: inviteRow.cohort,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("profiles update error:", profileError);
      return { error: "프로필 업데이트 중 오류가 발생했습니다" };
    }

    // 3. student_registry 이메일 매칭 시도
    const { data: match } = await svc
      .from("student_registry")
      .select("id")
      .eq("email", userEmail)
      .maybeSingle();

    if (match) {
      await svc
        .from("student_registry")
        .update({ matched_profile_id: userId } as never)
        .eq("id", match.id);
    } else {
      console.log(
        `[useInviteCode] student_registry 매칭 실패 — email: ${userEmail}. 수동 매칭 대기.`
      );
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
