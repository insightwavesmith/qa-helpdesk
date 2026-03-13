"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createOrganicPost,
  updateOrganicPost,
  publishOrganicPost,
} from "@/actions/organic";
import type { OrganicPost, OrganicChannel, OrganicLevel } from "@/types/organic";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "초안", className: "bg-gray-100 text-gray-700 border-gray-200" },
  review: { label: "검토중", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  scheduled: { label: "예약됨", className: "bg-blue-50 text-blue-700 border-blue-200" },
  published: { label: "발행완료", className: "bg-green-50 text-green-700 border-green-200" },
  archived: { label: "보관", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

interface OrganicPostEditorProps {
  post?: OrganicPost | null;
  isNew?: boolean;
}

export default function OrganicPostEditor({ post, isNew }: OrganicPostEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [channel, setChannel] = useState<OrganicChannel>(post?.channel ?? "naver_blog");
  const [level, setLevel] = useState<OrganicLevel | "">(post?.level ?? "");
  const [keywordsInput, setKeywordsInput] = useState(post?.keywords.join(", ") ?? "");

  const parseKeywords = (input: string): string[] =>
    input
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const keywords = parseKeywords(keywordsInput);
      if (isNew) {
        const result = await createOrganicPost({
          title: title.trim(),
          content: content || undefined,
          channel,
          keywords,
          level: level || undefined,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("글이 생성되었습니다.");
        router.push(`/admin/organic/${result.data!.id}`);
      } else if (post) {
        const result = await updateOrganicPost(post.id, {
          title: title.trim(),
          content: content || undefined,
          channel,
          keywords,
          level: level || undefined,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("저장되었습니다.");
      }
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [title, content, channel, level, keywordsInput, isNew, post, router]);

  const handlePublish = useCallback(async () => {
    if (!post) return;
    if (!confirm("발행하시겠습니까? 상태가 '발행완료'로 변경됩니다.")) return;
    setPublishing(true);
    try {
      const result = await publishOrganicPost(post.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("발행되었습니다.");
      router.refresh();
    } catch {
      toast.error("발행에 실패했습니다.");
    } finally {
      setPublishing(false);
    }
  }, [post, router]);

  const statusInfo = post
    ? STATUS_BADGE[post.status] ?? { label: post.status, className: "" }
    : null;

  return (
    <div className="space-y-6">
      {/* 뒤로가기 */}
      <Link
        href="/admin/organic?tab=posts"
        onClick={(e) => {
          e.preventDefault();
          router.back();
        }}
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        오가닉 채널
      </Link>

      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? "새 글 작성" : "글 편집"}
          </h1>
          {statusInfo && (
            <Badge variant="outline" className={`text-[11px] ${statusInfo.className}`}>
              {statusInfo.label}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            저장
          </Button>
          {post && post.status !== "published" && (
            <Button
              className="bg-[#F75D5D] hover:bg-[#E54949]"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              발행
            </Button>
          )}
        </div>
      </div>

      {/* 편집 폼 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 본문 영역 */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  제목
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="글 제목을 입력하세요"
                  className="text-[14px]"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  본문 (마크다운)
                </label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="마크다운 형식으로 본문을 작성하세요"
                  rows={20}
                  className="text-[14px] font-mono"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 사이드바 */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  채널
                </label>
                <Select value={channel} onValueChange={(v) => setChannel(v as OrganicChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="naver_blog">📝 블로그</SelectItem>
                    <SelectItem value="naver_cafe">☕ 카페</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  레벨
                </label>
                <Select value={level} onValueChange={(v) => setLevel(v as OrganicLevel | "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택 안함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">선택 안함</SelectItem>
                    <SelectItem value="L1">L1</SelectItem>
                    <SelectItem value="L2">L2</SelectItem>
                    <SelectItem value="L3">L3</SelectItem>
                    <SelectItem value="L4">L4</SelectItem>
                    <SelectItem value="L5">L5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  키워드
                </label>
                <Input
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="쉼표로 구분 (예: 메타광고, ROAS)"
                  className="text-[14px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  쉼표(,)로 구분하여 여러 키워드를 입력하세요
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 메타 정보 (기존 글인 경우) */}
          {post && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="text-[13px]">
                  <span className="text-gray-500">생성일: </span>
                  <span className="text-gray-900">
                    {new Date(post.created_at).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {post.published_at && (
                  <div className="text-[13px]">
                    <span className="text-gray-500">발행일: </span>
                    <span className="text-gray-900">
                      {new Date(post.published_at).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {post.external_url && (
                  <div className="text-[13px]">
                    <span className="text-gray-500">발행 URL: </span>
                    <a
                      href={post.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      링크 열기
                    </a>
                  </div>
                )}
                {post.seo_score !== null && (
                  <div className="text-[13px]">
                    <span className="text-gray-500">SEO 점수: </span>
                    <span className="text-gray-900 font-medium">{post.seo_score}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
