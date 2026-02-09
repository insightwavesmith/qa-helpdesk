import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

/**
 * 접근 제어:
 * - lead → /pending 리다이렉트
 * - member → /dashboard 리다이렉트 (수강생 전용)
 * - 그 외 role → 통과 (page.tsx에서 실제/샘플 분기)
 */
const BLOCKED_ROLES: UserRole[] = ["lead"];

export default async function ProtractorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  if (BLOCKED_ROLES.includes(profile.role)) {
    redirect(profile.role === "member" ? "/dashboard" : "/pending");
  }

  return <>{children}</>;
}
