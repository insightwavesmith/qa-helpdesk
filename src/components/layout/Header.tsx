"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { ThemeModeToggle } from "./theme-toggle";

interface HeaderProps {
  userName?: string;
  userRole?: string;
}

export function Header({ userName: _userName, userRole: _userRole }: HeaderProps) {
  return (
    <header className="flex h-[45px] shrink-0 items-center justify-between gap-2 transition-[width,height] duration-150 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-[40px]">
      <div className="flex items-center gap-1.5 px-3">
        <SidebarTrigger className="-ml-1 size-6 text-muted-foreground hover:text-foreground" />
        <span className="text-border mx-1 text-[18px] font-[200]">/</span>
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-1 px-3">
        <ThemeModeToggle />
      </div>
    </header>
  );
}
