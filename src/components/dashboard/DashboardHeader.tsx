"use client";

import { CalendarDays, Bell } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DashboardHeaderProps {
  userName?: string;
}

export function DashboardHeader({ userName = "사용자" }: DashboardHeaderProps) {
  const initials = userName.slice(0, 2).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-card-foreground">대시보드</h1>
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              2025.01.01 - 2025.01.31
            </span>
          </div>
          <Select defaultValue="30d">
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">최근 7일</SelectItem>
              <SelectItem value="30d">최근 30일</SelectItem>
              <SelectItem value="90d">최근 90일</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="relative inline-flex items-center justify-center rounded-md h-9 w-9 text-muted-foreground hover:text-card-foreground hover:bg-accent transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
        <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {initials}
        </div>
      </div>
    </header>
  );
}
