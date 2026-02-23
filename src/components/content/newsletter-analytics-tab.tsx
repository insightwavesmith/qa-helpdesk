"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Mail,
  Eye,
  MousePointerClick,
  Users,
} from "lucide-react";

interface SendRecord {
  id: string;
  email: string;
  type: string;
  openedAt: string | null;
  clickedAt: string | null;
}

interface Campaign {
  subject: string;
  sentAt: string;
  contentId: string | null;
  recipients: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
  sends: SendRecord[];
}

const TYPE_LABEL: Record<string, { label: string; className: string }> = {
  lead: { label: "리드", className: "bg-green-50 text-green-700" },
  student: { label: "수강생", className: "bg-blue-50 text-blue-700" },
  member: { label: "회원", className: "bg-purple-50 text-purple-700" },
  custom: { label: "직접입력", className: "bg-gray-100 text-gray-600" },
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 3 ? local.slice(0, 3) + "****" : local + "****";
  return `${masked}@${domain}`;
}

export function NewsletterAnalyticsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);

  useEffect(() => {
    fetch("/api/admin/email/analytics")
      .then((r) => r.json())
      .then((data) => {
        if (data.campaigns) setCampaigns(data.campaigns);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          성과 데이터를 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20">
          <Mail className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-[15px] font-medium text-gray-500">
            아직 발송된 뉴스레터가 없습니다
          </p>
          <p className="text-[13px] text-gray-400 mt-1">
            뉴스레터를 발송하면 열람/클릭 성과를 확인할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  // 전체 통계
  const totalRecipients = campaigns.reduce((s, c) => s + c.recipients, 0);
  const totalOpens = campaigns.reduce((s, c) => s + c.opens, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const avgOpenRate =
    totalRecipients > 0
      ? Math.round((totalOpens / totalRecipients) * 1000) / 10
      : 0;
  const avgClickRate =
    totalRecipients > 0
      ? Math.round((totalClicks / totalRecipients) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">총 발송</p>
                <p className="text-xl font-semibold">{campaigns.length}건</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <Eye className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">평균 열람율</p>
                <p className="text-xl font-semibold text-green-600">
                  {avgOpenRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2">
                <MousePointerClick className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">평균 클릭율</p>
                <p className="text-xl font-semibold text-purple-600">
                  {avgClickRate}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-50 p-2">
                <Users className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">총 수신자</p>
                <p className="text-xl font-semibold">
                  {totalRecipients.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 발송 목록 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">제목</TableHead>
                <TableHead>발송일</TableHead>
                <TableHead className="text-right">수신자</TableHead>
                <TableHead className="text-right">열람</TableHead>
                <TableHead className="text-right">열람율</TableHead>
                <TableHead className="text-right">클릭</TableHead>
                <TableHead className="text-right">클릭율</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c, i) => (
                <TableRow
                  key={i}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelected(c)}
                >
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {c.subject}
                  </TableCell>
                  <TableCell className="text-gray-500 text-[13px]">
                    {new Date(c.sentAt).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.recipients.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.opens.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className="text-[11px] bg-green-50 text-green-700 border-green-200"
                    >
                      {c.openRate}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.clicks.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className="text-[11px] bg-purple-50 text-purple-700 border-purple-200"
                    >
                      {c.clickRate}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 상세 모달 */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">{selected.subject}</DialogTitle>
              <p className="text-sm text-gray-500">
                {new Date(selected.sentAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                발송 &middot; 수신자 {selected.recipients}명
              </p>
            </DialogHeader>

            <div className="space-y-6">
              {/* 성과 요약 */}
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold">{selected.opens}</p>
                  <p className="text-xs text-gray-500 mt-1">열람</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-2xl font-bold text-green-600">
                    {selected.openRate}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">열람율</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <p className="text-2xl font-bold text-purple-600">
                    {selected.clickRate}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">클릭율</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-2xl font-bold">{selected.recipients}</p>
                  <p className="text-xs text-gray-500 mt-1">수신자</p>
                </div>
              </div>

              {/* 수신자 목록 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  수신자 목록{" "}
                  <span className="text-gray-400 font-normal">
                    (최근 30명)
                  </span>
                </h3>
                <div className="bg-gray-50 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">이메일</TableHead>
                        <TableHead className="text-xs">유형</TableHead>
                        <TableHead className="text-xs">열람</TableHead>
                        <TableHead className="text-xs text-center">
                          클릭
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.sends.slice(0, 30).map((s) => {
                        const t = TYPE_LABEL[s.type] || TYPE_LABEL.custom;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="text-[13px] text-gray-700">
                              {maskEmail(s.email)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${t.className}`}
                              >
                                {t.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {s.openedAt
                                ? new Date(s.openedAt).toLocaleString("ko-KR", {
                                    month: "numeric",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {s.clickedAt ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {selected.sends.length > 30 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    ... 외 {selected.sends.length - 30}명
                  </p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
