"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 광고계정 타입
export interface AdAccount {
  id: string;
  account_id: string;
  account_name: string;
  user_id: string;
  created_at: string;
  mixpanel_project_id?: string | null;
  mixpanel_board_id?: string | null;
}

interface AccountSelectorProps {
  accounts: AdAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  isLoading?: boolean;
}

// 계정 선택 드롭다운
export function AccountSelector({
  accounts,
  selectedAccountId,
  onSelect,
  isLoading,
}: AccountSelectorProps) {
  if (isLoading) {
    return (
      <div className="h-9 w-[260px] animate-pulse rounded-md bg-muted" />
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        연결된 광고계정이 없습니다.
      </p>
    );
  }

  return (
    <Select
      value={selectedAccountId ?? undefined}
      onValueChange={onSelect}
    >
      <SelectTrigger className="w-[260px]">
        <SelectValue placeholder="광고계정을 선택하세요" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => (
          <SelectItem key={acc.id} value={acc.account_id}>
            {acc.account_name || acc.account_id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
