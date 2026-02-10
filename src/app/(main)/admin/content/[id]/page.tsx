"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getContentById } from "@/actions/contents";
import type { Content } from "@/types/content";

const PostEditPanel = dynamic(
  () => import("@/components/content/post-edit-panel"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        에디터 로딩 중...
      </div>
    ),
  }
);

const DetailSidebar = dynamic(
  () => import("@/components/content/detail-sidebar"),
  { ssr: false }
);

const NewsletterEditPanel = dynamic(
  () => import("@/components/content/newsletter-edit-panel"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        뉴스레터 에디터 로딩 중...
      </div>
    ),
  }
);

const ContentSettingsPanel = dynamic(
  () => import("@/components/content/content-settings-panel"),
  { ssr: false }
);

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "초안", className: "bg-gray-100 text-gray-700 border-gray-200" },
  review: { label: "검수대기", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  ready: { label: "발행가능", className: "bg-green-50 text-green-700 border-green-200" },
  published: { label: "게시완료", className: "bg-blue-50 text-blue-700 border-blue-200" },
  archived: { label: "보관", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export default function ContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.id as string;

  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("post");

  const loadContent = useCallback(async () => {
    try {
      const { data, error } = await getContentById(contentId);
      if (error || !data) {
        router.push("/admin/content");
        return;
      }
      setContent(data as Content);
    } catch {
      router.push("/admin/content");
    }
  }, [contentId, router]);

  useEffect(() => {
    setLoading(true);
    loadContent().finally(() => setLoading(false));
  }, [loadContent]);

  const refreshContent = useCallback(() => {
    loadContent();
  }, [loadContent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  if (!content) return null;

  const statusInfo = STATUS_BADGE[content.status] ?? {
    label: content.status,
    className: "",
  };

  return (
    <div className="space-y-6">
      {/* BackLink */}
      <Link
        href="/admin/content"
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        콘텐츠 목록
      </Link>

      {/* ContentHeader */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{content.title}</h1>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`text-[11px] ${statusInfo.className}`}
            >
              {statusInfo.label}
            </Badge>
            <span className="text-[13px] text-gray-500">
              {new Date(content.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            {content.email_sent_at && (
              <Badge
                variant="outline"
                className="text-[11px] bg-purple-50 text-purple-700 border-purple-200"
              >
                뉴스레터 발송완료
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* DetailTabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="post">정보공유</TabsTrigger>
          <TabsTrigger value="newsletter">뉴스레터</TabsTrigger>
          <TabsTrigger value="settings">설정</TabsTrigger>
        </TabsList>

        {/* 정보공유 탭 */}
        <TabsContent value="post" className="mt-4">
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <PostEditPanel
                contentId={content.id}
                initialBodyMd={content.body_md}
                onSaved={refreshContent}
              />
            </div>
            <DetailSidebar
              content={content}
              onTabChange={setActiveTab}
              onContentUpdate={refreshContent}
            />
          </div>
        </TabsContent>

        {/* 뉴스레터 탭 */}
        <TabsContent value="newsletter" className="mt-4">
          <NewsletterEditPanel
            content={content}
            onContentUpdate={refreshContent}
          />
        </TabsContent>

        {/* 설정 탭 */}
        <TabsContent value="settings" className="mt-4">
          <ContentSettingsPanel
            content={content}
            onContentUpdate={refreshContent}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
