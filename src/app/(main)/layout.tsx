import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/Header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

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

  // 프로필 조회
  const { data: profile } = (await supabase
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

  // Sidebar state from cookie
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        userRole={profile?.role}
        userName={profile?.name || "사용자"}
        userEmail={profile?.email || user.email || ""}
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
