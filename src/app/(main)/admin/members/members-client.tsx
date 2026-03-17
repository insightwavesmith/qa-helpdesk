"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { mp } from "@/lib/mixpanel";
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
import { approveMember, getMemberDetail, updateMember } from "@/actions/admin";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, CheckCircle, ExternalLink, Loader2, Mail, Users, X } from "lucide-react";
import { MemberDetailModal } from "./member-detail-modal";
import { SubscriberTab } from "@/components/admin/SubscriberTab";

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
  business_number: string | null;
  cohort: string | null;
  meta_account_id: string | null;
  mixpanel_project_id: string | null;
  mixpanel_board_id: string | null;
  mixpanel_secret_key: string | null;
  role: string;
  created_at: string | null;
  ad_account_id?: string | null;
}

interface MembersClientProps {
  members: Member[];
  currentRole: string;
  currentCohort: string;
  cohortList: string[];
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
  assistant: { label: "조교", variant: "default", className: "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-50" },
  admin: { label: "관리자", variant: "default", className: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50" },
};

const roleFilters = [
  { value: "lead", label: "리드" },
  { value: "member", label: "멤버" },
  { value: "student", label: "수강생" },
  { value: "assistant", label: "조교" },
  { value: "admin", label: "관리자" },
];

const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function MembersClient({
  members,
  currentRole,
  currentCohort,
  cohortList,
  currentPage,
  totalPages,
  totalCount,
  subscriberCount,
  currentTab = "members",
}: MembersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<{ profile: Member; accounts: Array<{ id: string; account_id: string; account_name: string | null; mixpanel_project_id: string | null; mixpanel_board_id: string | null; active: boolean | null }> } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    mp.track("admin_member_list_viewed");
  }, []);
  // 수강생 전환 모달
  const [studentModal, setStudentModal] = useState<{ userId: string; name: string } | null>(null);
  const [studentForm, setStudentForm] = useState({ cohort: "", metaAccountId: "", mixpanelProjectId: "", mixpanelSecretKey: "", mixpanelBoardId: "" });

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

  const handleSavePhone = async (memberId: string) => {
    if (editingPhoneValue && !PHONE_REGEX.test(editingPhoneValue)) {
      toast.error("올바른 전화번호 형식이 아닙니다 (예: 010-1234-5678)");
      return;
    }
    setPhoneSaving(true);
    try {
      const { error } = await updateMember(memberId, { phone: editingPhoneValue || null });
      if (error) {
        toast.error(`저장 실패: ${error}`);
      } else {
        toast.success("전화번호가 저장되었습니다.");
        setEditingPhoneId(null);
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setPhoneSaving(false);
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
      if ("role" in updates || "cohort" in updates) {
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

  // 수강생 전환: 모달로 기수+광고계정+믹스패널 입력
  const handleOpenStudentModal = (userId: string, name: string) => {
    setStudentForm({ cohort: "", metaAccountId: "", mixpanelProjectId: "", mixpanelSecretKey: "", mixpanelBoardId: "" });
    setStudentModal({ userId, name });
  };

  const handleStudentConvert = async () => {
    if (!studentModal) return;
    const { cohort, metaAccountId, mixpanelProjectId, mixpanelSecretKey, mixpanelBoardId } = studentForm;
    if (!cohort || !metaAccountId || !mixpanelProjectId || !mixpanelSecretKey) {
      toast.error("필수 필드를 입력해주세요.");
      return;
    }
    setLoadingId(studentModal.userId);
    try {
      const { error } = await approveMember(studentModal.userId, "student", {
        cohort,
        meta_account_id: metaAccountId,
        mixpanel_project_id: mixpanelProjectId,
        mixpanel_secret_key: mixpanelSecretKey,
        mixpanel_board_id: mixpanelBoardId || undefined,
      });
      if (error) {
        toast.error(`전환 실패: ${error}`);
      } else {
        toast.success("회원이 수강생으로 전환되었습니다.");
        setStudentModal(null);
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
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <CategoryFilter
            categories={roleFilters}
            currentValue={currentRole}
            onChange={(value) =>
              updateParams({ role: value === "all" ? "" : value })
            }
          />
          {cohortList.length > 0 && (
            <Select
              value={currentCohort || "all"}
              onValueChange={(value) =>
                updateParams({ cohort: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="기수 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기수</SelectItem>
                {cohortList.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          총 {totalCount}명의 회원
        </p>

        {members.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            해당 조건의 회원이 없습니다.
          </div>
        ) : (
          <>
            {/* 데스크탑 테이블 */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">이름</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">이메일</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">전화번호</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">쇼핑몰</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">기수</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">상태</TableHead>
                    <TableHead className="text-xs font-medium text-gray-500 uppercase">광고관리자</TableHead>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {editingPhoneId === member.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingPhoneValue}
                                onChange={(e) => setEditingPhoneValue(formatPhone(e.target.value))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSavePhone(member.id);
                                  if (e.key === "Escape") setEditingPhoneId(null);
                                }}
                                placeholder="010-1234-5678"
                                autoFocus
                                className="w-[130px] rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                              />
                              <button
                                onClick={() => handleSavePhone(member.id)}
                                disabled={phoneSaving}
                                className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                              >
                                {phoneSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => setEditingPhoneId(null)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="text-sm text-gray-600 hover:text-[#F75D5D] hover:underline transition-colors"
                              onClick={() => {
                                setEditingPhoneId(member.id);
                                setEditingPhoneValue(member.phone || "");
                              }}
                            >
                              {member.phone || <span className="text-gray-400">-</span>}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{member.shop_name}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {member.cohort || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={role.variant} className={role.className}>{role.label}</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {member.ad_account_id ? (
                            <a
                              href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${member.ad_account_id.replace("act_", "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              광고관리자
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
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
                                onClick={() => handleOpenStudentModal(member.id, member.name)}
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
                              onClick={() => handleOpenStudentModal(member.id, member.name)}
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

            {/* 모바일 카드 리스트 */}
            <div className="md:hidden space-y-3">
              {members.map((member) => {
                const role = roleLabels[member.role] || roleLabels.lead;
                const isLoading = loadingId === member.id;
                return (
                  <div
                    key={member.id}
                    className="bg-white rounded-lg border border-gray-200 p-3 space-y-2"
                    onClick={() => handleOpenDetail(member.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {detailLoading === member.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                        <span className="font-medium text-gray-900">{member.name}</span>
                      </div>
                      <Badge variant={role.variant} className={role.className}>{role.label}</Badge>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      <div>{member.email}</div>
                      {member.shop_name && <div>{member.shop_name}</div>}
                      <div className="flex items-center gap-3">
                        {member.cohort && <span>{member.cohort}</span>}
                        <span>{formatDate(member.created_at)}</span>
                      </div>
                    </div>
                    {member.role === "lead" && (
                      <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg text-xs flex-1" onClick={() => handleApprove(member.id)} disabled={isLoading}>
                          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          <span className="ml-1">멤버 승인</span>
                        </Button>
                        <Button size="sm" variant="secondary" className="rounded-lg text-xs flex-1" onClick={() => handleOpenStudentModal(member.id, member.name)} disabled={isLoading}>
                          수강생 승인
                        </Button>
                      </div>
                    )}
                    {member.role === "member" && (
                      <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => handleOpenStudentModal(member.id, member.name)} disabled={isLoading}>
                          수강생 전환
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
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

        {/* 수강생 전환 모달 */}
        {studentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setStudentModal(null)} />
            <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-bold text-gray-900 mb-1">수강생 전환</h2>
              <p className="text-sm text-gray-500 mb-4">{studentModal.name}님을 수강생으로 전환합니다.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기수 *</label>
                  <input
                    type="text"
                    placeholder="예: 1기"
                    value={studentForm.cohort}
                    onChange={(e) => setStudentForm((p) => ({ ...p, cohort: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meta 광고계정 ID *</label>
                  <input
                    type="text"
                    placeholder="act_123456789"
                    value={studentForm.metaAccountId}
                    onChange={(e) => setStudentForm((p) => ({ ...p, metaAccountId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">믹스패널 프로젝트 ID *</label>
                  <input
                    type="text"
                    placeholder="프로젝트 ID"
                    value={studentForm.mixpanelProjectId}
                    onChange={(e) => setStudentForm((p) => ({ ...p, mixpanelProjectId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">믹스패널 시크릿키 *</label>
                  <input
                    type="text"
                    placeholder="시크릿키"
                    value={studentForm.mixpanelSecretKey}
                    onChange={(e) => setStudentForm((p) => ({ ...p, mixpanelSecretKey: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">믹스패널 보드 ID</label>
                  <input
                    type="text"
                    placeholder="보드 ID (선택)"
                    value={studentForm.mixpanelBoardId}
                    onChange={(e) => setStudentForm((p) => ({ ...p, mixpanelBoardId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setStudentModal(null)}>
                  취소
                </Button>
                <Button
                  size="sm"
                  className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                  onClick={handleStudentConvert}
                  disabled={
                    loadingId === studentModal.userId ||
                    !studentForm.cohort ||
                    !studentForm.metaAccountId ||
                    !studentForm.mixpanelProjectId ||
                    !studentForm.mixpanelSecretKey
                  }
                >
                  {loadingId === studentModal.userId && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  수강생으로 전환
                </Button>
              </div>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="subscribers" className="mt-4">
        <SubscriberTab />
      </TabsContent>
    </Tabs>
  );
}
