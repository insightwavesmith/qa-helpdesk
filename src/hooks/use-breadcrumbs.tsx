"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

type BreadcrumbItem = {
  title: string;
  link: string;
};

// Korean label mapping for routes
const routeLabels: Record<string, string> = {
  dashboard: "대시보드",
  questions: "Q&A",
  new: "새 질문",
  posts: "정보 공유",
  notices: "공지사항",
  settings: "설정",
  admin: "관리자",
  members: "회원 관리",
  answers: "답변 검토",
  stats: "통계",
};

// Custom route mappings for known paths
const routeMapping: Record<string, BreadcrumbItem[]> = {
  "/dashboard": [{ title: "대시보드", link: "/dashboard" }],
  "/questions": [
    { title: "대시보드", link: "/dashboard" },
    { title: "Q&A", link: "/questions" },
  ],
  "/questions/new": [
    { title: "대시보드", link: "/dashboard" },
    { title: "Q&A", link: "/questions" },
    { title: "새 질문", link: "/questions/new" },
  ],
  "/posts": [
    { title: "대시보드", link: "/dashboard" },
    { title: "정보 공유", link: "/posts" },
  ],
  "/posts/new": [
    { title: "대시보드", link: "/dashboard" },
    { title: "정보 공유", link: "/posts" },
    { title: "새 글 작성", link: "/posts/new" },
  ],
  "/notices": [
    { title: "대시보드", link: "/dashboard" },
    { title: "공지사항", link: "/notices" },
  ],
  "/settings": [
    { title: "대시보드", link: "/dashboard" },
    { title: "설정", link: "/settings" },
  ],
  "/admin/members": [
    { title: "대시보드", link: "/dashboard" },
    { title: "관리자", link: "/admin/members" },
    { title: "회원 관리", link: "/admin/members" },
  ],
  "/admin/answers": [
    { title: "대시보드", link: "/dashboard" },
    { title: "관리자", link: "/admin/members" },
    { title: "답변 검토", link: "/admin/answers" },
  ],
  "/admin/stats": [
    { title: "대시보드", link: "/dashboard" },
    { title: "관리자", link: "/admin/members" },
    { title: "통계", link: "/admin/stats" },
  ],
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    // Check exact match first
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // Generate breadcrumbs from path segments
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join("/")}`;
      const label =
        routeLabels[segment] ||
        segment.charAt(0).toUpperCase() + segment.slice(1);
      return {
        title: label,
        link: path,
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
