"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getDeletedContents, restoreContents } from "@/actions/curation";

interface DeletedSectionProps {
  sourceFilter: string;
  onRestore: () => void;
}

interface DeletedItem {
  id: string;
  title: string;
  source_type: string | null;
  deleted_at: string;
  created_at: string;
}

function daysUntilPermanentDelete(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const permanentDate = new Date(deletedDate.getTime() + 30 * 86400000);
  const now = new Date();
  return Math.max(0, Math.ceil((permanentDate.getTime() - now.getTime()) / 86400000));
}

export function DeletedSection({ sourceFilter, onRestore }: DeletedSectionProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [count, setCount] = useState(0);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getDeletedContents(sourceFilter !== "all" ? sourceFilter : undefined)
      .then(({ data, count: c }) => {
        setItems(data as unknown as DeletedItem[]);
        setCount(c);
      })
      .catch(() => {
        setItems([]);
        setCount(0);
      });
  }, [sourceFilter]);

  const handleRestore = async (ids: string[]) => {
    setRestoring(true);
    const { error } = await restoreContents(ids);
    if (error) {
      toast.error("복원에 실패했습니다.");
    } else {
      toast.success(`${ids.length}개 콘텐츠를 복원했습니다.`);
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      setCount((prev) => prev - ids.length);
      onRestore();
    }
    setRestoring(false);
  };

  if (count === 0) return null;

  return (
    <div className="mt-4">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          <span className="text-sm font-semibold text-red-800">
            삭제된 콘텐츠 ({count}건)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {open && items.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2 border-red-200 text-red-600 hover:bg-red-100"
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(items.map((i) => i.id));
              }}
              disabled={restoring}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              전체 복원
            </Button>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-red-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-red-400" />
          )}
        </div>
      </button>

      {/* 삭제 목록 */}
      {open && (
        <div className="border border-red-200 border-t-0 rounded-b-lg bg-white divide-y divide-red-50">
          {items.map((item) => {
            const daysLeft = daysUntilPermanentDelete(item.deleted_at);
            const deletedDate = new Date(item.deleted_at).toLocaleDateString("ko-KR", {
              month: "numeric",
              day: "numeric",
            });

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="text-sm text-gray-400 line-through truncate flex-1">
                  {item.title}
                </span>
                <span className="text-[11px] text-gray-300 shrink-0">
                  {deletedDate} 삭제 · {daysLeft}일 후 영구 삭제
                </span>
                <button
                  onClick={() => handleRestore([item.id])}
                  disabled={restoring}
                  className="text-xs text-[#F75D5D] font-medium hover:underline shrink-0"
                >
                  복원
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
