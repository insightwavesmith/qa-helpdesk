"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Eye, Loader2, Users, Mail, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import AiWriteDialog from "@/components/email/ai-write-dialog";
import ContentPickerDialog from "@/components/content/content-picker-dialog";

const TipTapEditor = dynamic(() => import("@/components/email/tiptap-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-[460px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
      에디터 로딩 중...
    </div>
  ),
});

type TargetGroup = "all_leads" | "all_students" | "all_members" | "custom";
type TemplateType = "newsletter" | "webinar" | "performance";

interface RecipientCounts {
  leads: number;
  students: number;
  members: number;
}

interface EmailSendRecord {
  id: string;
  subject: string;
  recipient_type: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  recipient_email: string;
}

const TARGET_LABELS: Record<TargetGroup, string> = {
  all_leads: "전체 리드 (웨비나 신청자)",
  all_students: "수강생",
  all_members: "가입 회원",
  custom: "직접 입력",
};

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  newsletter: "뉴스레터",
  webinar: "웨비나 초대",
  performance: "성과 공유",
};

export default function AdminEmailPage() {
  const [subject, setSubject] = useState("");
  const [target, setTarget] = useState<TargetGroup>("all_leads");
  const [customEmails, setCustomEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateType, setTemplateType] = useState<TemplateType>("newsletter");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);

  // Newsletter fields
  const [html, setHtml] = useState("");

  // Webinar fields
  const [webinarTitle, setWebinarTitle] = useState("");
  const [webinarDate, setWebinarDate] = useState("");
  const [webinarTime, setWebinarTime] = useState("");
  const [webinarUrl, setWebinarUrl] = useState("");

  // Performance fields
  const [perfRoas, setPerfRoas] = useState("");
  const [perfRevenue, setPerfRevenue] = useState("");
  const [perfAdSpend, setPerfAdSpend] = useState("");
  const [perfBody, setPerfBody] = useState("");

  const [counts, setCounts] = useState<RecipientCounts | null>(null);
  const [history, setHistory] = useState<EmailSendRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("email_sends")
      .select("id, subject, recipient_type, status, sent_at, created_at, recipient_email")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory((data as EmailSendRecord[]) || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    fetch("/api/admin/email/recipients")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setCounts(data);
      });

    loadHistory();
  }, [loadHistory]);

  const getTargetCount = () => {
    if (!counts) return "...";
    switch (target) {
      case "all_leads":
        return counts.leads;
      case "all_students":
        return counts.students;
      case "all_members":
        return counts.members;
      case "custom":
        return customEmails
          .split(/[\n,]/)
          .filter((e) => e.trim()).length;
    }
  };

  const isFormValid = () => {
    if (!subject.trim()) return false;
    switch (templateType) {
      case "newsletter":
        return !!html.trim();
      case "webinar":
        return !!webinarTitle.trim() && !!webinarDate.trim() && !!webinarTime.trim() && !!webinarUrl.trim();
      case "performance":
        return !!perfRoas.trim() && !!perfRevenue.trim() && !!perfAdSpend.trim();
    }
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }

    const count = getTargetCount();
    if (
      !confirm(
        `"${subject}" 메일을 ${TARGET_LABELS[target]} (${count}명)에게 발송하시겠습니까?`
      )
    ) {
      return;
    }

    setSending(true);
    try {
      const body: Record<string, unknown> = { target, subject };
      if (target === "custom") {
        body.customEmails = customEmails
          .split(/[\n,]/)
          .map((e) => e.trim())
          .filter(Boolean);
      }

      if (templateType === "newsletter") {
        body.template = "newsletter";
        body.templateProps = { bodyHtml: html };
      } else if (templateType === "webinar") {
        body.template = "webinar";
        body.templateProps = {
          title: webinarTitle,
          date: webinarDate,
          time: webinarTime,
          registrationUrl: webinarUrl,
        };
      } else if (templateType === "performance") {
        body.template = "performance";
        body.templateProps = {
          roas: perfRoas,
          revenue: perfRevenue,
          adSpend: perfAdSpend,
          bodyText: perfBody || "자사몰 사관학교 수강생들의 성과를 공유합니다.",
        };
      }

      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "발송 실패");
        return;
      }

      toast.success(
        `발송 완료: ${result.sent}건 성공, ${result.failed}건 실패`
      );
      setSubject("");
      setHtml("");
      setCustomEmails("");
      setWebinarTitle("");
      setWebinarDate("");
      setWebinarTime("");
      setWebinarUrl("");
      setPerfRoas("");
      setPerfRevenue("");
      setPerfAdSpend("");
      setPerfBody("");
      loadHistory();
    } catch {
      toast.error("발송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  // 발송 이력을 subject별로 그룹핑
  const groupedHistory = history.reduce<
    Record<string, { subject: string; type: string; sent: number; failed: number; created_at: string }>
  >((acc, record) => {
    const key = `${record.subject}_${record.created_at.slice(0, 16)}`;
    if (!acc[key]) {
      acc[key] = {
        subject: record.subject,
        type: record.recipient_type,
        sent: 0,
        failed: 0,
        created_at: record.created_at,
      };
    }
    if (record.status === "sent") acc[key].sent++;
    else acc[key].failed++;
    return acc;
  }, {});

  const historyGroups = Object.values(groupedHistory).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          이메일 발송
        </h1>
        <p className="text-[14px] text-gray-500 mt-1">
          뉴스레터 및 공지 이메일을 발송합니다.
        </p>
      </div>

      {/* 수신자 현황 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-orange-50 p-2">
                <Users className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">리드</p>
                <p className="text-[20px] font-semibold">
                  {counts?.leads ?? "..."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-blue-50 p-2">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">수강생</p>
                <p className="text-[20px] font-semibold">
                  {counts?.students ?? "..."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-50 p-2">
                <Users className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">가입 회원</p>
                <p className="text-[20px] font-semibold">
                  {counts?.members ?? "..."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 이메일 작성 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">
            <Mail className="inline-block h-4 w-4 mr-2 opacity-60" />
            이메일 작성
          </CardTitle>
          <CardDescription>
            템플릿을 선택하고 이메일을 작성합니다. React Email 기반 템플릿이 적용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 템플릿 선택 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">템플릿</label>
            <Select
              value={templateType}
              onValueChange={(v) => setTemplateType(v as TemplateType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 수신 대상 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">수신 대상</label>
            <Select
              value={target}
              onValueChange={(v) => setTarget(v as TargetGroup)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_leads">
                  전체 리드 ({counts?.leads ?? "..."}명)
                </SelectItem>
                <SelectItem value="all_students">
                  수강생 ({counts?.students ?? "..."}명)
                </SelectItem>
                <SelectItem value="all_members">
                  가입 회원 ({counts?.members ?? "..."}명)
                </SelectItem>
                <SelectItem value="custom">직접 입력</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 직접 입력 */}
          {target === "custom" && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">
                이메일 주소 (쉼표 또는 줄바꿈으로 구분)
              </label>
              <Textarea
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
                placeholder="user1@example.com, user2@example.com"
                rows={3}
              />
            </div>
          )}

          {/* 제목 (공통) */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">제목</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="[BS CAMP] 이메일 제목"
            />
          </div>

          {/* 뉴스레터 필드 */}
          {templateType === "newsletter" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-medium">본문</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContentPickerOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-1.5" />
                  콘텐츠에서 가져오기
                </Button>
              </div>
              <TipTapEditor
                content={html}
                onChange={setHtml}
                placeholder="이메일 내용을 작성하세요..."
                onAiWrite={() => setAiDialogOpen(true)}
              />
              <AiWriteDialog
                open={aiDialogOpen}
                onOpenChange={setAiDialogOpen}
                onGenerated={(result) => {
                  setHtml(result.content);
                  setSubject(result.subject);
                  setAiDialogOpen(false);
                  toast.success("AI 뉴스레터가 생성되었습니다.");
                }}
              />
              <ContentPickerDialog
                open={contentPickerOpen}
                onOpenChange={setContentPickerOpen}
                onImport={(result) => {
                  setHtml(result.html);
                  setSubject(result.subject);
                  setContentPickerOpen(false);
                  toast.success("콘텐츠를 가져왔습니다.");
                }}
              />
            </div>
          )}

          {/* 웨비나 필드 */}
          {templateType === "webinar" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">웨비나 제목</label>
                <Input
                  value={webinarTitle}
                  onChange={(e) => setWebinarTitle(e.target.value)}
                  placeholder="사례로 배우는 메타 광고"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium">날짜</label>
                  <Input
                    value={webinarDate}
                    onChange={(e) => setWebinarDate(e.target.value)}
                    placeholder="2026. 02. 12. 목"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium">시간</label>
                  <Input
                    value={webinarTime}
                    onChange={(e) => setWebinarTime(e.target.value)}
                    placeholder="15:00~17:30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">신청 링크</label>
                <Input
                  value={webinarUrl}
                  onChange={(e) => setWebinarUrl(e.target.value)}
                  placeholder="https://whattime.co.kr/inwv/..."
                />
              </div>
            </div>
          )}

          {/* 성과 공유 필드 */}
          {templateType === "performance" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium">ROAS</label>
                  <Input
                    value={perfRoas}
                    onChange={(e) => setPerfRoas(e.target.value)}
                    placeholder="254%"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium">매출</label>
                  <Input
                    value={perfRevenue}
                    onChange={(e) => setPerfRevenue(e.target.value)}
                    placeholder="104억"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium">광고비</label>
                  <Input
                    value={perfAdSpend}
                    onChange={(e) => setPerfAdSpend(e.target.value)}
                    placeholder="40.8억"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">본문</label>
                <Textarea
                  value={perfBody}
                  onChange={(e) => setPerfBody(e.target.value)}
                  placeholder="자사몰 사관학교 수강생들의 성과를 공유합니다."
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* 안내 */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-[13px] text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Google Workspace SMTP 제한: 일 2,000건. 50건씩 배치 발송 (1초 간격).
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!isFormValid()}>
                  <Eye className="h-4 w-4 mr-2" />
                  미리보기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{subject || "(제목 없음)"}</DialogTitle>
                </DialogHeader>
                <PreviewFrame
                  templateType={templateType}
                  subject={subject}
                  html={html}
                  webinarTitle={webinarTitle}
                  webinarDate={webinarDate}
                  webinarTime={webinarTime}
                  webinarUrl={webinarUrl}
                  perfRoas={perfRoas}
                  perfRevenue={perfRevenue}
                  perfAdSpend={perfAdSpend}
                  perfBody={perfBody}
                />
              </DialogContent>
            </Dialog>

            <Button
              onClick={handleSend}
              disabled={sending || !isFormValid()}
              className="bg-[#F75D5D] hover:bg-[#E54949]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sending ? "발송 중..." : `발송하기 (${getTargetCount()}명)`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 발송 이력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">발송 이력</CardTitle>
          <CardDescription>최근 발송 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : historyGroups.length === 0 ? (
            <p className="text-center py-8 text-[14px] text-gray-500">
              아직 발송 이력이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead className="text-right">성공</TableHead>
                  <TableHead className="text-right">실패</TableHead>
                  <TableHead className="text-right">발송일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyGroups.map((group, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium max-w-[250px] truncate">
                      {group.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">
                        {group.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {group.sent}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {group.failed}
                    </TableCell>
                    <TableCell className="text-right text-[13px] text-gray-500">
                      {new Date(group.created_at).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewFrame({
  templateType,
  subject,
  html,
  webinarTitle,
  webinarDate,
  webinarTime,
  webinarUrl,
  perfRoas,
  perfRevenue,
  perfAdSpend,
  perfBody,
}: {
  templateType: TemplateType;
  subject: string;
  html: string;
  webinarTitle: string;
  webinarDate: string;
  webinarTime: string;
  webinarUrl: string;
  perfRoas: string;
  perfRevenue: string;
  perfAdSpend: string;
  perfBody: string;
}) {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 전 loading 표시는 의도적 패턴
    setLoading(true);
    const body: Record<string, unknown> = {
      template: templateType,
      subject,
    };

    if (templateType === "newsletter") {
      body.templateProps = { bodyHtml: html };
    } else if (templateType === "webinar") {
      body.templateProps = {
        title: webinarTitle,
        date: webinarDate,
        time: webinarTime,
        registrationUrl: webinarUrl,
      };
    } else if (templateType === "performance") {
      body.templateProps = {
        roas: perfRoas,
        revenue: perfRevenue,
        adSpend: perfAdSpend,
        bodyText: perfBody || "자사몰 사관학교 수강생들의 성과를 공유합니다.",
      };
    }

    fetch("/api/admin/email/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.html) {
          setPreviewHtml(data.html);
        } else {
          setPreviewHtml(
            `<p style="padding:20px;color:#999;">미리보기를 불러올 수 없습니다.</p>`
          );
        }
      })
      .catch(() => {
        setPreviewHtml(
          `<p style="padding:20px;color:#999;">미리보기 오류가 발생했습니다.</p>`
        );
      })
      .finally(() => setLoading(false));
  }, [templateType, subject, html, webinarTitle, webinarDate, webinarTime, webinarUrl, perfRoas, perfRevenue, perfAdSpend, perfBody]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        미리보기 렌더링 중...
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <iframe
        srcDoc={previewHtml}
        className="w-full h-[500px]"
        title="이메일 미리보기"
      />
    </div>
  );
}
