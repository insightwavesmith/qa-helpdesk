import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NewReviewForm } from "./new-review-form";

export default async function NewReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, cohort")
    .eq("id", user.id)
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
