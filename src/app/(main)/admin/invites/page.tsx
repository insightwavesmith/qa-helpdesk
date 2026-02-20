"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getInviteCodes,
  createInviteCode,
  deleteInviteCode,
} from "@/actions/invites";

interface InviteCode {
  code: string;
  cohort: string | null;
  created_by: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number | null;
}

function getDefaultExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export default function AdminInvitesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);

  // 생성 폼 state
  const [formCode, setFormCode] = useState("");
  const [formCohort, setFormCohort] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState(getDefaultExpiresAt());
  const [formMaxUses, setFormMaxUses] = useState(50);
  const [formLoading, setFormLoading] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    try {
      const result = await getInviteCodes();
      if (result.error) {
        toast.error("초대코드 목록을 불러오는데 실패했습니다.");
      } else {
        setCodes(result.data || []);
      }
    } catch {
      toast.error("초대코드 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleCreate = async () => {
    if (!formCode.trim()) {
      toast.error("초대코드를 입력해주세요.");
      return;
    }

    setFormLoading(true);
    try {
      const result = await createInviteCode({
        code: formCode.trim(),
        cohort: formCohort.trim() || formCode.trim(),
        expiresAt: formExpiresAt,
        maxUses: formMaxUses,
      });

      if (result.error) {
        toast.error(`초대코드 생성에 실패했습니다: ${result.error}`);
      } else {
        toast.success("초대코드가 생성되었습니다.");
        setFormCode("");
        setFormCohort("");
        setFormExpiresAt(getDefaultExpiresAt());
        setFormMaxUses(50);
        await fetchCodes();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`"${code}" 초대코드를 삭제하시겠습니까?`)) return;

    setDeleteLoading(code);
    try {
      const result = await deleteInviteCode(code);
      if (result.error) {
        toast.error("삭제에 실패했습니다.");
      } else {
        toast.success("초대코드가 삭제되었습니다.");
        await fetchCodes();
      }
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("코드가 클립보드에 복사되었습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">초대코드 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          수강생 가입용 초대코드를 생성하고 관리합니다.
        </p>
      </div>

      {/* 생성 폼 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          새 초대코드 생성
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              초대코드
            </label>
            <input
              type="text"
              placeholder="예: BS6-2026"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              기수
            </label>
            <input
              type="text"
              placeholder="예: 6기"
              value={formCohort}
              onChange={(e) => setFormCohort(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              만료일
            </label>
            <input
              type="date"
              value={formExpiresAt}
              onChange={(e) => setFormExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              최대 사용횟수
            </label>
            <input
              type="number"
              min={1}
              value={formMaxUses}
              onChange={(e) => setFormMaxUses(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
            onClick={handleCreate}
            disabled={!formCode.trim() || formLoading}
          >
            {formLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            생성
          </Button>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          생성된 초대코드가 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  코드
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  기수
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  사용량
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  만료일
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  상태
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase text-right">
                  관리
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((invite) => {
                const expired = isExpired(invite.expires_at);
                const maxReached =
                  invite.max_uses != null &&
                  invite.used_count != null &&
                  invite.used_count >= invite.max_uses;
                const isDeleting = deleteLoading === invite.code;

                return (
                  <TableRow
                    key={invite.code}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <TableCell className="font-mono font-medium text-gray-900">
                      {invite.code}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {invite.cohort || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      <span className="font-medium">
                        {invite.used_count ?? 0}
                      </span>
                      <span className="text-gray-400">
                        {" "}
                        / {invite.max_uses ?? "무제한"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(invite.expires_at)}
                    </TableCell>
                    <TableCell>
                      {expired ? (
                        <span className="inline-flex items-center bg-red-100 text-red-700 rounded-full px-3 py-1 text-xs">
                          만료됨
                        </span>
                      ) : maxReached ? (
                        <span className="inline-flex items-center bg-yellow-100 text-yellow-700 rounded-full px-3 py-1 text-xs">
                          소진됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center bg-green-100 text-green-800 rounded-full px-3 py-1 text-xs">
                          활성
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                          onClick={() => handleCopy(invite.code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border border-red-200 text-red-600 hover:bg-red-50 rounded-lg"
                          onClick={() => handleDelete(invite.code)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
