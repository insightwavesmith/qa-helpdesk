"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "대시보드", href: "/protractor" },
  { label: "소재 분석", href: "/protractor/creatives" },
  { label: "경쟁사 분석", href: "/protractor/competitor" },
] as const;

export function ProtractorTabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 mb-6 border-b border-gray-200">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/protractor"
            ? pathname === "/protractor"
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-[#F75D5D] text-[#F75D5D]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
