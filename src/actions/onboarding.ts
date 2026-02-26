"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// 현재 프로필 조회 (온보딩 페이지용)
export async function getOnboardingProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("name, cohort, shop_name, shop_url, annual_revenue, monthly_ad_budget, category, meta_account_id, mixpanel_project_id, mixpanel_secret_key, onboarding_step, onboarding_status")
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
  shopName: string;
  shopUrl: string;
  annualRevenue: string;
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
      shop_name: data.shopName,
      shop_url: data.shopUrl,
      annual_revenue: data.annualRevenue,
      monthly_ad_budget: data.monthlyAdBudget,
      category: data.category,
      onboarding_step: 2,
      onboarding_status: "in_progress",
    } as never)
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

// Step 2: 광고계정 + 믹스패널 연결
export async function saveAdAccount(data: {
  metaAccountId: string | null;
  mixpanelProjectId: string | null;
  mixpanelSecretKey: string | null;
  mixpanelBoardId?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const updates: Record<string, unknown> = {
    onboarding_step: 3,
    onboarding_status: "in_progress",
  };
  if (data.metaAccountId) {
    updates.meta_account_id = data.metaAccountId;
  }
  if (data.mixpanelProjectId) {
    updates.mixpanel_project_id = data.mixpanelProjectId;
  }
  if (data.mixpanelSecretKey) {
    updates.mixpanel_secret_key = data.mixpanelSecretKey;
  }
  if (data.mixpanelBoardId) {
    updates.mixpanel_board_id = data.mixpanelBoardId;
  }

  const { error } = await svc
    .from("profiles")
    .update(updates as never)
    .eq("id", user.id);

  if (error) return { error: error.message };

  // ad_accounts + service_secrets 동기화 (총가치각도기 연동)
  if (data.metaAccountId) {
    const { data: existing } = await svc
      .from("ad_accounts")
      .select("id")
      .eq("account_id", data.metaAccountId)
      .maybeSingle();

    if (existing) {
      await svc.from("ad_accounts").update({
        user_id: user.id,
        active: true,
        mixpanel_project_id: data.mixpanelProjectId || null,
        mixpanel_board_id: data.mixpanelBoardId || null,
      }).eq("id", existing.id);
    } else {
      await svc.from("ad_accounts").insert({
        account_id: data.metaAccountId,
        user_id: user.id,
        account_name: data.metaAccountId,
        mixpanel_project_id: data.mixpanelProjectId || null,
        mixpanel_board_id: data.mixpanelBoardId || null,
        active: true,
      });
    }

    if (data.mixpanelSecretKey) {
      await svc
        .from("service_secrets" as never)
        .upsert({
          user_id: user.id,
          service: "mixpanel",
          key_name: `secret_${data.metaAccountId}`,
          key_value: data.mixpanelSecretKey,
        } as never, { onConflict: "user_id,service,key_name" } as never);
    }
  }

  return { error: null };
}

// 설정 페이지에서 광고계정 동기화 (ad_accounts + service_secrets)
export async function syncAdAccount(data: {
  metaAccountId: string | null;
  mixpanelProjectId: string | null;
  mixpanelSecretKey: string | null;
  mixpanelBoardId: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();

  if (data.metaAccountId) {
    const { data: existing } = await svc
      .from("ad_accounts")
      .select("id")
      .eq("account_id", data.metaAccountId)
      .maybeSingle();

    if (existing) {
      await svc.from("ad_accounts").update({
        user_id: user.id,
        mixpanel_project_id: data.mixpanelProjectId || null,
        mixpanel_board_id: data.mixpanelBoardId || null,
        active: true,
      }).eq("id", existing.id);
    } else {
      await svc.from("ad_accounts").insert({
        account_id: data.metaAccountId,
        user_id: user.id,
        account_name: data.metaAccountId,
        mixpanel_project_id: data.mixpanelProjectId || null,
        mixpanel_board_id: data.mixpanelBoardId || null,
        active: true,
      });
    }

    if (data.mixpanelSecretKey) {
      await svc
        .from("service_secrets" as never)
        .upsert({
          user_id: user.id,
          service: "mixpanel",
          key_name: `secret_${data.metaAccountId}`,
          key_value: data.mixpanelSecretKey,
        } as never, { onConflict: "user_id,service,key_name" } as never);
    }
  } else {
    // meta_account_id가 비었으면 기존 ad_accounts 비활성화
    await svc.from("ad_accounts").update({ active: false }).eq("user_id", user.id);
  }

  return { error: null };
}

// 광고계정 추가 (기존 계정 유지하면서 새 계정 추가)
export async function addAdAccount(data: {
  metaAccountId: string;
  accountName?: string;
  mixpanelProjectId?: string | null;
  mixpanelSecretKey?: string | null;
  mixpanelBoardId?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();

  // ad_accounts INSERT or UPDATE
  const { data: existing } = await svc
    .from("ad_accounts")
    .select("id")
    .eq("account_id", data.metaAccountId)
    .maybeSingle();

  if (existing) {
    await svc.from("ad_accounts").update({
      user_id: user.id,
      account_name: data.accountName || data.metaAccountId,
      mixpanel_project_id: data.mixpanelProjectId || null,
      mixpanel_board_id: data.mixpanelBoardId || null,
      active: true,
    }).eq("id", existing.id);
  } else {
    await svc.from("ad_accounts").insert({
      account_id: data.metaAccountId,
      user_id: user.id,
      account_name: data.accountName || data.metaAccountId,
      mixpanel_project_id: data.mixpanelProjectId || null,
      mixpanel_board_id: data.mixpanelBoardId || null,
      active: true,
    });
  }

  // service_secrets UPSERT (믹스패널 시크릿키)
  if (data.mixpanelSecretKey) {
    await svc
      .from("service_secrets" as never)
      .upsert({
        user_id: user.id,
        service: "mixpanel",
        key_name: `secret_${data.metaAccountId}`,
        key_value: data.mixpanelSecretKey,
      } as never, { onConflict: "user_id,service,key_name" } as never);
  }

  // 첫 번째 계정이면 profiles.meta_account_id에도 설정 (대표 계정)
  const { data: existingAccounts } = await svc
    .from("ad_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true);

  if (existingAccounts && existingAccounts.length <= 1) {
    await svc.from("profiles").update({
      meta_account_id: data.metaAccountId,
    } as never).eq("id", user.id);
  }

  return { error: null };
}

// 광고계정 삭제 (비활성화 + service_secrets 정리)
export async function removeAdAccount(accountId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();

  // ad_accounts 비활성화
  await svc.from("ad_accounts").update({ active: false }).eq("account_id", accountId).eq("user_id", user.id);

  // service_secrets 삭제
  await svc
    .from("service_secrets" as never)
    .delete()
    .eq("user_id" as never, user.id)
    .eq("service" as never, "mixpanel")
    .eq("key_name" as never, `secret_${accountId}`);

  // 대표 계정이었으면 다른 활성 계정으로 교체
  const { data: profile } = await svc.from("profiles").select("meta_account_id").eq("id", user.id).single();
  if (profile?.meta_account_id === accountId) {
    const { data: remaining } = await svc
      .from("ad_accounts")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1);
    await svc.from("profiles").update({
      meta_account_id: remaining?.[0]?.account_id || null,
    } as never).eq("id", user.id);
  }

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

  // 캐시 쿠키 무효화 — 미들웨어가 다음 요청에서 DB 재조회
  const cookieStore = await cookies();
  cookieStore.delete("x-user-role");
  cookieStore.delete("x-onboarding-status");

  return { error: null };
}
