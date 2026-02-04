import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "./admin-dashboard";
import { StudentHome } from "./student-home";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single()) as { data: { role: string } | null };

  const isAdmin = profile?.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <StudentHome />;
}
