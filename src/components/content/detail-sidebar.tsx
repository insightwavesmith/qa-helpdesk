"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import NextImage from "next/image";
import { Image as ImageIcon, Eye, Calendar, Mail, Upload, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateContent } from "@/actions/contents";
import { toast } from "sonner";
import type { Content } from "@/types/content";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "초안", className: "bg-gray-100 text-gray-700 border-gray-200" },
  review: { label: "검수대기", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  ready: { label: "발행가능", className: "bg-green-50 text-green-700 border-green-200" },
  published: { label: "게시완료", className: "bg-blue-50 text-blue-700 border-blue-200" },
  archived: { label: "보관", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TYPE_LABEL: Record<string, string> = {
  education: "교육",
  case_study: "고객사례",
  webinar: "웨비나",
  notice: "공지",
  promo: "홍보",
};

interface DetailSidebarProps {
  content: Content;
  onTabChange: (tab: string) => void;
  onContentUpdate: () => void;
}

export default function DetailSidebar({
  content,
  onTabChange,
  onContentUpdate,
}: DetailSidebarProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [thumbnailVersion, setThumbnailVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("content-images")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        toast.error(`스토리지 업로드 실패: ${uploadError.message}`);
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("content-images").getPublicUrl(filePath);

      const { error } = await updateContent(content.id, { thumbnail_url: publicUrl });
      if (error) throw new Error(error);

      setThumbnailVersion((v) => v + 1);
      toast.success("썸네일이 변경되었습니다.");
      onContentUpdate();
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("스토리지"))) {
        toast.error("썸네일 저장에 실패했습니다.");
      }
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleThumbnailDelete = async () => {
    if (!content.thumbnail_url) return;
    setDeleting(true);
    try {
      const supabase = createClient();

      // Storage 파일 경로 추출 (content-images 버킷 기준)
      const url = content.thumbnail_url;
      const bucketSegment = "/content-images/";
      const idx = url.indexOf(bucketSegment);
      if (idx !== -1) {
        const storagePath = url.slice(idx + bucketSegment.length);
        await supabase.storage.from("content-images").remove([storagePath]);
      }

      const { error } = await updateContent(content.id, { thumbnail_url: null });
      if (error) throw new Error(error);

      setThumbnailVersion((v) => v + 1);
      toast.success("썸네일이 삭제되었습니다.");
      onContentUpdate();
    } catch (err) {
      toast.error("썸네일 삭제에 실패했습니다.");
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const statusInfo = STATUS_BADGE[content.status] ?? {
    label: content.status,
    className: "",
  };

  return (
    <div className="w-[240px] shrink-0 space-y-4">
      {/* 썸네일 카드 */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <ImageIcon className="size-3.5" />
            썸네일
          </p>
          {content.thumbnail_url ? (
            <NextImage
              key={`thumb-${thumbnailVersion}-${content.thumbnail_url}`}
              src={content.thumbnail_url}
              alt="썸네일"
              width={240}
              height={135}
              className="w-full aspect-video object-cover rounded-md border border-gray-200"
            />
          ) : (
            <div className="w-full aspect-video bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center">
              <span className="text-xs text-gray-400">이미지 없음</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailUpload}
          />
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || deleting}
            >
              {uploading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Upload className="size-3" />
              )}
              {content.thumbnail_url ? "변경" : "업로드"}
            </Button>
            {content.thumbnail_url && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={handleThumbnailDelete}
                disabled={uploading || deleting}
              >
                {deleting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                삭제
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 게시 정보 카드 */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <p className="text-xs font-medium text-gray-500">게시 정보</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">상태</span>
              <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">유형</span>
              <span className="text-xs font-medium text-gray-700">
                {TYPE_LABEL[content.type] || content.type}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Eye className="size-3" />
                조회수
              </span>
              <span className="text-xs font-medium text-gray-700">
                {(content as Content & { view_count?: number }).view_count ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="size-3" />
                생성일
              </span>
              <span className="text-xs text-gray-700">
                {new Date(content.created_at).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 뉴스레터 상태 카드 */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <Mail className="size-3.5" />
            뉴스레터
          </p>
          {content.email_sent_at ? (
            <div className="space-y-1">
              <Badge
                variant="outline"
                className="text-[10px] bg-purple-50 text-purple-700 border-purple-200"
              >
                발송완료
              </Badge>
              <p className="text-[10px] text-gray-400">
                {new Date(content.email_sent_at).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">미발송</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => onTabChange("newsletter")}
          >
            뉴스레터 탭 &rarr;
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
