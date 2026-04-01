"use server";

import { createServiceClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

export interface QaReport {
  id: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  title: string;
  description: string;
  severity: string;
  raw_message: string;
  image_urls: string[];
  status: string;
  page_url: string | null;
  ai_raw_response: Record<string, unknown> | null;
}

/** QA 리포트 생성 */
export async function createQaReport(data: {
  rawMessage: string;
  title: string;
  description: string;
  severity: string;
  imageUrls: string[];
  pageUrl?: string;
  aiRawResponse?: Record<string, unknown>;
}): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();

  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();

  // 관리자 역할 확인
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    return { error: "관리자만 QA 리포트를 생성할 수 있습니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: report, error } = await (svc as any)
    .from("qa_reports")
    .insert({
      author_id: toProfileId(user.uid),
      title: data.title,
      description: data.description,
      severity: data.severity,
      raw_message: data.rawMessage,
      image_urls: data.imageUrls,
      page_url: data.pageUrl || null,
      ai_raw_response: data.aiRawResponse || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("QA 리포트 생성 실패:", error);
    return { error: "저장에 실패했습니다. 다시 시도해주세요." };
  }

  return { id: report.id };
}

/** QA 리포트 목록 조회 (최신순) */
export async function getQaReports(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<QaReport[]> {
  const user = await getCurrentUser();

  if (!user) return [];

  const svc = createServiceClient();

  // 관리자 역할 확인
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("qa_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options?.limit || 20) - 1
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("QA 리포트 조회 실패:", error);
    return [];
  }

  return (data || []) as QaReport[];
}

/** QA 리포트 상태 변경 */
export async function updateQaReportStatus(
  reportId: string,
  status: "open" | "in_progress" | "resolved" | "closed"
): Promise<{ success: boolean } | { error: string }> {
  const user = await getCurrentUser();

  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();

  // 관리자 역할 확인
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    return { error: "관리자만 상태를 변경할 수 있습니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any)
    .from("qa_reports")
    .update({ status })
    .eq("id", reportId);

  if (error) {
    console.error("QA 리포트 상태 변경 실패:", error);
    return { error: "상태 변경에 실패했습니다." };
  }

  return { success: true };
}
