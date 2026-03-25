"use server";

import { requireAdmin } from "@/lib/auth-utils";
import type { NewsletterSegment } from "@/types/distribution";

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
        recipients: (data || []).map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
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
        recipients: (data || []).map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
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
        recipients: (data || []).map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const leadsEmails = (leadsResult.data || []).map((r: any) => r.email); // eslint-disable-line @typescript-eslint/no-explicit-any
    const studentsEmails = (studentsResult.data || []).map((r: any) => r.email); // eslint-disable-line @typescript-eslint/no-explicit-any
    const membersEmails = (membersResult.data || []).map((r: any) => r.email); // eslint-disable-line @typescript-eslint/no-explicit-any

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

// ----------------------------------------------------------------
// 세그먼트 관련 함수 (Phase 2 오가닉 배포 — 뉴스레터 수신자 세분화)
// ----------------------------------------------------------------

/**
 * 뉴스레터 세그먼트 목록 조회
 */
export async function getNewsletterSegments(): Promise<{
  data: NewsletterSegment[];
  error: string | null;
}> {
  try {
    const svc = await requireAdmin();
    const { data, error } = await svc
      .from("newsletter_segments")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return { data: [], error: (error as { message?: string }).message || "세그먼트 조회 실패" };
    }

    return { data: (data as NewsletterSegment[]) || [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "세그먼트 목록 조회 중 오류가 발생했습니다.";
    return { data: [], error: message };
  }
}

/**
 * 세그먼트 수신자 계산 (filter_rules 기반)
 * filter_rules 예시: { sources: ["leads","profiles"], profileRoles: ["student"], excludeOptedOut: true }
 */
export async function calculateSegmentMembers(segmentId: string): Promise<{
  members: Array<{ email: string; name: string; source: string }>;
  count: number;
  error: string | null;
}> {
  try {
    const svc = await requireAdmin();

    // 세그먼트 filter_rules 로드
    const { data: segment, error: segErr } = await svc
      .from("newsletter_segments")
      .select("id, filter_rules")
      .eq("id", segmentId)
      .single();

    if (segErr || !segment) {
      return { members: [], count: 0, error: "세그먼트를 찾을 수 없습니다." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules = (segment as any).filter_rules as Record<string, unknown>;
    const sources = (rules.sources as string[]) || ["leads", "profiles"];
    const profileRoles = (rules.profileRoles as string[]) || [];
    const excludeOptedOut = rules.excludeOptedOut !== false; // 기본값 true

    const uniqueMap = new Map<string, { email: string; name: string; source: string }>();

    // leads 소스 처리
    if (sources.includes("leads")) {
      let query = svc.from("leads").select("email, name").limit(5000);
      if (excludeOptedOut) {
        query = query.eq("email_opted_out", false);
      }
      const { data: leadsData } = await query;
      for (const r of (leadsData || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = r as any;
        if (row.email && !uniqueMap.has(row.email)) {
          uniqueMap.set(row.email, { email: row.email, name: row.name || "", source: "lead" });
        }
      }
    }

    // profiles 소스 처리
    if (sources.includes("profiles")) {
      // profileRoles 필터 없으면 전체 profiles 조회
      const rolesToQuery = profileRoles.length > 0 ? profileRoles : ["student", "member", "alumni", "admin"];
      for (const role of rolesToQuery) {
        const { data: profileData } = await svc
          .from("profiles")
          .select("email, name")
          .eq("role", role)
          .not("email", "is", null)
          .neq("email", "")
          .limit(5000);
        for (const r of (profileData || [])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = r as any;
          if (row.email && !uniqueMap.has(row.email)) {
            uniqueMap.set(row.email, { email: row.email, name: row.name || "", source: "profiles" });
          }
        }
      }
    }

    const members = Array.from(uniqueMap.values());
    const count = members.length;

    // member_count 업데이트
    await svc
      .from("newsletter_segments")
      .update({ member_count: count, updated_at: new Date().toISOString() })
      .eq("id", segmentId);

    return { members, count, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "세그먼트 수신자 계산 중 오류가 발생했습니다.";
    return { members: [], count: 0, error: message };
  }
}

/**
 * 뉴스레터 세그먼트 생성
 */
export async function createNewsletterSegment(input: {
  name: string;
  description?: string;
  filterRules: Record<string, unknown>;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const svc = await requireAdmin();

    const { data, error } = await svc
      .from("newsletter_segments")
      .insert({
        name: input.name,
        description: input.description || null,
        filter_rules: input.filterRules,
        is_default: false,
        member_count: 0,
      })
      .select("id")
      .single();

    if (error) {
      return { id: null, error: (error as { message?: string }).message || "세그먼트 생성 실패" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { id: (data as any)?.id || null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "세그먼트 생성 중 오류가 발생했습니다.";
    return { id: null, error: message };
  }
}

/**
 * 세그먼트 대상 뉴스레터 발송
 * channel_distributions의 변환 본문을 세그먼트 수신자에게 발송 예약
 * dryRun=true이면 실제 INSERT 없이 수신자 수만 반환
 */
export async function sendNewsletterToSegment(input: {
  distributionId: string;
  segmentId: string;
  dryRun?: boolean;
}): Promise<{ recipientCount: number; emailLogId: string | null; error: string | null }> {
  try {
    const svc = await requireAdmin();

    // 1. channel_distributions에서 transformed_body, transformed_title 조회
    const { data: distribution, error: distErr } = await svc
      .from("channel_distributions")
      .select("id, transformed_title, transformed_body, status")
      .eq("id", input.distributionId)
      .single();

    if (distErr || !distribution) {
      return { recipientCount: 0, emailLogId: null, error: "배포 건을 찾을 수 없습니다." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dist = distribution as any;
    const subject: string = dist.transformed_title || "뉴스레터";
    const body: string = dist.transformed_body || "";

    // 2. 세그먼트 수신자 계산
    const { members, count, error: memberErr } = await calculateSegmentMembers(input.segmentId);
    if (memberErr) {
      return { recipientCount: 0, emailLogId: null, error: memberErr };
    }
    if (count === 0) {
      return { recipientCount: 0, emailLogId: null, error: "수신자가 없습니다." };
    }

    // 3. dryRun이면 count만 반환
    if (input.dryRun) {
      return { recipientCount: count, emailLogId: null, error: null };
    }

    // 4. email_logs INSERT (발송 이력 헤더)
    const { data: logData, error: logErr } = await svc
      .from("email_logs")
      .insert({
        subject,
        html_body: body,
        recipient_count: count,
        status: "pending",
        template: "newsletter",
      })
      .select("id")
      .single();

    if (logErr || !logData) {
      return { recipientCount: count, emailLogId: null, error: "발송 로그 생성 실패" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailLogId: string = (logData as any).id;

    // 5. email_sends 배치 INSERT (수신자별 발송 레코드)
    const BATCH_SIZE = 200;
    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const chunk = members.slice(i, i + BATCH_SIZE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloads: any[] = chunk.map((m) => ({
        recipient_email: m.email,
        recipient_type: m.source,
        subject,
        template: "newsletter",
        status: "pending",
      }));
      await svc.from("email_sends").insert(payloads);
    }

    // email_logs status를 queued로 업데이트
    await svc
      .from("email_logs")
      .update({ status: "queued" })
      .eq("id", emailLogId);

    return { recipientCount: count, emailLogId, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "뉴스레터 발송 중 오류가 발생했습니다.";
    return { recipientCount: 0, emailLogId: null, error: message };
  }
}
