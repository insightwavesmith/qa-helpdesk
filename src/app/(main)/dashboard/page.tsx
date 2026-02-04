import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AdminDashboard } from "./admin-dashboard";
import { StudentHome } from "./student-home";

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

  const isAdmin = profile?.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <StudentHome userName={profile?.name || "사용자"} />;
}
