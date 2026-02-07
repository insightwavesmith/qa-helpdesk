import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { StudentHeader } from "@/components/layout/student-header";
import { getPendingAnswersCount } from "@/actions/answers";
import { DashboardSidebar } from "@/components/dashboard/Sidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

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
    redirect("/login");
  }

  // 프로필 캐싱: 쿠키 기반 5분 TTL
  const cookieStore = await cookies();
  const cachedProfileCookie = cookieStore.get("cached_profile");
  let profile: { name: string; role: string; email: string } | null = null;

  if (cachedProfileCookie) {
    try {
      const cached = JSON.parse(cachedProfileCookie.value);
      if (cached.ts && Date.now() - cached.ts <= 300_000) {
        profile = { name: cached.name, role: cached.role, email: cached.email };
      }
    } catch {
      // 파싱 실패 시 DB에서 다시 조회
    }
  }

  if (!profile) {
    const serviceClient = createServiceClient();
    const { data: freshProfile } = (await serviceClient
      .from("profiles")
      .select("name, role, email")
      .eq("id", user.id)
      .single()) as {
      data: { name: string; role: string; email: string } | null;
    };
    profile = freshProfile;

    if (profile) {
      cookieStore.set("cached_profile", JSON.stringify({
        name: profile.name,
        role: profile.role,
        email: profile.email,
        ts: Date.now(),
      }), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300,
      });
    }
  }

  // lead는 아직 승인되지 않은 상태 → 대기 페이지로
  if (profile?.role === "lead") {
    redirect("/pending");
  }

  const isAdmin = profile?.role === "admin";

  // 학생용: 상단 헤더만 (목업 스타일)
  if (!isAdmin) {
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

  // 관리자용: v0 스타일 대시보드 사이드바 레이아웃
  const pendingAnswersCount = await getPendingAnswersCount();

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar
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
