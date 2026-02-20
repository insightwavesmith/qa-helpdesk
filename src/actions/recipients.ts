"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export type RecipientTarget =
  | "all"
  | "all_leads"
  | "all_students"
  | "all_members"
  | "custom";

export interface Recipient {
  email: string;
  name: string;
  source: "lead" | "member" | "student_registry";
}

export interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  all_deduplicated: number;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("인증이 필요합니다.");
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("관리자 권한이 필요합니다.");
  }

  return svc;
}

export async function getRecipients(
  target: RecipientTarget,
  customEmails?: string[]
): Promise<{ recipients: Recipient[]; error: string | null }> {
  try {
    const svc = await requireAdmin();

    if (target === "custom") {
      if (!customEmails || customEmails.length === 0) {
        return { recipients: [], error: "직접 입력 시 이메일 주소가 필요합니다." };
      }
      return {
        recipients: customEmails.map((email) => ({
          email,
          name: "",
          source: "lead" as const,
        })),
        error: null,
      };
    }

    if (target === "all_leads") {
      const { data } = await svc
        .from("leads")
        .select("email, name")
        .eq("email_opted_out", false)
        .limit(5000);
      return {
        recipients: (data || []).map((r) => ({
          email: r.email,
          name: r.name || "",
          source: "lead" as const,
        })),
        error: null,
      };
    }

    if (target === "all_students") {
      const { data } = await svc
        .from("student_registry")
        .select("email, name")
        .limit(5000);
      return {
        recipients: (data || []).map((r) => ({
          email: r.email,
          name: r.name || "",
          source: "student_registry" as const,
        })),
        error: null,
      };
    }

    if (target === "all_members") {
      const { data } = await svc
        .from("profiles")
        .select("email, name")
        .in("role", ["member", "student", "admin"])
        .limit(5000);
      return {
        recipients: (data || []).map((r) => ({
          email: r.email,
          name: r.name || "",
          source: "member" as const,
        })),
        error: null,
      };
    }

    // target === "all": leads + profiles 통합, 중복 제거
    const [leadsResult, profilesResult] = await Promise.all([
      svc
        .from("leads")
        .select("email, name")
        .eq("email_opted_out", false)
        .limit(5000),
      svc
        .from("profiles")
        .select("email, name")
        .in("role", ["member", "student", "admin"])
        .limit(5000),
    ]);

    const recipientMap = new Map<string, Recipient>();

    // leads 먼저 추가
    for (const r of leadsResult.data || []) {
      recipientMap.set(r.email, {
        email: r.email,
        name: r.name || "",
        source: "lead",
      });
    }

    // profiles 덮어쓰기 (회원 정보가 더 정확)
    for (const r of profilesResult.data || []) {
      recipientMap.set(r.email, {
        email: r.email,
        name: r.name || "",
        source: "member",
      });
    }

    return {
      recipients: Array.from(recipientMap.values()),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "수신자 조회 중 오류가 발생했습니다.";
    return { recipients: [], error: message };
  }
}

export async function getRecipientStats(): Promise<{
  stats: RecipientStats | null;
  error: string | null;
}> {
  try {
    const svc = await requireAdmin();

    // 그룹별 count + 중복 제거 count를 위해 이메일 목록 조회
    const [leadsResult, studentsResult, membersResult] = await Promise.all([
      svc
        .from("leads")
        .select("email", { count: "exact" })
        .eq("email_opted_out", false)
        .limit(5000),
      svc
        .from("student_registry")
        .select("id", { count: "exact", head: true }),
      svc
        .from("profiles")
        .select("email", { count: "exact" })
        .in("role", ["member", "student", "admin"])
        .limit(5000),
    ]);

    const leadsEmails = (leadsResult.data || []).map((r) => r.email);
    const membersEmails = (membersResult.data || []).map((r) => r.email);

    // 중복 제거: Set으로 합치기
    const allEmails = new Set([...leadsEmails, ...membersEmails]);

    return {
      stats: {
        leads: leadsResult.count ?? leadsEmails.length,
        students: studentsResult.count || 0,
        members: membersResult.count ?? membersEmails.length,
        all_deduplicated: allEmails.size,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "수신자 통계 조회 중 오류가 발생했습니다.";
    return { stats: null, error: message };
  }
}
