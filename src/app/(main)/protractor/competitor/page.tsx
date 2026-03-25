import { getCurrentUser } from "@/lib/firebase/auth";
import { redirect } from "next/navigation";
import CompetitorDashboard from "./competitor-dashboard";

export default async function CompetitorPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <CompetitorDashboard />;
}
