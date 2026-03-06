import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CompetitorDashboard from "./competitor-dashboard";

export default async function CompetitorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <CompetitorDashboard />;
}
