"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pagination } from "@/components/shared/Pagination";
import { getSubscribers } from "@/actions/subscribers";
import { Loader2, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "all" | "active" | "opted_out";

interface Subscriber {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
  email_opted_out: boolean | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function SubscriberTab() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSubscribers(page, pageSize, {
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
      });
      setSubscribers(result.data);
      setTotalCount(result.count);
    } catch {
      toast.error("구독자 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleStatusChange = (value: string) => {
    setPage(1);
    setStatusFilter(value as StatusFilter);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* 필터 + 검색 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          총 {totalCount}명
        </p>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">수신중</SelectItem>
            <SelectItem value="opted_out">수신거부</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="이름 또는 이메일 검색"
              className="pl-8 h-9"
            />
          </div>
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          불러오는 중...
        </div>
      ) : subscribers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? "검색 결과가 없습니다." : "아직 구독자가 없습니다."}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  이름
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  이메일
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase">
                  구독일
                </TableHead>
                <TableHead className="text-xs font-medium text-gray-500 uppercase text-center">
                  수신 상태
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((sub) => (
                <TableRow key={sub.id} className="hover:bg-gray-50/50 transition-colors">
                  <TableCell className="font-medium text-gray-900">
                    {sub.name || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {sub.email}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(sub.created_at)}
                  </TableCell>
                  <TableCell className="text-center">
                    {sub.email_opted_out ? (
                      <Badge
                        variant="outline"
                        className="text-[11px] border-red-200 bg-red-50 text-red-600 gap-1"
                      >
                        <UserX className="h-3 w-3" />
                        수신거부
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[11px] border-green-200 bg-green-50 text-green-600 gap-1"
                      >
                        <UserCheck className="h-3 w-3" />
                        수신중
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
