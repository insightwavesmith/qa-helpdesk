"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { DashboardSidebar } from "./Sidebar";

interface MobileSidebarProps {
  userRole?: string;
  userName?: string;
  userEmail?: string;
  pendingAnswersCount?: number;
}

export function MobileSidebar({
  userRole,
  userName,
  userEmail,
  pendingAnswersCount,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-2 border-b bg-white px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-md h-8 w-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium">자사몰사관학교</span>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 w-[240px] bg-white">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 inline-flex items-center justify-center rounded-md h-8 w-8 text-gray-500 hover:text-gray-900 transition-colors"
              aria-label="메뉴 닫기"
            >
              <X className="h-5 w-5" />
            </button>
            <DashboardSidebar
              userRole={userRole}
              userName={userName}
              userEmail={userEmail}
              pendingAnswersCount={pendingAnswersCount}
            />
          </div>
        </div>
      )}
    </>
  );
}
