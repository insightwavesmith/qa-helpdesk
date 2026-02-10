"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("권한이 없습니다.");
  return svc;
}

export async function getMembers({
  page = 1,
  pageSize = 20,
  role,
}: { page?: number; pageSize?: number; role?: string } = {}) {
  const supabase = await requireAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (role && role !== "all") {
    query = query.eq("role", role as "lead" | "member" | "student" | "alumni" | "admin");
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getMembers error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function approveMember(userId: string, newRole: "member" | "student" = "member") {
  const supabase = await requireAdmin();

  const update: ProfileUpdate = { role: newRole };
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("approveMember error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/members");
  return { error: null };
}

export async function rejectMember(userId: string, reason?: string) {
  const supabase = await requireAdmin();

  const update: ProfileUpdate = { role: "lead" };
  if (reason) update.reject_reason = reason;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("rejectMember error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/members");
  return { error: null };
}

export async function getDashboardStats() {
  const supabase = createServiceClient();

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [questionsResult, weeklyResult, openResult, pendingAnswersResult, postsResult, membersResult] =
    await Promise.all([
      supabase.from("questions").select("id", { count: "exact", head: true }),
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneWeekAgo.toISOString()),
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("answers")
        .select("id", { count: "exact", head: true })
        .eq("is_approved", false),
      supabase
        .from("contents")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["member", "student", "alumni"]),
    ]);

  return {
    totalQuestions: questionsResult.count || 0,
    weeklyQuestions: weeklyResult.count || 0,
    openQuestions: openResult.count || 0,
    pendingAnswers: pendingAnswersResult.count || 0,
    totalPosts: postsResult.count || 0,
    activeMembers: membersResult.count || 0,
  };
}

export async function getWeeklyQuestionStats() {
  const supabase = createServiceClient();

  // Last 4 weeks of daily question counts
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const { data, error } = await supabase
    .from("questions")
    .select("created_at")
    .gte("created_at", fourWeeksAgo.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getWeeklyQuestionStats error:", error);
    return [];
  }

  // Group by date
  const dailyCounts: Record<string, number> = {};
  for (let i = 0; i < 28; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const key = d.toISOString().split("T")[0];
    dailyCounts[key] = 0;
  }

  data?.forEach((q) => {
    const key = q.created_at.split("T")[0];
    if (dailyCounts[key] !== undefined) {
      dailyCounts[key]++;
    }
  });

  return Object.entries(dailyCounts).map(([date, count]) => ({
    date,
    label: `${parseInt(date.split("-")[1])}/${parseInt(date.split("-")[2])}`,
    질문수: count,
  }));
}

export async function getRecentQuestions(limit = 5) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("questions")
    .select(
      "*, author:profiles!questions_author_id_fkey(name), category:qa_categories!questions_category_id_fkey(name)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentQuestions error:", error);
    return [];
  }

  return data || [];
}

export async function getRecentPosts(limit = 5) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("contents")
    .select("id, title, category, status, created_at, thumbnail_url")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentPosts error:", error);
    return [];
  }

  return data || [];
}

// A1: 수강생 상세 — 프로필 + 배정된 광고계정 조회
export async function getMemberDetail(userId: string) {
  const svc = await requireAdmin();
  const [profileRes, accountsRes] = await Promise.all([
    svc.from('profiles').select('*').eq('id', userId).single(),
    svc.from('ad_accounts').select('*').eq('user_id', userId).order('account_name'),
  ]);
  return { profile: profileRes.data, accounts: accountsRes.data || [] };
}

// A2: 프로필 수정
export async function updateMember(userId: string, data: ProfileUpdate) {
  const svc = await requireAdmin();
  const { error } = await svc.from('profiles').update(data).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/members');
  return { error: null };
}

// A3: 역할 변경
export async function changeRole(userId: string, newRole: string) {
  const svc = await requireAdmin();
  const { error } = await svc.from('profiles').update({ role: newRole as ProfileUpdate['role'] }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/members');
  return { error: null };
}

// A4: 비활성화/재활성화
export async function deactivateMember(userId: string) {
  return changeRole(userId, 'inactive');
}

// A5: 광고계정 추가
export async function addAdAccount(data: { accountId: string; accountName: string; userId?: string }) {
  const svc = await requireAdmin();
  const { error } = await svc.from('ad_accounts').insert({
    account_id: data.accountId,
    account_name: data.accountName,
    user_id: data.userId || null,
    active: true,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/accounts');
  return { error: null };
}

// A6: 광고계정 수정
export async function updateAdAccount(id: string, data: { account_name?: string; mixpanel_project_id?: string; mixpanel_board_id?: string }) {
  const svc = await requireAdmin();
  const { error } = await svc.from('ad_accounts').update(data).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/accounts');
  return { error: null };
}

// A7: 광고계정 활성/비활성 토글
export async function toggleAdAccount(id: string, active: boolean) {
  const svc = await requireAdmin();
  const { error } = await svc.from('ad_accounts').update({ active }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/accounts');
  return { error: null };
}
