"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircleQuestion,
  FileText,
  Megaphone,
  Settings,
  Users,
  CheckCircle,
  BarChart3,
  LogOut,
  User,
  ChevronsUpDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNavItems: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "Q&A", href: "/questions", icon: MessageCircleQuestion },
  { label: "정보 공유", href: "/posts", icon: FileText },
  { label: "공지사항", href: "/notices", icon: Megaphone },
  { label: "설정", href: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "회원 관리", href: "/admin/members", icon: Users },
  { label: "답변 검토", href: "/admin/answers", icon: CheckCircle },
  { label: "통계", href: "/admin/stats", icon: BarChart3 },
];

interface AppSidebarProps {
  userRole?: string;
  userName?: string;
  userEmail?: string;
  pendingAnswersCount?: number;
}

export default function AppSidebar({
  userRole = "approved",
  userName = "사용자",
  userEmail = "",
  pendingAnswersCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = userName.charAt(0);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const renderNavItem = (item: NavItem) => {
    const isActive =
      pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    const showBadge =
      item.href === "/admin/answers" && pendingAnswersCount > 0;

    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          tooltip={item.label}
          isActive={isActive}
        >
          <Link href={item.href}>
            <Icon className="h-[18px] w-[18px] opacity-60 shrink-0" />
            <span className="text-[14px]">{item.label}</span>
            {showBadge && (
              <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground leading-none">
                {pendingAnswersCount}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      {/* Workspace header - Notion style */}
      <SidebarHeader className="px-3 pt-3 pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="flex size-[22px] items-center justify-center rounded-[4px] bg-foreground/10 text-[13px] font-semibold text-foreground/70">
                  사
                </div>
                <span className="text-[14px] font-medium text-foreground truncate">
                  사관학교 헬프데스크
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden px-1">
        {/* Main Navigation */}
        <SidebarGroup className="py-1">
          <SidebarMenu className="gap-0.5">
            {mainNavItems.map(renderNavItem)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Admin Navigation */}
        {userRole === "admin" && (
          <>
            <SidebarSeparator className="mx-3 opacity-50" />
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[11px] font-medium text-muted-foreground tracking-wide mb-0.5">
                관리
              </SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {adminNavItems.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* User footer - Notion style */}
      <SidebarFooter className="px-2 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="h-[22px] w-[22px] rounded-[4px]">
                    <AvatarFallback className="rounded-[4px] text-[11px] font-medium bg-foreground/10 text-foreground/70">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="text-[13px] font-normal text-sidebar-foreground truncate">{userName}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-3.5 opacity-40" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-52 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                <div className="flex items-center gap-2.5 px-2 py-2 text-left">
                  <Avatar className="h-7 w-7 rounded-[4px]">
                    <AvatarFallback className="rounded-[4px] text-[11px] font-medium bg-foreground/10 text-foreground/70">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid text-left leading-tight">
                    <span className="text-[13px] font-medium">{userName}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {userEmail}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push("/settings")}
                  className="text-[13px] rounded-[4px]"
                >
                  <User className="mr-2 h-4 w-4 opacity-60" />
                  프로필 설정
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-[13px] rounded-[4px]"
                >
                  <LogOut className="mr-2 h-4 w-4 opacity-60" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
