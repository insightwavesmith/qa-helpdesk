"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { ThemeModeToggle } from "./theme-toggle";

interface HeaderProps {
  userName?: string;
  userRole?: string;
}

export function Header({ userName: _userName, userRole: _userRole }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2 px-4">
        <Button variant="ghost" size="icon" className="relative size-8">
          <Bell className="h-4 w-4" />
          <span className="sr-only">알림</span>
        </Button>
        <ThemeModeToggle />
      </div>
    </header>
  );
}
