"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const titleMap: Record<string, string> = {
  "/dashboard": "대시보드",
  "/questions": "Q&A",
  "/posts": "정보공유",
  "/notices": "공지사항",
  "/protractor": "총가치각도기",
  "/settings": "설정",
  "/admin/members": "회원 관리",
  "/admin/answers": "답변 검토",
  "/admin/stats": "통계",
  "/admin/protractor": "총가치각도기 관리",
  "/admin/accounts": "광고계정 관리",
  "/admin/email": "이메일 발송",
};

const dateFilterPaths = ["/dashboard", "/protractor", "/admin/protractor"];

function getTitle(pathname: string): string {
  if (titleMap[pathname]) return titleMap[pathname];
  for (const [path, title] of Object.entries(titleMap)) {
    if (pathname.startsWith(path + "/")) return title;
  }
  return "대시보드";
}

function shouldShowDateFilter(pathname: string): boolean {
  return dateFilterPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function getDateRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  start.setDate(end.getDate() - days + 1);
  return { start, end };
}

interface DashboardHeaderProps {
  userName?: string;
}

export function DashboardHeader({ userName = "사용자" }: DashboardHeaderProps) {
  const pathname = usePathname();
  const initials = userName.slice(0, 2).toUpperCase();
  const title = getTitle(pathname);
  const showDateFilter = shouldShowDateFilter(pathname);
  const [period, setPeriod] = useState("30d");

  const dateLabel = useMemo(() => {
    const { start, end } = getDateRange(period);
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, [period]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-card-foreground">{title}</h1>
        {showDateFilter && (
          <div className="hidden items-center gap-2 md:flex">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {dateLabel}
              </span>
            </div>
            <Select value={period} onValueChange={setPeriod}>
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
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="relative inline-flex items-center justify-center rounded-md h-9 w-9 text-muted-foreground hover:text-card-foreground hover:bg-accent transition-colors"
          aria-label="알림"
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
