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
import { approveMember, getMemberDetail } from "@/actions/admin";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Loader2, Mail, Users } from "lucide-react";
import { MemberDetailModal } from "./member-detail-modal";
import { SubscriberTab } from "@/components/admin/SubscriberTab";

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
  subscriberCount?: number;
  currentTab?: string;
}

const roleLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className: string }
> = {
  lead: { label: "리드", variant: "secondary", className: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50" },
  member: { label: "멤버", variant: "default", className: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50" },
  student: { label: "수강생", variant: "default", className: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50" },
  alumni: { label: "졸업생", variant: "outline", className: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-50" },
  admin: { label: "관리자", variant: "default", className: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50" },
};

const roleFilters = [
  { value: "lead", label: "리드" },
  { value: "member", label: "멤버" },
  { value: "student", label: "수강생" },
  { value: "alumni", label: "졸업생" },
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
  subscriberCount,
  currentTab = "members",
}: MembersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<{ profile: Member; accounts: Array<{ id: string; account_id: string; account_name: string | null; active: boolean }> } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const handleOpenDetail = async (memberId: string) => {
    setDetailLoading(memberId);
    try {
      const { profile, accounts } = await getMemberDetail(memberId);
      if (profile) {
        setDetailModal({ profile: profile as Member, accounts });
      }
    } catch {
      toast.error("상세 정보를 불러오는데 실패했습니다.");
    } finally {
      setDetailLoading(null);
    }
  };

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
        toast.success("회원이 멤버로 승인되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  // 특정 역할로 승인/전환
  const handleApproveAs = async (userId: string, role: "member" | "student") => {
    setLoadingId(userId);
    try {
      const { error } = await approveMember(userId, role);
      if (error) {
        toast.error(`전환 실패: ${error}`);
      } else {
        const roleLabel = role === "student" ? "수강생" : "멤버";
        toast.success(`회원이 ${roleLabel}으로 전환되었습니다.`);
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams();
    if (tab !== "members") params.set("tab", tab);
    router.push(`/admin/members${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="members" className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          회원
        </TabsTrigger>
        <TabsTrigger value="subscribers" className="gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          구독자{typeof subscriberCount === "number" ? ` (${subscriberCount})` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="members" className="mt-4 space-y-4">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">이름</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">이메일</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">쇼핑몰</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">사업자번호</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">상태</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">가입일</TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const role = roleLabels[member.role] || roleLabels.lead;
                  const isLoading = loadingId === member.id;

                  return (
                    <TableRow
                      key={member.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => handleOpenDetail(member.id)}
                    >
                      <TableCell className="font-medium text-gray-900">
                        <span className="flex items-center gap-1">
                          {detailLoading === member.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                          {member.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{member.email}</TableCell>
                      <TableCell className="text-sm text-gray-600">{member.shop_name}</TableCell>
                      <TableCell className="text-sm font-mono text-gray-600">
                        {member.business_number}
                      </TableCell>
                      <TableCell>
                        <Badge variant={role.variant} className={role.className}>{role.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(member.created_at)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {/* lead: 멤버 승인 또는 수강생 승인 */}
                        {member.role === "lead" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                              onClick={() => handleApprove(member.id)}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              <span className="ml-1">멤버 승인</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-lg"
                              onClick={() => handleApproveAs(member.id, "student")}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              <span className="ml-1">수강생 승인</span>
                            </Button>
                          </div>
                        )}
                        {/* member → student 승격 */}
                        {member.role === "member" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg"
                            onClick={() => handleApproveAs(member.id, "student")}
                            disabled={isLoading}
                          >
                            수강생 전환
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

        {detailModal && (
          <MemberDetailModal
            profile={detailModal.profile}
            accounts={detailModal.accounts}
            onClose={() => setDetailModal(null)}
            onUpdated={() => {
              setDetailModal(null);
              router.refresh();
            }}
          />
        )}
      </TabsContent>

      <TabsContent value="subscribers" className="mt-4">
        <SubscriberTab />
      </TabsContent>
    </Tabs>
  );
}
