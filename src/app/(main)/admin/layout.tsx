import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";

// 관리자 레이아웃: admin 역할만 접근 가능
// 사이드바/헤더는 (main) 레이아웃에서 제공하므로 여기선 권한 체크만
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const svc = createServiceClient();
  const { data: profile } = (await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single()) as { data: { role: string } | null };

  if (profile?.role !== "admin" && profile?.role !== "assistant") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
