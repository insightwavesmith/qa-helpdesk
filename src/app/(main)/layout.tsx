import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/Header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StudentLayoutClient } from "@/components/layout/student-layout-client";
import { getPendingAnswersCount } from "@/actions/answers";

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

  // 프로필 조회 (service role로 RLS 우회)
  const serviceClient = createServiceClient();
  const { data: profile } = (await serviceClient
    .from("profiles")
    .select("name, role, email")
    .eq("id", user.id)
    .single()) as {
    data: { name: string; role: string; email: string } | null;
  };

  // 승인 대기 중인 사용자는 pending 페이지로
  if (profile?.role === "pending" || profile?.role === "rejected") {
    redirect("/pending");
  }

  const isAdmin = profile?.role === "admin";

  // Admin: existing sidebar layout
  if (isAdmin) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
    const pendingAnswersCount = await getPendingAnswersCount();

    return (
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          userRole={profile?.role}
          userName={profile?.name || "사용자"}
          userEmail={profile?.email || user.email || ""}
          pendingAnswersCount={pendingAnswersCount}
        />
        <SidebarInset>
          <Header
            userName={profile?.name || "사용자"}
            userRole={profile?.role}
          />
          <ScrollArea className="h-[calc(100dvh-4rem)]">
            <main className="flex-1 p-4 md:px-6 md:py-6">{children}</main>
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Student: Substack-style layout
  return (
    <StudentLayoutClient
      userName={profile?.name || "사용자"}
      userEmail={profile?.email || user.email || ""}
    >
      {children}
    </StudentLayoutClient>
  );
}
