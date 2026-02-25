"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, X } from "lucide-react";
import { updateMember, changeRole, deactivateMember, deleteMember, updateAdAccount } from "@/actions/admin";
import { toast } from "sonner";

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  mixpanel_project_id: string | null;
  mixpanel_board_id: string | null;
  active: boolean;
}

interface MemberProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
  cohort: string | null;
  meta_account_id: string | null;
  mixpanel_project_id: string | null;
  mixpanel_board_id: string | null;
  mixpanel_secret_key: string | null;
  role: string;
  created_at: string;
}

interface MemberDetailModalProps {
  profile: MemberProfile;
  accounts: AdAccount[];
  onClose: () => void;
  onUpdated: () => void;
}

const roleLabels: Record<string, { label: string; className: string }> = {
  lead: { label: "리드", className: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50" },
  member: { label: "멤버", className: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50" },
  student: { label: "수강생", className: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50" },
  assistant: { label: "조교", className: "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-50" },
  admin: { label: "관리자", className: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50" },
};

const roleOptions = ["lead", "member", "student", "assistant", "admin"];

const roleDescriptions: Record<string, string> = {
  lead: "",
  member: "",
  student: "강의 시청, Q&A 질문, 정보공유 열람",
  assistant: "수강생 기능 + 콘텐츠 관리, Q&A 답변 관리",
  admin: "전체 권한",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function MemberDetailModal({ profile, accounts, onClose, onUpdated }: MemberDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ account_name: "", mixpanel_project_id: "", mixpanel_board_id: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [shopName, setShopName] = useState(profile.shop_name ?? "");
  const [shopUrl, setShopUrl] = useState(profile.shop_url ?? "");
  const [cohort, setCohort] = useState(profile.cohort ?? "");
  const [metaAccountId, setMetaAccountId] = useState(profile.meta_account_id ?? "");
  const [mixpanelProjectId, setMixpanelProjectId] = useState(profile.mixpanel_project_id ?? "");
  const [mixpanelBoardId, setMixpanelBoardId] = useState(profile.mixpanel_board_id ?? "");
  const [selectedRole, setSelectedRole] = useState(profile.role);

  const handleEditAccount = (acc: AdAccount) => {
    setEditingAccountId(acc.id);
    setAccountForm({
      account_name: acc.account_name ?? "",
      mixpanel_project_id: acc.mixpanel_project_id ?? "",
      mixpanel_board_id: acc.mixpanel_board_id ?? "",
    });
  };

  const handleSaveAccount = async () => {
    if (!editingAccountId) return;
    setAccountSaving(true);
    try {
      const { error } = await updateAdAccount(editingAccountId, {
        account_name: accountForm.account_name || undefined,
        mixpanel_project_id: accountForm.mixpanel_project_id || undefined,
        mixpanel_board_id: accountForm.mixpanel_board_id || undefined,
      });
      if (error) {
        toast.error(`저장 실패: ${error}`);
      } else {
        toast.success("광고계정이 수정되었습니다.");
        setEditingAccountId(null);
        onUpdated();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setAccountSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await updateMember(profile.id, {
        name,
        phone,
        shop_name: shopName,
        shop_url: shopUrl,
        cohort: cohort || null,
        meta_account_id: metaAccountId || null,
        mixpanel_project_id: mixpanelProjectId || null,
        mixpanel_board_id: mixpanelBoardId || null,
      });
      if (error) {
        toast.error(`수정 실패: ${error}`);
      } else {
        toast.success("프로필이 수정되었습니다.");
        setEditing(false);
        onUpdated();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async () => {
    if (selectedRole === profile.role) return;
    const targetLabel = roleLabels[selectedRole]?.label || selectedRole;
    if (!confirm(`${profile.name}님을 ${targetLabel}(으)로 변경하시겠습니까?`)) return;
    setRoleLoading(true);
    try {
      const { error } = await changeRole(profile.id, selectedRole);
      if (error) {
        toast.error(`역할 변경 실패: ${error}`);
      } else {
        toast.success("역할이 변경되었습니다.");
        onUpdated();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setRoleLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("정말 이 회원을 비활성화하시겠습니까?")) return;
    setDeactivateLoading(true);
    try {
      const { error } = await deactivateMember(profile.id);
      if (error) {
        toast.error(`비활성화 실패: ${error}`);
      } else {
        toast.success("회원이 비활성화되었습니다.");
        onUpdated();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 이 회원을 삭제하시겠습니까?\n계정과 프로필이 영구적으로 삭제됩니다.")) return;
    setDeleteLoading(true);
    try {
      const { error } = await deleteMember(profile.id);
      if (error) {
        toast.error(`삭제 실패: ${error}`);
      } else {
        toast.success("회원이 삭제되었습니다.");
        onUpdated();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const canDelete = profile.role === "lead" || profile.role === "member";
  const role = roleLabels[profile.role] || roleLabels.lead;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-4">회원 상세</h2>

        {/* 프로필 정보 */}
        <div className="space-y-3 mb-6">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">쇼핑몰명</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">쇼핑몰 URL</label>
                <input
                  type="text"
                  value={shopUrl}
                  onChange={(e) => setShopUrl(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">기수</label>
                <input
                  type="text"
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  placeholder="예: 피드백반 1기"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메타 광고계정 ID</label>
                <input
                  type="text"
                  value={metaAccountId}
                  onChange={(e) => setMetaAccountId(e.target.value)}
                  placeholder="예: 123456789012345"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">믹스패널 프로젝트 ID</label>
                <input
                  type="text"
                  value={mixpanelProjectId}
                  onChange={(e) => setMixpanelProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">믹스패널 보드 ID</label>
                <input
                  type="text"
                  value={mixpanelBoardId}
                  onChange={(e) => setMixpanelBoardId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                  onClick={() => {
                    setEditing(false);
                    setName(profile.name);
                    setPhone(profile.phone ?? "");
                    setShopName(profile.shop_name ?? "");
                    setShopUrl(profile.shop_url ?? "");
                    setCohort(profile.cohort ?? "");
                    setMetaAccountId(profile.meta_account_id ?? "");
                    setMixpanelProjectId(profile.mixpanel_project_id ?? "");
                    setMixpanelBoardId(profile.mixpanel_board_id ?? "");
                  }}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">이름</p>
                  <p className="text-sm font-medium text-gray-900">{profile.name}</p>
                </div>
                <Badge variant="secondary" className={role.className}>{role.label}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">이메일</p>
                <p className="text-sm font-medium text-gray-900">{profile.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">전화번호</p>
                <p className="text-sm font-medium text-gray-900">{profile.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">쇼핑몰</p>
                <p className="text-sm font-medium text-gray-900">{profile.shop_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">쇼핑몰 URL</p>
                <p className="text-sm font-medium text-gray-900">{profile.shop_url || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">기수</p>
                <p className="text-sm font-medium text-gray-900">{profile.cohort || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">메타 광고계정 ID <span className="text-gray-400">(레거시)</span></p>
                <p className="text-sm font-medium text-gray-900 font-mono">{profile.meta_account_id || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">믹스패널 프로젝트 ID</p>
                <p className="text-sm font-medium text-gray-900 font-mono">{profile.mixpanel_project_id || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">믹스패널 보드 ID</p>
                <p className="text-sm font-medium text-gray-900 font-mono">{profile.mixpanel_board_id || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">믹스패널 시크릿키</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 font-mono">
                    {profile.mixpanel_secret_key
                      ? showSecretKey
                        ? profile.mixpanel_secret_key
                        : "••••••••"
                      : "-"}
                  </p>
                  {profile.mixpanel_secret_key && (
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="text-xs text-[#F75D5D] hover:underline"
                    >
                      {showSecretKey ? "숨기기" : "보기"}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">가입일</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(profile.created_at)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                onClick={() => setEditing(true)}
              >
                프로필 수정
              </Button>
            </>
          )}
        </div>

        {/* 역할 변경 */}
        <div className="border-t border-gray-200 pt-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">역할 변경</label>
          <div className="space-y-2">
            {roleOptions.map((r) => {
              const info = roleLabels[r];
              const desc = roleDescriptions[r];
              const isSelected = selectedRole === r;
              const isCurrent = profile.role === r;
              return (
                <label
                  key={r}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? "border-[#F75D5D] bg-red-50/50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={isSelected}
                    onChange={() => setSelectedRole(r)}
                    className="mt-0.5 accent-[#F75D5D]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{info?.label || r}</span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">현재</span>
                      )}
                    </div>
                    {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
                  </div>
                </label>
              );
            })}
          </div>
          <Button
            size="sm"
            className="mt-3 w-full bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
            onClick={handleChangeRole}
            disabled={roleLoading || selectedRole === profile.role}
          >
            {roleLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            변경
          </Button>
        </div>

        {/* 배정된 광고계정 */}
        <div className="border-t border-gray-200 pt-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            배정된 광고계정 ({accounts.length})
          </h3>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-400">배정된 광고계정이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-gray-50 rounded-lg px-3 py-2">
                  {editingAccountId === acc.id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-mono mb-1">{acc.account_id}</p>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">계정명</label>
                        <input
                          type="text"
                          value={accountForm.account_name}
                          onChange={(e) => setAccountForm((p) => ({ ...p, account_name: e.target.value }))}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">믹스패널 프로젝트 ID</label>
                        <input
                          type="text"
                          value={accountForm.mixpanel_project_id}
                          onChange={(e) => setAccountForm((p) => ({ ...p, mixpanel_project_id: e.target.value }))}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">믹스패널 보드 ID</label>
                        <input
                          type="text"
                          value={accountForm.mixpanel_board_id}
                          onChange={(e) => setAccountForm((p) => ({ ...p, mixpanel_board_id: e.target.value }))}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs rounded" onClick={() => setEditingAccountId(null)}>
                          취소
                        </Button>
                        <Button size="sm" className="h-7 text-xs rounded bg-[#F75D5D] hover:bg-[#E54949] text-white" onClick={handleSaveAccount} disabled={accountSaving}>
                          {accountSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                          저장
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {acc.account_name || acc.account_id}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{acc.account_id}</p>
                        {acc.mixpanel_project_id && (
                          <p className="text-xs text-gray-400 mt-0.5">프로젝트: {acc.mixpanel_project_id}</p>
                        )}
                        {acc.mixpanel_board_id && (
                          <p className="text-xs text-gray-400">보드: {acc.mixpanel_board_id}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditAccount(acc)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            acc.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {acc.active ? "활성" : "비활성"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 비활성화 / 삭제 */}
        <div className="border-t border-gray-200 pt-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border border-red-300 text-red-600 hover:bg-red-50 rounded-lg"
            onClick={handleDeactivate}
            disabled={deactivateLoading || profile.role === "inactive"}
          >
            {deactivateLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            비활성화
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border border-red-500 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
            onClick={handleDelete}
            disabled={deleteLoading || !canDelete}
          >
            {deleteLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            회원 삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
