import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { StudentHeader } from "@/components/layout/student-header";
import { getPendingAnswersCount } from "@/actions/answers";
import { DashboardSidebar } from "@/components/dashboard/Sidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MobileSidebar } from "@/components/dashboard/MobileSidebar";
import { Button } from "@/components/ui/button";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/posts" className="font-bold text-lg text-gray-900" style={{ wordSpacing: "-3px" }}>자사몰사관학교</Link>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">로그인</Link>
              </Button>
              <Button asChild size="sm" className="bg-[#F75D5D] hover:bg-[#E54949]">
                <Link href="/signup">회원가입</Link>
              </Button>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  const serviceClient = createServiceClient();
  const { data: profile } = (await serviceClient
    .from("profiles")
    .select("name, role, email")
    .eq("id", user.id)
    .single()) as {
    data: { name: string; role: string; email: string } | null;
  };

  const role = profile?.role;
  const usesSidebarLayout =
    role === "admin" || role === "lead" || role === "member";

  // 학생용: 상단 헤더만 (목업 스타일)
  if (!usesSidebarLayout) {
    return (
      <div className="min-h-screen bg-background">
        <StudentHeader
          userName={profile?.name || "사용자"}
          userEmail={profile?.email || user.email || ""}
          userRole={profile?.role}
        />
        <main>
          {children}
        </main>
      </div>
    );
  }

  // admin/lead/member: 사이드바 레이아웃
  const pendingAnswersCount =
    role === "admin" ? await getPendingAnswersCount() : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">
        <DashboardSidebar
          userRole={profile?.role}
          userName={profile?.name || "사용자"}
          userEmail={profile?.email || user.email || ""}
          pendingAnswersCount={pendingAnswersCount}
        />
      </div>
      <MobileSidebar
        userRole={profile?.role}
        userName={profile?.name || "사용자"}
        userEmail={profile?.email || user.email || ""}
        pendingAnswersCount={pendingAnswersCount}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader userName={profile?.name || "사용자"} />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <div className="mx-auto max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
