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
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addAdAccount, updateAdAccount, toggleAdAccount } from "@/actions/admin";

interface AssignedUser {
  name: string;
  email: string;
}

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  user_id: string | null;
  active: boolean;
  created_at: string;
  assigned_user: AssignedUser | null;
  mixpanel_project_id?: string | null;
  mixpanel_board_id?: string | null;
}

interface Student {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function AccountsClient() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalAccount, setModalAccount] = useState<AdAccount | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAccountId, setAddAccountId] = useState("");
  const [addAccountName, setAddAccountName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [editAccount, setEditAccount] = useState<AdAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editMixpanelProjectId, setEditMixpanelProjectId] = useState("");
  const [editMixpanelBoardId, setEditMixpanelBoardId] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accounts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAccounts(data.accounts);
      setStudents(data.students);
    } catch {
      toast.error("계정 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssign = async () => {
    if (!modalAccount || !selectedUserId) return;
    setActionLoading(modalAccount.id);
    try {
      const res = await fetch("/api/admin/accounts/assign", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: modalAccount.id,
          userId: selectedUserId,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      toast.success("계정이 배정되었습니다.");
      setModalAccount(null);
      setSelectedUserId("");
      await fetchData();
    } catch {
      toast.error("배정에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnassign = async (account: AdAccount) => {
    if (!confirm(`${account.account_name || account.account_id} 계정의 배정을 해제하시겠습니까?`)) return;
    setActionLoading(account.id);
    try {
      const res = await fetch("/api/admin/accounts/assign", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, userId: null }),
      });
      if (!res.ok) throw new Error("Failed to unassign");
      toast.success("배정이 해제되었습니다.");
      await fetchData();
    } catch {
      toast.error("해제에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddAccount = async () => {
    if (!addAccountId || !addAccountName) return;
    setAddLoading(true);
    try {
      const { error } = await addAdAccount({ accountId: addAccountId, accountName: addAccountName });
      if (error) {
        toast.error(`추가 실패: ${error}`);
      } else {
        toast.success("계정이 추가되었습니다.");
        setShowAddModal(false);
        setAddAccountId("");
        setAddAccountName("");
        await fetchData();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditAccount = async () => {
    if (!editAccount) return;
    setEditLoading(true);
    try {
      const { error } = await updateAdAccount(editAccount.id, {
        account_name: editName,
        mixpanel_project_id: editMixpanelProjectId || undefined,
        mixpanel_board_id: editMixpanelBoardId || undefined,
      });
      if (error) {
        toast.error(`수정 실패: ${error}`);
      } else {
        toast.success("계정이 수정되었습니다.");
        setEditAccount(null);
        await fetchData();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleActive = async (account: AdAccount) => {
    setToggleLoading(account.id);
    try {
      const { error } = await toggleAdAccount(account.id, !account.active);
      if (error) {
        toast.error(`상태 변경 실패: ${error}`);
      } else {
        toast.success(account.active ? "비활성화되었습니다." : "활성화되었습니다.");
        await fetchData();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setToggleLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          총 {accounts.length}개 계정 · 배정됨{" "}
          {accounts.filter((a) => a.user_id).length}개
        </p>
        <Button
          size="sm"
          className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          계정 추가
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          등록된 광고계정이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  계정명
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  계정 ID
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  배정된 수강생
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
              {accounts.map((account) => {
                const isLoading = actionLoading === account.id;
                return (
                  <TableRow
                    key={account.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <TableCell className="font-medium text-gray-900">
                      <button
                        className="hover:text-[#F75D5D] hover:underline transition-colors text-left"
                        onClick={() => {
                          setEditAccount(account);
                          setEditName(account.account_name || "");
                          setEditMixpanelProjectId(account.mixpanel_project_id || "");
                          setEditMixpanelBoardId(account.mixpanel_board_id || "");
                        }}
                      >
                        {account.account_name || "-"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-gray-600">
                      {account.account_id}
                    </TableCell>
                    <TableCell>
                      {account.assigned_user ? (
                        <span className="inline-flex items-center bg-green-100 text-green-800 rounded-full px-3 py-1 text-xs">
                          {account.assigned_user.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center bg-gray-100 text-gray-500 rounded-full px-3 py-1 text-xs">
                          미배정
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(account)}
                        disabled={toggleLoading === account.id}
                        className="cursor-pointer"
                      >
                        {toggleLoading === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : account.active ? (
                          <span className="inline-flex items-center bg-green-100 text-green-800 rounded-full px-3 py-1 text-xs hover:bg-green-200 transition-colors">
                            활성
                          </span>
                        ) : (
                          <span className="inline-flex items-center bg-gray-100 text-gray-500 rounded-full px-3 py-1 text-xs hover:bg-gray-200 transition-colors">
                            비활성
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {account.user_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                            onClick={() => handleUnassign(account)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "해제"
                            )}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                          onClick={() => {
                            setModalAccount(account);
                            setSelectedUserId(account.user_id || "");
                          }}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "배정"
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

      {/* 계정 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md mx-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-4">계정 추가</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  계정 ID
                </label>
                <input
                  type="text"
                  placeholder="act_xxx"
                  value={addAccountId}
                  onChange={(e) => setAddAccountId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  계정명
                </label>
                <input
                  type="text"
                  value={addAccountName}
                  onChange={(e) => setAddAccountName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                onClick={() => {
                  setShowAddModal(false);
                  setAddAccountId("");
                  setAddAccountName("");
                }}
              >
                취소
              </Button>
              <Button
                className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                onClick={handleAddAccount}
                disabled={!addAccountId || !addAccountName || addLoading}
              >
                {addLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                추가
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 수정 모달 */}
      {editAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditAccount(null)} />
          <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md mx-4">
            <button
              onClick={() => setEditAccount(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-1">계정 수정</h2>
            <p className="text-sm text-gray-500 mb-4 font-mono">{editAccount.account_id}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  계정명
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mixpanel Project ID
                </label>
                <input
                  type="text"
                  value={editMixpanelProjectId}
                  onChange={(e) => setEditMixpanelProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mixpanel Board ID
                </label>
                <input
                  type="text"
                  value={editMixpanelBoardId}
                  onChange={(e) => setEditMixpanelBoardId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                onClick={() => setEditAccount(null)}
              >
                취소
              </Button>
              <Button
                className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                onClick={handleEditAccount}
                disabled={editLoading}
              >
                {editLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 배정 모달 */}
      {modalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => {
              setModalAccount(null);
              setSelectedUserId("");
            }}
          />
          <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <button
              onClick={() => {
                setModalAccount(null);
                setSelectedUserId("");
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-1">
              광고계정 배정
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {modalAccount.account_name || modalAccount.account_id} 계정에
              수강생을 배정합니다.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              수강생 선택
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent"
            >
              <option value="">선택하세요</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                onClick={() => {
                  setModalAccount(null);
                  setSelectedUserId("");
                }}
              >
                취소
              </Button>
              <Button
                className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
                onClick={handleAssign}
                disabled={!selectedUserId || actionLoading === modalAccount.id}
              >
                {actionLoading === modalAccount.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                확인
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
