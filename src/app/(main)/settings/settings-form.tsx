"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Save, Eye, EyeOff, Plus, Trash2, Star, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { syncAdAccount, addAdAccount, removeAdAccount, updateAdAccount } from "@/actions/onboarding";

interface Profile {
  name: string | null;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
  meta_account_id: string | null;
  mixpanel_project_id: string | null;
  mixpanel_board_id: string | null;
  mixpanel_secret_key: string | null;
  annual_revenue: string | null;
}

interface AdAccountRow {
  id: string;
  account_id: string;
  account_name: string | null;
  mixpanel_project_id: string | null;
  mixpanel_board_id: string | null;
  active: boolean | null;
}

const ANNUAL_REVENUE_OPTIONS = [
  { value: "under_1억", label: "1억 미만" },
  { value: "1억_5억", label: "1억~5억" },
  { value: "5억_10억", label: "5억~10억" },
  { value: "10억_50억", label: "10억~50억" },
  { value: "over_50억", label: "50억 이상" },
];

interface SettingsFormProps {
  profile: Profile | null;
  userId: string;
  accounts: AdAccountRow[];
}

export function SettingsForm({ profile, userId, accounts: initialAccounts }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [annualRevenue, setAnnualRevenue] = useState(
    profile?.annual_revenue ?? ""
  );

  // 광고계정 관리 상태
  const [accounts, setAccounts] = useState<AdAccountRow[]>(initialAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newMixpanelProjectId, setNewMixpanelProjectId] = useState("");
  const [newMixpanelBoardId, setNewMixpanelBoardId] = useState("");
  const [newMixpanelSecretKey, setNewMixpanelSecretKey] = useState("");

  // 편집 상태
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editMixpanelProjectId, setEditMixpanelProjectId] = useState("");
  const [editMixpanelBoardId, setEditMixpanelBoardId] = useState("");
  const [editMixpanelSecretKey, setEditMixpanelSecretKey] = useState("");
  const [editingAccount, setEditingAccount] = useState(false);
  const [showEditSecret, setShowEditSecret] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      shop_name: formData.get("shop_name") as string,
      shop_url: formData.get("shop_url") as string,
      meta_account_id: profile?.meta_account_id || null,
      mixpanel_project_id: profile?.mixpanel_project_id || null,
      mixpanel_board_id: profile?.mixpanel_board_id || null,
      mixpanel_secret_key: profile?.mixpanel_secret_key || null,
      annual_revenue: annualRevenue || null,
    };

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    setSaving(false);

    if (error) {
      toast.error("저장에 실패했습니다.");
    } else {
      toast.success("프로필이 저장되었습니다.");
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountId.trim()) {
      toast.error("Meta 계정 ID를 입력하세요.");
      return;
    }

    setAddingAccount(true);
    const result = await addAdAccount({
      metaAccountId: newAccountId.trim(),
      accountName: newAccountName.trim() || undefined,
      mixpanelProjectId: newMixpanelProjectId.trim() || null,
      mixpanelBoardId: newMixpanelBoardId.trim() || null,
      mixpanelSecretKey: newMixpanelSecretKey.trim() || null,
    });

    setAddingAccount(false);

    if (result.error) {
      toast.error(`계정 추가 실패: ${result.error}`);
    } else {
      toast.success("광고계정이 추가되었습니다.");
      // 로컬 상태 업데이트
      setAccounts((prev) => [
        ...prev,
        {
          id: Date.now().toString(), // 임시 ID
          account_id: newAccountId.trim(),
          account_name: newAccountName.trim() || newAccountId.trim(),
          mixpanel_project_id: newMixpanelProjectId.trim() || null,
          mixpanel_board_id: newMixpanelBoardId.trim() || null,
          active: true,
        },
      ]);
      // 폼 초기화
      setNewAccountId("");
      setNewAccountName("");
      setNewMixpanelProjectId("");
      setNewMixpanelBoardId("");
      setNewMixpanelSecretKey("");
      setShowAddForm(false);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    const confirmed = window.confirm(
      `광고계정 ${accountId}를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`
    );
    if (!confirmed) return;

    const result = await removeAdAccount(accountId);
    if (result.error) {
      toast.error(`계정 삭제 실패: ${result.error}`);
    } else {
      toast.success("광고계정이 삭제되었습니다.");
      setAccounts((prev) => prev.filter((a) => a.account_id !== accountId));
      // 대표 계정 재할당은 서버 액션(removeAdAccount)에서 처리
    }
  };

  const handleStartEdit = (acc: AdAccountRow) => {
    setEditingAccountId(acc.account_id);
    setEditAccountName(acc.account_name || "");
    setEditMixpanelProjectId(acc.mixpanel_project_id || "");
    setEditMixpanelBoardId(acc.mixpanel_board_id || "");
    setEditMixpanelSecretKey("");
    setShowEditSecret(false);
  };

  const handleCancelEdit = () => {
    setEditingAccountId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingAccountId) return;

    setEditingAccount(true);
    const result = await updateAdAccount({
      metaAccountId: editingAccountId,
      accountName: editAccountName.trim() || undefined,
      mixpanelProjectId: editMixpanelProjectId.trim() || null,
      mixpanelBoardId: editMixpanelBoardId.trim() || null,
      mixpanelSecretKey: editMixpanelSecretKey.trim() || null,
    });

    setEditingAccount(false);

    if (result.error) {
      toast.error(`저장 실패: ${result.error}`);
    } else {
      toast.success("계정 설정이 저장되었습니다.");
      setAccounts((prev) =>
        prev.map((a) =>
          a.account_id === editingAccountId
            ? {
                ...a,
                account_name: editAccountName.trim() || a.account_name,
                mixpanel_project_id: editMixpanelProjectId.trim() || null,
                mixpanel_board_id: editMixpanelBoardId.trim() || null,
              }
            : a
        )
      );
      setEditingAccountId(null);
    }
  };

  const handleSetPrimary = async (accountId: string) => {
    const account = accounts.find((a) => a.account_id === accountId);
    if (!account) return;

    const result = await syncAdAccount({
      metaAccountId: accountId,
      mixpanelProjectId: account.mixpanel_project_id,
      mixpanelSecretKey: null,
      mixpanelBoardId: account.mixpanel_board_id,
    });

    if (result.error) {
      toast.error("대표 계정 변경 실패");
    } else {
      // profiles.meta_account_id도 업데이트
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({ meta_account_id: accountId })
        .eq("id", userId);
      toast.success("대표 계정이 변경되었습니다.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 text-sm mt-1">
          프로필과 알림 설정을 관리하세요.
        </p>
      </div>

      {/* 프로필 설정 */}
      <form onSubmit={handleSave} autoComplete="off">
        <section className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">프로필</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                name="name"
                defaultValue={profile?.name ?? ""}
                placeholder="이름"
                className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input
                name="phone"
                defaultValue={profile?.phone ?? ""}
                placeholder="010-1234-5678"
                className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 이름</Label>
            <Input
              name="shop_name"
              defaultValue={profile?.shop_name ?? ""}
              placeholder="쇼핑몰 이름"
              className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
            />
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 URL</Label>
            <Input
              name="shop_url"
              defaultValue={profile?.shop_url ?? ""}
              placeholder="https://myshop.com"
              className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
            />
          </div>

          <div className="space-y-2">
            <Label>연매출</Label>
            <Select value={annualRevenue} onValueChange={setAnnualRevenue}>
              <SelectTrigger className="w-full rounded-lg border-gray-200 focus:ring-[#F75D5D]">
                <SelectValue placeholder="연매출 범위를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {ANNUAL_REVENUE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="rounded-lg gap-2 bg-[#F75D5D] hover:bg-[#E54949]"
          >
            <Save className="h-4 w-4" />
            {saving ? "저장 중..." : "저장"}
          </Button>
        </section>
      </form>

      <Separator className="border-gray-200" />

      {/* 광고계정 / 분석 도구 */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">
          광고계정 / 분석 도구
        </h2>

        {/* 등록된 계정 목록 */}
        {accounts.length > 0 && (
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {accounts.map((acc) => {
              const isPrimary = acc.account_id === profile?.meta_account_id;
              const isEditing = editingAccountId === acc.account_id;

              if (isEditing) {
                return (
                  <div key={acc.account_id} className="px-4 py-4 space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-gray-700">
                        {acc.account_id} 편집
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Meta 계정 ID</Label>
                      <Input
                        value={acc.account_id}
                        disabled
                        className="h-8 text-sm rounded-lg border-gray-200 bg-gray-100 text-gray-500 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">계정 이름</Label>
                        <Input
                          value={editAccountName}
                          onChange={(e) => setEditAccountName(e.target.value)}
                          placeholder="계정 이름"
                          autoComplete="off"
                          className="h-8 text-sm rounded-lg border-gray-200 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">믹스패널 프로젝트 ID</Label>
                        <Input
                          value={editMixpanelProjectId}
                          onChange={(e) => setEditMixpanelProjectId(e.target.value)}
                          placeholder="프로젝트 ID"
                          autoComplete="off"
                          className="h-8 text-sm rounded-lg border-gray-200 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">믹스패널 보드 ID</Label>
                        <Input
                          value={editMixpanelBoardId}
                          onChange={(e) => setEditMixpanelBoardId(e.target.value)}
                          placeholder="보드 ID"
                          autoComplete="off"
                          className="h-8 text-sm rounded-lg border-gray-200 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">믹스패널 시크릿키</Label>
                        <div className="relative">
                          <Input
                            type={showEditSecret ? "text" : "password"}
                            value={editMixpanelSecretKey}
                            onChange={(e) => setEditMixpanelSecretKey(e.target.value)}
                            placeholder="변경 시에만 입력"
                            autoComplete="new-password"
                            className="h-8 text-sm rounded-lg border-gray-200 bg-white pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditSecret(!showEditSecret)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showEditSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={editingAccount}
                        className="gap-1 bg-[#F75D5D] hover:bg-[#E54949]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {editingAccount ? "저장 중..." : "저장"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="border-gray-200"
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={acc.account_id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gray-700">
                      {acc.account_id}
                    </span>
                    <span className="text-sm text-gray-500">
                      {acc.account_name || ""}
                    </span>
                    {isPrimary && (
                      <span className="flex items-center gap-1 rounded-full bg-[#F75D5D]/10 px-2 py-0.5 text-xs font-medium text-[#F75D5D]">
                        <Star className="h-3 w-3" />
                        대표
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(acc)}
                      className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
                      title="편집"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(acc.account_id)}
                        className="text-xs text-gray-400 hover:text-[#F75D5D] transition-colors"
                        title="대표 계정으로 설정"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveAccount(acc.account_id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      title="계정 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {accounts.length === 0 && (
          <p className="text-sm text-gray-400">등록된 광고계정이 없습니다.</p>
        )}

        {/* 추가 버튼 / 추가 폼 */}
        {!showAddForm ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="gap-2 border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            광고계정 추가
          </Button>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Meta 계정 ID</Label>
                <Input
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  placeholder="예: 123456789012345"
                  className="rounded-lg border-gray-200 bg-white focus:ring-[#F75D5D]"
                />
              </div>
              <div className="space-y-2">
                <Label>계정 이름 (선택)</Label>
                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="예: 유비드"
                  className="rounded-lg border-gray-200 bg-white focus:ring-[#F75D5D]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>믹스패널 프로젝트 ID</Label>
                <Input
                  value={newMixpanelProjectId}
                  onChange={(e) => setNewMixpanelProjectId(e.target.value)}
                  placeholder="프로젝트 ID"
                  autoComplete="off"
                  className="rounded-lg border-gray-200 bg-white focus:ring-[#F75D5D]"
                />
              </div>
              <div className="space-y-2">
                <Label>믹스패널 보드 ID</Label>
                <Input
                  value={newMixpanelBoardId}
                  onChange={(e) => setNewMixpanelBoardId(e.target.value)}
                  placeholder="보드 ID"
                  autoComplete="off"
                  className="rounded-lg border-gray-200 bg-white focus:ring-[#F75D5D]"
                />
              </div>
              <div className="space-y-2">
                <Label>믹스패널 시크릿키</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={newMixpanelSecretKey}
                    onChange={(e) => setNewMixpanelSecretKey(e.target.value)}
                    placeholder="시크릿키"
                    autoComplete="new-password"
                    className="rounded-lg border-gray-200 bg-white focus:ring-[#F75D5D] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleAddAccount}
                disabled={addingAccount}
                className="gap-2 bg-[#F75D5D] hover:bg-[#E54949]"
              >
                <Plus className="h-4 w-4" />
                {addingAccount ? "추가 중..." : "추가"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
                className="border-gray-200"
              >
                취소
              </Button>
            </div>
          </div>
        )}
      </section>

      <Separator className="border-gray-200" />

      {/* 알림 설정 */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">알림 설정</h2>

        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-gray-200 border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
            <Bell className="h-6 w-6 text-gray-500" />
          </div>
          <p className="text-gray-500 text-sm">
            알림 설정은 준비 중입니다.
          </p>
          <p className="text-xs text-gray-500 mt-1 opacity-70">
            곧 이메일/슬랙 알림 설정을 지원할 예정입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
