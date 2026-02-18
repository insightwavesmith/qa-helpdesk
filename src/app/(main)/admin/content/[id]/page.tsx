"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getContentById, generateEmailSummary } from "@/actions/contents";
import AiEditPanel from "@/components/content/ai-edit-panel";
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
  const [generatingNewsletter, setGeneratingNewsletter] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

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
    } finally {
      setLoading(false);
    }
  }, [contentId, router]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const refreshContent = useCallback(() => {
    loadContent();
  }, [loadContent]);

  const handleGenerateNewsletter = useCallback(async () => {
    if (!content) return;
    // 재생성 시 기존 디자인 초기화 확인
    if (content.email_summary) {
      if (!confirm("기존 뉴스레터 디자인이 초기화됩니다. 계속하시겠습니까?")) return;
    }
    setGeneratingNewsletter(true);
    try {
      const result = await generateEmailSummary(content.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      // 배너키 검증 경고 표시
      if ("warnings" in result && result.warnings) {
        const { missing, forbidden } = result.warnings;
        if (missing.length > 0) {
          toast.warning(`누락된 배너키: ${missing.join(", ")}`);
        }
        if (forbidden.length > 0) {
          toast.warning(`인식 불가 배너키: ${forbidden.join(", ")}`);
        }
      }
      toast.success("뉴스레터가 생성되었습니다.");
      await loadContent();
      setEditorKey(prev => prev + 1);
    } catch {
      toast.error("뉴스레터 생성에 실패했습니다.");
    } finally {
      setGeneratingNewsletter(false);
    }
  }, [content, loadContent]);

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
            <div className="flex-1 min-w-0 space-y-4">
              <AiEditPanel
                contentId={content.id}
                bodyMd={content.body_md}
                emailSummary={content.email_summary}
                onApplied={refreshContent}
              />
              <PostEditPanel
                contentId={content.id}
                initialBodyMd={content.body_md}
                status={content.status}
                onSaved={refreshContent}
                onStatusChange={refreshContent}
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {content.email_summary
                  ? "뉴스레터가 생성되어 있습니다. 아래에서 편집하거나 재생성할 수 있습니다."
                  : "본문을 기반으로 뉴스레터를 생성합니다."}
              </p>
              <Button
                onClick={handleGenerateNewsletter}
                disabled={generatingNewsletter}
                variant={content.email_summary ? "outline" : "default"}
                className={content.email_summary ? "" : "bg-[#F75D5D] hover:bg-[#E54949]"}
              >
                {generatingNewsletter ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {content.email_summary ? "뉴스레터 재생성" : "뉴스레터 생성"}
              </Button>
            </div>
            <AiEditPanel
              contentId={content.id}
              bodyMd={content.body_md}
              emailSummary={content.email_summary}
              onApplied={refreshContent}
              defaultTarget="email_summary"
            />
            <NewsletterEditPanel
              key={editorKey}
              content={content}
              onContentUpdate={refreshContent}
            />
          </div>
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
