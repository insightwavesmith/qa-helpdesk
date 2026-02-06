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
}

export function ProtractorHeader({
  accounts,
  selectedAccountId,
  onSelect,
  isLoading,
}: ProtractorHeaderProps) {
  const selectedAccount = accounts.find(
    (a) => a.account_id === selectedAccountId
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Compass className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-card-foreground">
            총가치각도기
          </h1>
          <p className="text-xs text-muted-foreground">Meta 광고 성과 진단</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-10 w-[200px] animate-pulse rounded-md bg-muted" />
      ) : accounts.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 bg-card text-card-foreground"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">
                  {selectedAccount?.account_name || "계정 선택"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {selectedAccount?.account_id || "선택해주세요"}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                  <span className="text-[11px] text-muted-foreground">
                    {acc.account_id}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
