"use server";

import { createServiceClient } from "@/lib/db";

/**
 * Phase 5: 회원가입 후 profile 생성 (Cloud SQL용)
 * Supabase DB trigger handle_new_user 대체
 * auth.signUp() 후 이 함수를 호출해야 프로필이 생성됨
 */
export async function ensureProfile(
  userId: string,
  email: string,
  metadata: {
    name: string;
    phone?: string;
    shop_url?: string;
    shop_name?: string;
    business_number?: string;
    cohort?: string;
    invite_code?: string;
  },
) {
  const svc = createServiceClient();

  // 이미 존재하면 스킵 (Supabase trigger가 먼저 만들었을 수 있음)
  const { data: existing } = await svc
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return { error: null };

  const role = metadata.invite_code ? "student" : "lead";

  const { error } = await svc.from("profiles").insert({
    id: userId,
    email,
    name: metadata.name || "",
    phone: metadata.phone || null,
    shop_url: metadata.shop_url || null,
    shop_name: metadata.shop_name || null,
    business_number: metadata.business_number || null,
    cohort: metadata.cohort || null,
    invite_code_used: metadata.invite_code || null,
    role,
    onboarding_status: "not_started",
    onboarding_step: 0,
  } as never);

  if (error) {
    console.error("[ensureProfile] error:", error);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateBusinessCertUrl(userId: string, url: string) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ business_cert_url: url } as never)
    .eq("id", userId);

  if (error) {
    console.error("updateBusinessCertUrl error:", error);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Phase 4: 클라이언트 사이드 프로필 조회 → 서버 액션 전환
 * Cloud SQL Proxy 경유하여 프로필 조회
 */
export async function getProfileById(userId: string) {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("profiles")
      .select("name, role, cohort, shop_name, shop_url, annual_revenue, monthly_ad_budget, category, onboarding_status, meta_account_id, mixpanel_project_id, mixpanel_board_id, mixpanel_secret_key")
      .eq("id", userId)
      .single();
    if (error) {
      console.error("[getProfileById] Supabase error:", error.message, error.code);
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    console.error("[getProfileById] Exception:", err instanceof Error ? err.message : err);
    return { data: null, error: String(err) };
  }
}

/**
 * Phase 4: 클라이언트 사이드 프로필 role/onboarding 조회 → 서버 액션 전환
 */
export async function getProfileRoleStatus(userId: string) {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("role, onboarding_status")
    .eq("id", userId)
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/**
 * Phase 4: 클라이언트 사이드 프로필 업데이트 → 서버 액션 전환
 */
export async function updateProfile(userId: string, updates: Record<string, unknown>) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update(updates)
    .eq("id", userId);
  if (error) return { error: error.message };
  return { error: null };
}

export async function savePrivacyConsent(userId: string) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ privacy_agreed_at: new Date().toISOString() } as never)
    .eq("id", userId);

  if (error) {
    console.error("savePrivacyConsent error:", error);
    return { error: error.message };
  }

  return { error: null };
}
