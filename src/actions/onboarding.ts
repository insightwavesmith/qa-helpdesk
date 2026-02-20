"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

// 현재 프로필 조회 (온보딩 페이지용)
export async function getOnboardingProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("name, cohort, shop_url, monthly_ad_budget, category, meta_account_id, onboarding_step, onboarding_status")
    .eq("id", user.id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 온보딩 step 진행
export async function updateOnboardingStep(step: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const updates: Record<string, unknown> = {
    onboarding_step: step,
    onboarding_status: step === 0 ? "not_started" : "in_progress",
  };

  const { error } = await svc
    .from("profiles")
    .update(updates as never)
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// Step 1: 프로필 정보 저장
export async function saveOnboardingProfile(data: {
  name: string;
  shopUrl: string;
  monthlyAdBudget: string;
  category: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({
      name: data.name,
      shop_url: data.shopUrl,
      monthly_ad_budget: data.monthlyAdBudget,
      category: data.category,
      onboarding_step: 2,
      onboarding_status: "in_progress",
    } as never)
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// Step 2: 광고계정 연결
export async function saveAdAccount(metaAccountId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const updates: Record<string, unknown> = {
    onboarding_step: 3,
    onboarding_status: "in_progress",
  };
  if (metaAccountId) {
    updates.meta_account_id = metaAccountId;
  }

  const { error } = await svc
    .from("profiles")
    .update(updates as never)
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// Step 3: 온보딩 완료
export async function completeOnboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({
      onboarding_step: 3,
      onboarding_status: "completed",
    } as never)
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}
