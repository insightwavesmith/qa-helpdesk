"use server";

import { requireAdmin } from "@/lib/auth-utils";

export type RecipientTarget =
  | "all"
  | "all_leads"
  | "all_students"
  | "all_members"
  | "custom";

export interface Recipient {
  email: string;
  name: string;
  source: "lead" | "member" | "profiles";
}

export interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  all_deduplicated: number;
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
        .from("profiles")
        .select("email, name")
        .eq("role", "student")
        .not("email", "is", null)
        .neq("email", "")
        .limit(5000);
      return {
        recipients: (data || []).map((r) => ({
          email: r.email,
          name: r.name || "",
          source: "profiles" as const,
        })),
        error: null,
      };
    }

    if (target === "all_members") {
      const { data } = await svc
        .from("profiles")
        .select("email, name")
        .eq("role", "member")
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

    if (target === "all") {
      const [leadsRes, studentsRes, membersRes] = await Promise.all([
        svc.from("leads").select("email, name").eq("email_opted_out", false).limit(5000),
        svc.from("profiles").select("email, name").eq("role", "student").not("email", "is", null).neq("email", "").limit(5000),
        svc.from("profiles").select("email, name").eq("role", "member").limit(5000),
      ]);
      const uniqueMap = new Map<string, Recipient>();
      for (const r of (leadsRes.data || [])) {
        if (!uniqueMap.has(r.email)) uniqueMap.set(r.email, { email: r.email, name: r.name || "", source: "lead" });
      }
      for (const r of (studentsRes.data || [])) {
        if (!uniqueMap.has(r.email)) uniqueMap.set(r.email, { email: r.email, name: r.name || "", source: "profiles" });
      }
      for (const r of (membersRes.data || [])) {
        if (!uniqueMap.has(r.email)) uniqueMap.set(r.email, { email: r.email, name: r.name || "", source: "member" });
      }
      return { recipients: Array.from(uniqueMap.values()), error: null };
    }

    return { recipients: [], error: "알 수 없는 수신 대상입니다." };
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

    // 그룹별 이메일 목록 조회
    const [leadsResult, studentsResult, membersResult] = await Promise.all([
      svc
        .from("leads")
        .select("email")
        .eq("email_opted_out", false)
        .limit(5000),
      svc
        .from("profiles")
        .select("email")
        .eq("role", "student")
        .not("email", "is", null)
        .neq("email", "")
        .limit(5000),
      svc
        .from("profiles")
        .select("email")
        .eq("role", "member")
        .limit(5000),
    ]);

    const leadsEmails = (leadsResult.data || []).map((r) => r.email);
    const studentsEmails = (studentsResult.data || []).map((r) => r.email);
    const membersEmails = (membersResult.data || []).map((r) => r.email);

    // 전체 중복 제거
    const allEmails = new Set([...leadsEmails, ...studentsEmails, ...membersEmails]);

    return {
      stats: {
        leads: leadsEmails.length,
        students: studentsEmails.length,
        members: membersEmails.length,
        all_deduplicated: allEmails.size,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "수신자 통계 조회 중 오류가 발생했습니다.";
    return { stats: null, error: message };
  }
}
