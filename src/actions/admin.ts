"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";
import type { Database } from "@/types/database";
import { requireAdmin, requireStaff } from "@/lib/auth-utils";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function getMembers({
  page = 1,
  pageSize = 20,
  role,
}: { page?: number; pageSize?: number; role?: string } = {}) {
  const supabase = await requireStaff();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (role && role !== "all") {
    query = query.eq("role", role as "lead" | "member" | "student" | "assistant" | "admin");
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getMembers error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function approveMember(
  userId: string,
  newRole: "member" | "student" = "member",
  extra?: {
    cohort?: string;
    meta_account_id?: string;
    mixpanel_project_id?: string;
    mixpanel_secret_key?: string;
  }
) {
  const supabase = await requireAdmin();

  const update: ProfileUpdate = { role: newRole };
  if (extra?.cohort) update.cohort = extra.cohort;
  if (extra?.meta_account_id) update.meta_account_id = extra.meta_account_id;
  if (extra?.mixpanel_project_id) update.mixpanel_project_id = extra.mixpanel_project_id;
  if (extra?.mixpanel_secret_key) update.mixpanel_secret_key = extra.mixpanel_secret_key;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("approveMember error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/members");

  // T2: 승인 완료 메일 발송 (fire-and-forget)
  sendApprovalEmail(userId, supabase).catch((err) =>
    console.error("승인 메일 발송 실패 (무시됨):", err)
  );

  return { error: null };
}

/** 승인 완료 알림 메일 발송 (실패해도 승인에 영향 없음) */
async function sendApprovalEmail(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const { data } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .single();

  if (!data?.email) return;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://bscamp.kr";
  const name = data.name || "회원";

  await transporter.sendMail({
    from: `"자사몰사관학교" <${process.env.SMTP_USER}>`,
    to: data.email,
    subject: "[자사몰사관학교] 회원 승인이 완료되었습니다",
    html: `
      <div style="font-family: 'Pretendard', -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <h2 style="color: #111827; font-size: 20px; margin-bottom: 16px;">${name}님, 승인이 완료되었습니다!</h2>
        <p style="color: #6B7280; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
          자사몰사관학교 헬프데스크 회원 승인이 완료되어 안내드립니다.<br/>
          아래 버튼을 클릭하여 로그인하시면 서비스를 이용하실 수 있습니다.
        </p>
        <a href="${baseUrl}/login" style="display: inline-block; background: #F75D5D; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
          로그인하기
        </a>
        <p style="color: #9CA3AF; font-size: 13px; margin-top: 32px;">
          본 메일은 자사몰사관학교 헬프데스크에서 자동 발송되었습니다.
        </p>
      </div>
    `,
  });
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
        .in("role", ["member", "student"]),
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

// A4b: 회원 삭제 (lead/member만 가능, profiles + auth.users 삭제)
export async function deleteMember(userId: string) {
  const svc = await requireAdmin();

  // 삭제 대상 role 확인
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile) return { error: "회원을 찾을 수 없습니다." };

  if (!["lead", "member"].includes(profile.role)) {
    return { error: "수강생과 관리자는 삭제할 수 없습니다." };
  }

  // 1. profiles 삭제 (FK ON DELETE SET NULL로 관련 레코드 안전)
  const { error: profileError } = await svc
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileError) {
    console.error("deleteMember profiles error:", profileError);
    return { error: profileError.message };
  }

  // 2. auth.users 삭제
  const { error: authError } = await svc.auth.admin.deleteUser(userId);

  if (authError) {
    console.error("deleteMember auth error:", authError);
    return { error: `프로필 삭제됨, auth 삭제 실패: ${authError.message}` };
  }

  revalidatePath("/admin/members");
  return { error: null };
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
