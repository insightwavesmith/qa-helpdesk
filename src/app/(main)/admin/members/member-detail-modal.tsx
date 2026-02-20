"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { updateMember, changeRole, deactivateMember } from "@/actions/admin";
import { toast } from "sonner";

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  active: boolean;
}

interface MemberProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
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
  alumni: { label: "졸업생", className: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-50" },
  admin: { label: "관리자", className: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50" },
};

const roleOptions = ["lead", "member", "student", "alumni", "admin"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function MemberDetailModal({ profile, accounts, onClose, onUpdated }: MemberDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [shopName, setShopName] = useState(profile.shop_name ?? "");
  const [shopUrl, setShopUrl] = useState(profile.shop_url ?? "");
  const [selectedRole, setSelectedRole] = useState(profile.role);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await updateMember(profile.id, {
        name,
        phone,
        shop_name: shopName,
        shop_url: shopUrl,
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
          <div className="flex gap-2">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]?.label || r}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
              onClick={handleChangeRole}
              disabled={roleLoading || selectedRole === profile.role}
            >
              {roleLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              변경
            </Button>
          </div>
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
                <div
                  key={acc.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {acc.account_name || acc.account_id}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{acc.account_id}</p>
                  </div>
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
              ))}
            </div>
          )}
        </div>

        {/* 비활성화 */}
        <div className="border-t border-gray-200 pt-4">
          <Button
            size="sm"
            variant="outline"
            className="border border-red-300 text-red-600 hover:bg-red-50 rounded-lg"
            onClick={handleDeactivate}
            disabled={deactivateLoading || profile.role === "inactive"}
          >
            {deactivateLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            회원 비활성화
          </Button>
        </div>
      </div>
    </div>
  );
}
