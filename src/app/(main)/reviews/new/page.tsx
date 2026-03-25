import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { NewReviewForm } from "./new-review-form";

export default async function NewReviewPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, cohort")
    .eq("id", user.uid)
    .single();

  if (profile?.role !== "student") {
    redirect("/reviews");
  }

  // C2: profiles.cohort → 드롭다운 기본값 자동 세팅
  const userCohort = profile?.cohort ?? null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <NewReviewForm defaultCohort={userCohort} />
    </div>
  );
}
