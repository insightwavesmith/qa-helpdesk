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
import { Send, Eye, Loader2, Users, Mail, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type TargetGroup = "all_leads" | "all_students" | "all_members" | "custom";

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

export default function AdminEmailPage() {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [target, setTarget] = useState<TargetGroup>("all_leads");
  const [customEmails, setCustomEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
    // 수신자 수 조회
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

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    if (!html.trim()) {
      toast.error("본문을 입력해주세요.");
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
      const body: Record<string, unknown> = { target, subject, html };
      if (target === "custom") {
        body.customEmails = customEmails
          .split(/[\n,]/)
          .map((e) => e.trim())
          .filter(Boolean);
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
        <h1 className="text-[22px] font-semibold text-foreground">
          이메일 발송
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1">
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
                <p className="text-[12px] text-muted-foreground">리드</p>
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
                <p className="text-[12px] text-muted-foreground">수강생</p>
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
                <p className="text-[12px] text-muted-foreground">가입 회원</p>
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
            HTML 형식으로 이메일을 작성합니다. BS CAMP 뉴스레터 템플릿이 자동 적용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* 제목 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">제목</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="[BS CAMP] 뉴스레터 제목"
            />
          </div>

          {/* 본문 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">
              본문 (HTML)
            </label>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<h2>안녕하세요!</h2><p>BS CAMP 뉴스레터입니다.</p>"
              rows={12}
              className="font-mono text-[13px]"
            />
          </div>

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
                <Button variant="outline" disabled={!html.trim()}>
                  <Eye className="h-4 w-4 mr-2" />
                  미리보기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{subject || "(제목 없음)"}</DialogTitle>
                </DialogHeader>
                <div className="border rounded-md overflow-hidden">
                  <iframe
                    srcDoc={generatePreviewHtml(subject, html)}
                    className="w-full h-[500px]"
                    title="이메일 미리보기"
                  />
                </div>
              </DialogContent>
            </Dialog>

            <Button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !html.trim()}
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
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : historyGroups.length === 0 ? (
            <p className="text-center py-8 text-[14px] text-muted-foreground">
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
                    <TableCell className="text-right text-[13px] text-muted-foreground">
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

function generatePreviewHtml(subject: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; padding: 0; background-color: #f7f6f5; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #1a1a1a; padding: 28px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 18px; font-weight: 600; margin: 0; }
    .body { padding: 32px; color: #333333; font-size: 15px; line-height: 1.7; }
    .body h1, .body h2, .body h3 { color: #1a1a1a; }
    .body a { color: #FF5757; }
    .footer { background-color: #fafafa; padding: 24px 32px; text-align: center; font-size: 12px; color: #999999; line-height: 1.6; }
    .divider { border: 0; border-top: 1px solid #eeeeee; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BS CAMP</h1>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <hr class="divider" />
      <p>본 메일은 BS CAMP에서 발송한 뉴스레터입니다.<br/>수신거부 링크</p>
    </div>
  </div>
</body>
</html>`;
}
