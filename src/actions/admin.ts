"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function getMembers({
  page = 1,
  pageSize = 20,
  role,
}: { page?: number; pageSize?: number; role?: string } = {}) {
  const supabase = createServiceClient();
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
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole } as never)
    .eq("id", userId);

  if (error) {
    console.error("approveMember error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/members");
  return { error: null };
}

export async function rejectMember(userId: string, reason?: string) {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = { role: "lead" };
  if (reason) update.reject_reason = reason;

  const { error } = await supabase
    .from("profiles")
    .update(update as never)
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

  const questionsResult = await supabase
    .from("questions")
    .select("*", { count: "exact" });

  const pendingAnswersResult = await supabase
    .from("answers")
    .select("*", { count: "exact" })
    .eq("is_approved", false);

  const postsResult = await supabase
    .from("posts")
    .select("*", { count: "exact" })
    .eq("is_published", true);

  // member, student, alumni 모두 활성 회원으로 카운트
  const membersResult = await supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .in("role", ["member", "student", "alumni"]);

  // This week's questions count
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const questions = questionsResult.data || [];
  const weeklyQuestions = questions.filter(
    (q) => new Date(q.created_at) > oneWeekAgo
  ).length;

  // Open (unanswered) questions
  const openQuestions = questions.filter((q) => q.status === "open").length;

  return {
    totalQuestions: questionsResult.count || 0,
    weeklyQuestions,
    openQuestions,
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
    .select("*")
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
    .from("posts")
    .select(
      "*, author:profiles!posts_author_id_fkey(name)"
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentPosts error:", error);
    return [];
  }

  return data || [];
}
