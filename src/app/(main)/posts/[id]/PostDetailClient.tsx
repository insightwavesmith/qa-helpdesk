"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { PostHero } from "@/components/posts/post-hero";
import { PostToc } from "@/components/posts/post-toc";
import { PostBody } from "@/components/posts/post-body";
import { PostRelated } from "@/components/posts/post-related";
import { NewsletterCta } from "@/components/posts/newsletter-cta";
import { InlineEditor } from "@/components/post/InlineEditor";
import { PublishBar } from "@/components/post/PublishBar";
import { updatePostInline } from "@/actions/posts";

interface PostData {
  id: string;
  title: string;
  content: string;
  body_md?: string;
  category: string;
  thumbnail_url?: string | null;
  is_pinned: boolean;
  view_count: number;
  status?: string;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string | null } | null;
}

interface RelatedPost {
  id: string;
  title: string;
  content: string;
  body_md?: string;
  category: string;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string | null } | null;
}

const categoryConfig: Record<string, { label: string; bg: string; text: string }> = {
  education: { label: "교육", bg: "#FFF5F5", text: "#F75D5D" },
  notice: { label: "공지", bg: "#EFF6FF", text: "#3B82F6" },
  case_study: { label: "고객사례", bg: "#FFF7ED", text: "#F97316" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

interface PostDetailClientProps {
  post: PostData;
  relatedPosts: RelatedPost[];
  isAdmin: boolean;
}

export default function PostDetailClient({
  post,
  relatedPosts,
  isAdmin,
}: PostDetailClientProps) {
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.body_md || post.content);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-save debounce
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef({ title: post.title, content: post.body_md || post.content });

  // Enter edit mode via ?edit=true
  useEffect(() => {
    if (searchParams.get("edit") === "true" && isAdmin) {
      setIsEditing(true);
    }
  }, [searchParams, isAdmin]);

  // Auto-save when editing (5s debounce)
  const scheduleAutoSave = useCallback(
    (title: string, content: string) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(async () => {
        // Only auto-save if content actually changed
        if (
          title === lastSavedRef.current.title &&
          content === lastSavedRef.current.content
        ) {
          return;
        }
        setIsSaving(true);
        try {
          const { error } = await updatePostInline(post.id, {
            title,
            body_md: content,
          });
          if (error) {
            console.error("자동저장 실패:", error);
          } else {
            lastSavedRef.current = { title, content };
          }
        } finally {
          setIsSaving(false);
        }
      }, 5000);
    },
    [post.id]
  );

  function handleTitleChange(title: string) {
    setEditTitle(title);
    scheduleAutoSave(title, editContent);
  }

  function handleContentChange(html: string) {
    setEditContent(html);
    scheduleAutoSave(editTitle, html);
  }

  async function handleSaveDraft() {
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const { error } = await updatePostInline(post.id, {
      title: editTitle,
      body_md: editContent,
    });
    if (error) {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    } else {
      lastSavedRef.current = { title: editTitle, content: editContent };
      toast.success("저장되었습니다.");
    }
  }

  async function handlePublish() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const { error } = await updatePostInline(post.id, {
      title: editTitle,
      body_md: editContent,
      status: "published",
    });
    if (error) {
      toast.error("발행에 실패했습니다. 다시 시도해주세요.");
    } else {
      lastSavedRef.current = { title: editTitle, content: editContent };
      toast.success("발행되었습니다.");
      setIsEditing(false);
    }
  }

  function handleCancel() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setEditTitle(post.title);
    setEditContent(post.body_md || post.content);
    setIsEditing(false);
  }

  const catConfig = categoryConfig[post.category] || categoryConfig.education;

  // EDITING MODE
  if (isEditing) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PublishBar
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onCancel={handleCancel}
          isSaving={isSaving}
        />

        {/* Category badge */}
        <div>
          <span
            className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
            style={{ backgroundColor: catConfig.bg, color: catConfig.text }}
          >
            {catConfig.label}
          </span>
        </div>

        <InlineEditor
          title={editTitle}
          bodyMd={editContent}
          isEditing={true}
          onTitleChange={handleTitleChange}
          onContentChange={handleContentChange}
        />
      </div>
    );
  }

  // READ MODE
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Category badge + Edit button */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded"
          style={{ backgroundColor: catConfig.bg, color: catConfig.text }}
        >
          {catConfig.label}
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-[#F75D5D] transition-colors"
          >
            <Pencil className="size-4" />
            수정
          </button>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-[32px] font-bold text-[#1a1a2e] leading-tight">
        {post.title}
      </h1>

      {/* Meta */}
      <div className="flex items-center gap-2 text-sm text-[#999999]">
        <span>{formatDate(post.created_at)}</span>
        <span>&middot;</span>
        <span>{catConfig.label}</span>
      </div>

      {/* Hero Banner */}
      <PostHero title={post.title} category={post.category} thumbnailUrl={post.thumbnail_url} />

      {/* TOC */}
      <PostToc content={post.content} />

      {/* Body */}
      <PostBody content={post.content} />

      {/* Related Posts */}
      <PostRelated posts={relatedPosts} />

      {/* Newsletter CTA */}
      <NewsletterCta />
    </div>
  );
}
