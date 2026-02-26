"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircleQuestion,
  Share2,
  Megaphone,
  Gauge,
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle,
  Crosshair,
  Monitor,
  FileText,
  Brain,
  LogOut,
  Lock,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNavItems: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "Q&A", href: "/questions", icon: MessageCircleQuestion },
  { label: "정보공유", href: "/posts", icon: Share2 },
  { label: "공지사항", href: "/notices", icon: Megaphone },
  { label: "총가치각도기", href: "/protractor", icon: Gauge },
  { label: "설정", href: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "회원 관리", href: "/admin/members", icon: Users },
  { label: "수강생 성과", href: "/admin/performance", icon: TrendingUp },
  { label: "답변 검토", href: "/admin/answers", icon: CheckCircle },
  { label: "콘텐츠 관리", href: "/admin/content", icon: FileText },
  { label: "지식 베이스", href: "/admin/knowledge", icon: Brain },
  { label: "총가치각도기 관리", href: "/admin/protractor", icon: Crosshair },
  { label: "광고계정 관리", href: "/admin/accounts", icon: Monitor },
  { label: "초대코드", href: "/admin/invites", icon: Ticket },
];

interface SidebarProps {
  userRole?: string;
  userName?: string;
  userEmail?: string;
  pendingAnswersCount?: number;
}

export function DashboardSidebar({
  userRole = "member",
  userName = "사용자",
  pendingAnswersCount = 0,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const initials = userName.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    const supabase = createClient();
    try { await supabase.auth.signOut(); } finally {
      document.cookie = "x-user-role=; path=/; max-age=0";
      document.cookie = "x-onboarding-status=; path=/; max-age=0";
    }
    router.push("/login");
    router.refresh();
  };

  const renderNavItem = (item: NavItem) => {
    // lead/member에게 Q&A 메뉴 숨김
    if (
      item.href === "/questions" &&
      (userRole === "lead" || userRole === "member")
    ) {
      return null;
    }

    const isActive =
      pathname === item.href || pathname.startsWith(item.href + "/");
    const isLocked =
      item.href === "/protractor" &&
      (userRole === "member" || userRole === "lead");
    const Icon = isLocked ? Lock : item.icon;
    const showBadge =
      item.href === "/admin/answers" && pendingAnswersCount > 0;

    if (isLocked) {
      return (
        <span
          key={item.href}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 pointer-events-none"
        >
          <Icon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && (
          <>
            <span>{item.label}</span>
            {showBadge && (
              <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground leading-none">
                {pendingAnswersCount}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">BS</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-accent-foreground">
              자사몰사관학교
            </span>
            <span className="text-[10px] text-sidebar-foreground">
              Ad Analytics
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        role="navigation"
        aria-label="Main navigation"
      >
        {mainNavItems.map(renderNavItem)}

        {(userRole === "admin" || userRole === "assistant") && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground tracking-wide">
                관리
              </p>
            )}
            {adminNavItems.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* User / Bottom */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </div>
            <span className="text-sm text-sidebar-accent-foreground truncate">
              {userName}
            </span>
            <button
              onClick={handleLogout}
              className="ml-auto text-sidebar-foreground hover:text-destructive transition-colors"
              aria-label="로그아웃"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center rounded-lg py-2 text-sidebar-foreground hover:text-destructive transition-colors"
            aria-label="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
