import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { UserRole } from "@/types";
import { ProtractorTabNav } from "./protractor-tab-nav";

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
  const user = await getCurrentUser();

  if (!user) {
    return <>{children}</>;
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  if (BLOCKED_ROLES.includes(profile.role)) {
    redirect(profile.role === "member" ? "/dashboard" : "/pending");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ProtractorTabNav />
      {children}
    </div>
  );
}
