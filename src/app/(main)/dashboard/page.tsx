import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StudentHome } from "./student-home";
import { AdminDashboard } from "./admin-dashboard";
import { MemberDashboard } from "./member-dashboard";

export default async function DashboardPage() {
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
    .select("role, name")
    .eq("id", user.id)
    .single()) as { data: { role: string; name: string } | null };

  const role = profile?.role;

  if (role === "admin") {
    return <AdminDashboard />;
  }

  if (role === "lead" || role === "member") {
    return <MemberDashboard />;
  }

  if (role === "pending") {
    redirect("/pending");
  }

  if (role === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-[#111827] mb-2">
            가입이 거절되었습니다
          </h1>
          <p className="text-[#6B7280] mb-4">관리자에게 문의해주세요.</p>
          <a
            href="/login"
            className="text-[#F75D5D] hover:underline font-medium"
          >
            로그인 페이지로
          </a>
        </div>
      </div>
    );
  }

  // student, member
  return <StudentHome userName={profile?.name || "사용자"} />;
}
