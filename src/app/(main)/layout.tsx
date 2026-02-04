import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/Header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const serviceClient = createServiceClient();
  const { data: profile } = (await serviceClient
    .from("profiles")
    .select("name, role, email")
    .eq("id", user.id)
    .single()) as {
    data: { name: string; role: string; email: string } | null;
  };

  if (profile?.role === "pending" || profile?.role === "rejected") {
    redirect("/pending");
  }

  const isAdmin = profile?.role === "admin";
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const pendingAnswersCount = isAdmin ? await getPendingAnswersCount() : 0;

  // 모든 유저가 동일한 사이드바 레이아웃 사용 (노션 스타일)
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
        <ScrollArea className="h-[calc(100dvh-45px)]">
          <main className="mx-auto w-full max-w-[900px] px-8 py-4 md:px-16 md:py-6">
            {children}
          </main>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
