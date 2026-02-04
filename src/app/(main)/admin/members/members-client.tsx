"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
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
import { CategoryFilter } from "@/components/shared/CategoryFilter";
import { Pagination } from "@/components/shared/Pagination";
import { approveMember, rejectMember } from "@/actions/admin";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string;
  shop_name: string;
  shop_url: string;
  business_number: string;
  role: string;
  created_at: string;
}

interface MembersClientProps {
  members: Member[];
  currentRole: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

const roleLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "대기", variant: "secondary" },
  approved: { label: "승인", variant: "default" },
  admin: { label: "관리자", variant: "default" },
  rejected: { label: "거절", variant: "destructive" },
};

const roleFilters = [
  { value: "pending", label: "대기" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "거절" },
  { value: "admin", label: "관리자" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function MembersClient({
  members,
  currentRole,
  currentPage,
  totalPages,
  totalCount,
}: MembersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      if ("role" in updates) {
        params.delete("page");
      }
      router.push(`/admin/members?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleApprove = async (userId: string) => {
    setLoadingId(userId);
    try {
      const { error } = await approveMember(userId);
      if (error) {
        toast.error(`승인 실패: ${error}`);
      } else {
        toast.success("회원이 승인되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    setLoadingId(userId);
    try {
      const { error } = await rejectMember(userId);
      if (error) {
        toast.error(`거절 실패: ${error}`);
      } else {
        toast.success("회원이 거절되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <CategoryFilter
        categories={roleFilters}
        currentValue={currentRole}
        onChange={(value) =>
          updateParams({ role: value === "all" ? "" : value })
        }
      />

      <p className="text-sm text-muted-foreground">
        총 {totalCount}명의 회원
      </p>

      {members.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          해당 조건의 회원이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>쇼핑몰</TableHead>
                <TableHead>사업자번호</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const role = roleLabels[member.role] || roleLabels.pending;
                const isLoading = loadingId === member.id;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-sm">{member.email}</TableCell>
                    <TableCell className="text-sm">{member.shop_name}</TableCell>
                    <TableCell className="text-sm font-mono">
                      {member.business_number}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.variant}>{role.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(member.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.role === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprove(member.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                            <span className="ml-1">승인</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(member.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            <span className="ml-1">거절</span>
                          </Button>
                        </div>
                      )}
                      {member.role === "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApprove(member.id)}
                          disabled={isLoading}
                        >
                          재승인
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}
