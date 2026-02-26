"use client";

import { Compass, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdAccount } from "@/app/(main)/protractor/components/account-selector";

interface ProtractorHeaderProps {
  accounts: AdAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  isLoading?: boolean;
  dateRange?: { start: string; end: string };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function ProtractorHeader({
  accounts,
  selectedAccountId,
  onSelect,
  isLoading,
  dateRange,
}: ProtractorHeaderProps) {
  const selectedAccount = accounts.find(
    (a) => a.account_id === selectedAccountId
  );

  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F75D5D]/10">
          <Compass className="h-5 w-5 text-[#F75D5D]" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            총가치각도기
          </h1>
          <p className="text-xs text-gray-400">
            {selectedAccount
              ? selectedAccount.account_name
                ? `${selectedAccount.account_name} · ${selectedAccount.account_id}`
                : selectedAccount.account_id
              : "Meta 광고 성과 진단"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* 날짜 표시 */}
        {dateRange && (
          <span className="hidden text-sm text-gray-400 sm:inline">
            {formatDate(dateRange.start)} ~ {formatDate(dateRange.end)}
          </span>
        )}

        {/* 계정 드롭다운 (2개 이상일 때만, 1개면 바로 표시) */}
        {isLoading ? (
          <div className="h-10 w-[200px] animate-pulse rounded-md bg-gray-100" />
        ) : accounts.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 border-gray-200 bg-white text-gray-900"
              >
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">
                    {selectedAccount?.account_name || "계정 선택"}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {selectedAccount?.account_id || "선택해주세요"}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {accounts.map((acc) => (
                <DropdownMenuItem
                  key={acc.id}
                  onClick={() => onSelect(acc.account_id)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {acc.account_name || acc.account_id}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {acc.account_id}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
