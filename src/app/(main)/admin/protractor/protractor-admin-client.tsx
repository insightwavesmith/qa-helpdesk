"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Trash2,
  RefreshCw,
} from "lucide-react";

interface AccountStatus {
  id: string;
  account_id: string;
  account_name: string;
  created_at: string;
  meta: {
    ok: boolean;
    last_date: string | null;
    ad_count: number;
  };
  mixpanel: {
    ok: boolean;
    state: "ok" | "no_data" | "not_configured";
    last_date: string | null;
    sessions: number;
  };
}

interface Stats {
  total: number;
  metaOk: number;
  mixpanelOk: number;
  error: number;
}

export function ProtractorAdminClient() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    metaOk: 0,
    mixpanelOk: 0,
    error: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/protractor/status");
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "데이터를 불러올 수 없습니다.");
      }
      const data = await res.json();
      setAccounts(data.accounts);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleDelete = async (accountId: string, accountName: string) => {
    if (!confirm(`'${accountName}' 계정을 삭제하시겠습니까?\n관련 데이터도 함께 삭제됩니다.`)) return;

    setDeletingId(accountId);
    try {
      const res = await fetch(`/api/protractor/accounts?account_id=${accountId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "삭제에 실패했습니다.");
      }
      fetchStatus();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 중 오류 발생");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  const formatCreatedAt = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={fetchStatus}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              전체 계정
            </CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Meta 정상
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.metaOk}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Mixpanel 정상
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.mixpanelOk}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              문제 있음
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.error}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 계정 목록 테이블 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>계정 목록</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchStatus}>
            <RefreshCw className="h-4 w-4 mr-1" />
            새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              등록된 계정이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계정</TableHead>
                  <TableHead>Meta 상태</TableHead>
                  <TableHead>Mixpanel 상태</TableHead>
                  <TableHead>등록일</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    {/* 계정명 + ID */}
                    <TableCell>
                      <div className="font-medium">{acc.account_name}</div>
                      <div className="text-xs text-gray-500 font-mono">
                        {acc.account_id}
                      </div>
                    </TableCell>

                    {/* Meta 상태 */}
                    <TableCell>
                      {acc.meta.ok ? (
                        <div>
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                            정상
                          </Badge>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(acc.meta.last_date)} &middot;{" "}
                            {acc.meta.ad_count}개 광고
                          </div>
                        </div>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                          <XCircle className="h-3 w-3" />
                          데이터 없음
                        </Badge>
                      )}
                    </TableCell>

                    {/* Mixpanel 상태 */}
                    <TableCell>
                      {acc.mixpanel.state === "ok" ? (
                        <div>
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                            정상
                          </Badge>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(acc.mixpanel.last_date)} &middot;{" "}
                            {acc.mixpanel.sessions}명 세션
                          </div>
                        </div>
                      ) : acc.mixpanel.state === "no_data" ? (
                        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
                          <AlertTriangle className="h-3 w-3" />
                          데이터 없음
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                          <XCircle className="h-3 w-3" />
                          미설정
                        </Badge>
                      )}
                    </TableCell>

                    {/* 등록일 */}
                    <TableCell className="text-sm text-gray-500">
                      {formatCreatedAt(acc.created_at)}
                    </TableCell>

                    {/* 액션 */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/protractor?account=${acc.account_id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            대시보드
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            handleDelete(acc.account_id, acc.account_name || acc.account_id)
                          }
                          disabled={deletingId === acc.account_id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
