"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  TestTube,
  Save,
  Info,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { updateContentEmailSentAt } from "@/actions/contents";
import { validateBannerKeys } from "@/lib/email-template-utils";
import { toast } from "sonner";
import type { Content } from "@/types/content";
import type { UnlayerEditorHandle } from "@/components/admin/unlayer-editor";

const UnlayerEditor = dynamic(
  () => import("@/components/admin/unlayer-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[700px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        에디터 로딩 중...
      </div>
    ),
  }
);

import { BS_CAMP_DEFAULT_TEMPLATE } from "@/lib/email-default-template";
import { buildDesignFromSummary } from "@/lib/email-template-utils";

const defaultTemplate: object | null = BS_CAMP_DEFAULT_TEMPLATE;

interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  total: number;
}

interface NewsletterEditPanelProps {
  content: Content;
  onContentUpdate: () => void;
}

export default function NewsletterEditPanel({
  content,
  onContentUpdate,
}: NewsletterEditPanelProps) {
  const editorRef = useRef<UnlayerEditorHandle>(null);
  const [emailSubject, setEmailSubject] = useState(
    content.email_subject || content.title
  );
  const [target, setTarget] = useState<string>("all_leads");
  const [recipientStats, setRecipientStats] = useState<RecipientStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // 기존 디자인 JSON이 있으면 로드, email_summary만 있으면 자동 주입, 없으면 기본 템플릿
  let initialDesign: object | null = defaultTemplate;
  let designBuildFailed = false;
  if (content.email_design_json) {
    initialDesign = content.email_design_json as object;
  } else if (content.email_summary) {
    try {
      initialDesign = buildDesignFromSummary(content);
    } catch (e) {
      console.error("뉴스레터 디자인 빌드 실패:", e);
      designBuildFailed = true;
    }
  }

  // 기존 email_summary만 있고 Unlayer 데이터 없는 경우 안내
  const hasLegacySummary = !content.email_design_json && !!content.email_summary;

  // 배너키 검증 (email_summary가 있을 때만)
  const bannerWarnings = content.email_summary
    ? validateBannerKeys(content.email_summary, content.type ?? "education")
    : null;

  useEffect(() => {
    fetch("/api/admin/email/recipients")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setRecipientStats(data);
      })
      .catch(() => {});
  }, []);

  const getRecipientCount = (): number => {
    if (!recipientStats) return 0;
    switch (target) {
      case "all_leads":
        return recipientStats.leads;
      case "all_students":
        return recipientStats.students;
      case "all_members":
        return recipientStats.members;
      case "all":
        return recipientStats.total;
      default:
        return 0;
    }
  };

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;
    setSaving(true);
    try {
      const { design, html } = await editorRef.current.exportHtml();
      const res = await fetch(`/api/admin/content/${content.id}/newsletter`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_design_json: design,
          email_html: html,
          email_subject: emailSubject,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "저장에 실패했습니다.");
      } else {
        toast.success("뉴스레터 디자인이 저장되었습니다.");
        onContentUpdate();
      }
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [content.id, emailSubject, onContentUpdate]);

  const handleTestSend = useCallback(async () => {
    if (!editorRef.current) return;
    setTestSending(true);
    try {
      const { html } = await editorRef.current.exportHtml();
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "custom",
          customEmails: ["smith.kim@inwv.co"],
          subject: `[테스트] ${emailSubject}`,
          html,
          isUnlayerHtml: true,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("테스트 이메일이 발송되었습니다.");
      }
    } catch {
      toast.error("테스트 발송에 실패했습니다.");
    } finally {
      setTestSending(false);
    }
  }, [emailSubject]);

  const handleSend = useCallback(async () => {
    if (!editorRef.current) return;
    const count = getRecipientCount();
    if (count === 0) {
      toast.error("수신자가 없습니다.");
      return;
    }
    if (!confirm(`${count}명에게 뉴스레터를 발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const { html } = await editorRef.current.exportHtml();
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          subject: emailSubject,
          html,
          isUnlayerHtml: true,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.sent}명에게 발송 완료 (실패: ${data.failed}건)`);
        await updateContentEmailSentAt(content.id);
        onContentUpdate();
      }
    } catch {
      toast.error("발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, emailSubject, content.id, onContentUpdate]);

  // email_summary가 없으면 안내 메시지만 표시
  if (!content.email_summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-50 py-16">
        <Mail className="size-8 text-gray-300" />
        <p className="text-sm text-gray-500">
          AI 뉴스레터를 먼저 생성해주세요.
        </p>
        <p className="text-xs text-gray-400">
          위의 &quot;뉴스레터 생성&quot; 버튼을 클릭하면 본문 기반으로 자동 생성됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 배너키 검증 경고 */}
      {bannerWarnings && !bannerWarnings.valid && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700">
            <p className="font-medium">배너키 검증 경고</p>
            {bannerWarnings.missing.length > 0 && (
              <p>누락: {bannerWarnings.missing.join(", ")}</p>
            )}
            {bannerWarnings.forbidden.length > 0 && (
              <p>인식 불가: {bannerWarnings.forbidden.join(", ")}</p>
            )}
          </div>
        </div>
      )}

      {/* 디자인 빌드 실패 경고 */}
      {designBuildFailed && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">
            뉴스레터 디자인 생성에 실패했습니다. 기본 템플릿이 로드되었습니다.
          </p>
        </div>
      )}

      {/* 기존 텍스트 뉴스레터 안내 배너 */}
      {hasLegacySummary && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Info className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            기존 텍스트 뉴스레터가 있습니다. 아래 에디터에서 새로 디자인하세요.
          </p>
        </div>
      )}

      {/* 메타 정보 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                수신 대상
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_leads">
                    리드 전체{recipientStats ? ` (${recipientStats.leads}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all_students">
                    수강생{recipientStats ? ` (${recipientStats.students}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all_members">
                    회원{recipientStats ? ` (${recipientStats.members}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all">
                    전체{recipientStats ? ` (${recipientStats.total}명)` : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                이메일 제목
              </label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="h-9 text-sm"
                placeholder="이메일 제목"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 액션 바 */}
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !editorReady}
          className="bg-[#F75D5D] hover:bg-[#E54949] gap-1 text-xs"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          저장
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestSend}
          disabled={testSending || !editorReady}
          className="gap-1 text-xs"
        >
          {testSending ? <Loader2 className="size-3.5 animate-spin" /> : <TestTube className="size-3.5" />}
          테스트 발송
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !editorReady}
          className="bg-purple-600 hover:bg-purple-700 gap-1 text-xs"
        >
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          발송하기 ({getRecipientCount()}명)
        </Button>
      </div>

      {/* Unlayer 에디터 (풀폭) */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <UnlayerEditor
          ref={editorRef}
          designJson={initialDesign}
          onReady={() => setEditorReady(true)}
        />
      </div>
    </div>
  );
}
