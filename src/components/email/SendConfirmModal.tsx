"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Users } from "lucide-react";

type TargetGroup = "all" | "all_leads" | "all_students" | "all_members";

interface RecipientCounts {
  leads: number;
  students: number;
  members: number;
  all_deduplicated: number;
}

const TARGET_LABELS: Record<TargetGroup, string> = {
  all: "전체 (중복 제거)",
  all_leads: "전체 리드",
  all_students: "수강생",
  all_members: "가입 회원",
};

interface SendConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string;
  subject: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  onSendComplete: () => void;
}

export default function SendConfirmModal({
  open,
  onOpenChange,
  contentId,
  subject: initialSubject,
  bodyHtml,
  ctaText,
  ctaUrl,
  onSendComplete,
}: SendConfirmModalProps) {
  const [target, setTarget] = useState<TargetGroup>("all");
  const [editSubject, setEditSubject] = useState(initialSubject);
  const [counts, setCounts] = useState<RecipientCounts | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Sync subject when modal opens
  useEffect(() => {
    if (open) {
      setEditSubject(initialSubject);
    }
  }, [open, initialSubject]);

  // Fetch recipient counts when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingCounts(true);
    fetch("/api/admin/email/recipients")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setCounts(data);
      })
      .catch(() => {
        // silently fail
      })
      .finally(() => setLoadingCounts(false));
  }, [open]);

  const getTargetCount = useCallback((): number | string => {
    if (!counts) return "...";
    switch (target) {
      case "all":
        return counts.all_deduplicated ?? 0;
      case "all_leads":
        return counts.leads;
      case "all_students":
        return counts.students;
      case "all_members":
        return counts.members;
    }
  }, [counts, target]);

  async function handleSend() {
    if (!editSubject.trim()) return;

    setSending(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          subject: editSubject,
          template: "newsletter",
          templateProps: {
            bodyHtml,
            ctaText: ctaText || undefined,
            ctaUrl: ctaUrl || undefined,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "발송 실패");
      }

      // Update email_sent_at on the content
      const { updateContentEmailSentAt } = await import("@/actions/contents");
      await updateContentEmailSentAt(contentId);

      onSendComplete();
      return result;
    } finally {
      setSending(false);
    }
  }

  const recipientCount = getTargetCount();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            이메일 발송 확인
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target selection */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              수신 대상
            </label>
            <Select
              value={target}
              onValueChange={(v) => setTarget(v as TargetGroup)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TARGET_LABELS).map(([value, label]) => {
                  let count: number | string = "...";
                  if (counts) {
                    switch (value) {
                      case "all":
                        count = counts.all_deduplicated ?? 0;
                        break;
                      case "all_leads":
                        count = counts.leads;
                        break;
                      case "all_students":
                        count = counts.students;
                        break;
                      case "all_members":
                        count = counts.members;
                        break;
                    }
                  }
                  return (
                    <SelectItem key={value} value={value}>
                      {label} ({count}명)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Recipient count display */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              발송 대상:{" "}
              {loadingCounts ? (
                <Loader2 className="inline h-3 w-3 animate-spin" />
              ) : (
                <span className="font-semibold text-gray-900">
                  {recipientCount}명
                </span>
              )}
            </span>
          </div>

          {/* Subject edit */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              이메일 제목
            </label>
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              placeholder="[자사몰사관학교] 이메일 제목"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              취소
            </Button>
            <Button
              className="bg-[#F75D5D] hover:bg-[#E54949] text-white"
              onClick={handleSend}
              disabled={sending || !editSubject.trim()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sending
                ? "발송 중..."
                : `발송 확인 (${recipientCount}명)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
