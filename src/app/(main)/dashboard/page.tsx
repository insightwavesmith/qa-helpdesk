import { createClient, createServiceClient } from "@/lib/supabase/server";
import { StudentHome } from "./student-home";
import { AdminDashboard } from "./admin-dashboard";
import { MemberDashboard } from "./member-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const svc = createServiceClient();
  const { data: profile } = (await svc
    .from("profiles")
    .select("role, name")
    .eq("id", user!.id)
    .single()) as { data: { role: string; name: string } | null };

  const role = profile?.role;

  if (role === "admin") {
    return <AdminDashboard />;
  }

  if (role === "member") {
    return <MemberDashboard />;
  }

  // student, alumni
  return <StudentHome userName={profile?.name || "사용자"} />;
}
