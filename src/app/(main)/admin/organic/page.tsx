"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrganicDashboard from "@/components/organic/organic-dashboard";
import OrganicPostsTab from "@/components/organic/organic-posts-tab";
import OrganicKeywordsTab from "@/components/organic/organic-keywords-tab";

export default function AdminOrganicPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "dashboard";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">오가닉 채널</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          네이버 블로그 · 카페 발행 관리
        </p>
      </div>

      {/* 탭 */}
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="dashboard">대시보드</TabsTrigger>
          <TabsTrigger value="posts">발행 관리</TabsTrigger>
          <TabsTrigger value="keywords">키워드</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4" forceMount={currentTab === "dashboard" ? true : undefined}>
          {currentTab === "dashboard" && <OrganicDashboard />}
        </TabsContent>

        <TabsContent value="posts" className="mt-4" forceMount={currentTab === "posts" ? true : undefined}>
          {currentTab === "posts" && <OrganicPostsTab />}
        </TabsContent>

        <TabsContent value="keywords" className="mt-4" forceMount={currentTab === "keywords" ? true : undefined}>
          {currentTab === "keywords" && <OrganicKeywordsTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
