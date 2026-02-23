import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// 관리자 레이아웃: admin 역할만 접근 가능
// 사이드바/헤더는 (main) 레이아웃에서 제공하므로 여기선 권한 체크만
export default async function AdminLayout({
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
  const { data: profile } = (await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: { role: string } | null };

  if (profile?.role !== "admin" && profile?.role !== "assistant") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
