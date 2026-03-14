"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

// ───────────────────────── 타입 ─────────────────────────
interface KeywordAnalysis {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  totalSearchCount: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  compIdx: string;
  plAvgDepth: number;
  pcPLAvgBid?: number;
  mobilePLAvgBid?: number;
  saturationRate?: number;
  publishedCount?: number;
}

interface AnalysisResponse {
  keyword: KeywordAnalysis | null;
  relatedKeywords: KeywordAnalysis[];
  error?: string;
}

type SortKey = "search" | "ctr" | "competition";

// ───────────────────────── 상수 ─────────────────────────
const COMP_BADGE: Record<string, { label: string; className: string }> = {
  높음: { label: "높음", className: "bg-red-50 text-red-700 border-red-200" },
  중간: { label: "중간", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  낮음: { label: "낮음", className: "bg-green-50 text-green-700 border-green-200" },
};

const COMP_ORDER: Record<string, number> = { 높음: 0, 중간: 1, 낮음: 2 };

// ───────────────────────── 포맷 헬퍼 ────────────────────
function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtWon(n?: number): string {
  if (n == null) return "-";
  return n.toLocaleString() + "원";
}

function fmtCtr(n: number): string {
  return n.toFixed(2) + "%";
}

function fmtSat(n?: number): string {
  if (n == null) return "-";
  return n.toFixed(1) + "%";
}

// ───────────────────────── 포화도 색상 ──────────────────
function saturationColor(rate?: number): string {
  if (rate == null) return "text-gray-500";
  if (rate <= 50) return "text-green-600";
  if (rate <= 100) return "text-yellow-600";
  return "text-red-600";
}

// ───────────────────────── 서브 컴포넌트 ────────────────

function CompBadge({ compIdx }: { compIdx: string }) {
  const info = COMP_BADGE[compIdx];
  if (!info) return <span className="text-[12px] text-gray-400">-</span>;
  return (
    <Badge variant="outline" className={`text-[11px] ${info.className}`}>
      {info.label}
    </Badge>
  );
}

function KeywordInfoCards({ kw }: { kw: KeywordAnalysis }) {
  const avgCtr = (kw.monthlyAvePcCtr + kw.monthlyAveMobileCtr) / 2;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* 월간 검색량 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[12px] text-gray-500 mb-1">월간 검색량</p>
          <p className="text-[20px] font-bold tabular-nums">
            {fmtNum(kw.totalSearchCount)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
            PC {fmtNum(kw.monthlyPcQcCnt)} · 모바일 {fmtNum(kw.monthlyMobileQcCnt)}
          </p>
        </CardContent>
      </Card>

      {/* 입찰가 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[12px] text-gray-500 mb-1">입찰가</p>
          <p className="text-[14px] font-semibold tabular-nums">
            PC {fmtWon(kw.pcPLAvgBid)}
          </p>
          <p className="text-[14px] font-semibold tabular-nums mt-0.5">
            모바일 {fmtWon(kw.mobilePLAvgBid)}
          </p>
        </CardContent>
      </Card>

      {/* 경쟁도 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[12px] text-gray-500 mb-2">경쟁도</p>
          <CompBadge compIdx={kw.compIdx} />
          <p className="text-[11px] text-gray-400 mt-1.5 tabular-nums">
            평균 CTR {fmtCtr(avgCtr)}
          </p>
        </CardContent>
      </Card>

      {/* 포화도 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[12px] text-gray-500 mb-1">포화도</p>
          <p className={`text-[20px] font-bold tabular-nums ${saturationColor(kw.saturationRate)}`}>
            {fmtSat(kw.saturationRate)}
          </p>
          {kw.publishedCount != null && (
            <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
              발행량 {fmtNum(kw.publishedCount)}건
            </p>
          )}
          {kw.saturationRate != null && (
            <p className={`text-[11px] mt-0.5 ${saturationColor(kw.saturationRate)}`}>
              {kw.saturationRate <= 50
                ? "진입 기회"
                : kw.saturationRate <= 100
                ? "보통"
                : "포화"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RelatedKeywordsTable({ rows }: { rows: KeywordAnalysis[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("search");

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "search") return b.totalSearchCount - a.totalSearchCount;
    if (sortKey === "ctr") {
      const aCtr = (a.monthlyAvePcCtr + a.monthlyAveMobileCtr) / 2;
      const bCtr = (b.monthlyAvePcCtr + b.monthlyAveMobileCtr) / 2;
      return bCtr - aCtr;
    }
    // competition
    return (COMP_ORDER[a.compIdx] ?? 9) - (COMP_ORDER[b.compIdx] ?? 9);
  });

  const sortButtons: { key: SortKey; label: string }[] = [
    { key: "search", label: "검색량순" },
    { key: "ctr", label: "CTR순" },
    { key: "competition", label: "경쟁도순" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-gray-500">정렬:</span>
        {sortButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setSortKey(btn.key)}
            className={`text-[12px] px-2.5 py-1 rounded border transition-colors ${
              sortKey === btn.key
                ? "border-[#F75D5D] text-[#F75D5D] bg-red-50"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">키워드</TableHead>
                <TableHead className="text-right">PC검색</TableHead>
                <TableHead className="text-right">모바일검색</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead>경쟁도</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const avgCtr = (row.monthlyAvePcCtr + row.monthlyAveMobileCtr) / 2;
                return (
                  <TableRow key={row.relKeyword}>
                    <TableCell className="font-medium text-[13px]">
                      {row.relKeyword}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">
                      {fmtNum(row.monthlyPcQcCnt)}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">
                      {fmtNum(row.monthlyMobileQcCnt)}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums font-semibold">
                      {fmtNum(row.totalSearchCount)}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">
                      {fmtCtr(avgCtr)}
                    </TableCell>
                    <TableCell>
                      <CompBadge compIdx={row.compIdx} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────── 메인 컴포넌트 ────────────────
export default function KeywordAnalysisPanel() {
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    const keyword = inputValue.trim();
    if (!keyword) return;

    setLoading(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/keyword-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg((body as { error?: string }).error ?? "서버 오류가 발생했습니다.");
        return;
      }

      const data: AnalysisResponse = await res.json();

      if (data.error) {
        setErrorMsg(data.error);
        return;
      }

      setResult(data);
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") analyze();
  };

  return (
    <div className="space-y-6">
      {/* 입력 영역 */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="분석할 키워드 입력"
          className="max-w-sm text-[14px]"
          disabled={loading}
        />
        <Button
          onClick={analyze}
          disabled={loading || !inputValue.trim()}
          style={{ backgroundColor: "#F75D5D" }}
          className="text-white hover:opacity-90 transition-opacity"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              분석 중...
            </>
          ) : (
            "분석하기"
          )}
        </Button>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-[14px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          키워드 분석 중입니다...
        </div>
      )}

      {/* 에러 */}
      {errorMsg && !loading && (
        <Card className="border-red-100">
          <CardContent className="p-4">
            <p className="text-[14px] text-red-600 font-medium">분석 실패</p>
            <p className="text-[13px] text-gray-600 mt-1">{errorMsg}</p>
            {errorMsg.includes("API") || errorMsg.includes("키") ? (
              <p className="text-[12px] text-gray-400 mt-2">
                네이버 검색광고 API 키가 설정되어 있는지 확인해 주세요.
                (NAVER_AD_ACCESS_LICENSE, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID)
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* 결과 */}
      {result && !loading && (
        <div className="space-y-6">
          {/* 키워드 정보 카드 */}
          {result.keyword ? (
            <div className="space-y-3">
              <CardHeader className="p-0">
                <CardTitle className="text-[15px] font-semibold text-gray-800">
                  &ldquo;{result.keyword.relKeyword}&rdquo; 분석 결과
                </CardTitle>
              </CardHeader>
              <KeywordInfoCards kw={result.keyword} />
            </div>
          ) : (
            <p className="text-[14px] text-gray-500">
              해당 키워드의 검색량 데이터를 찾을 수 없습니다.
            </p>
          )}

          {/* 연관 키워드 테이블 */}
          {result.relatedKeywords.length > 0 && (
            <div className="space-y-3">
              <p className="text-[14px] font-semibold text-gray-800">
                연관 키워드{" "}
                <span className="text-[13px] font-normal text-gray-400">
                  {result.relatedKeywords.length}개
                </span>
              </p>
              <RelatedKeywordsTable rows={result.relatedKeywords} />
            </div>
          )}

          {/* TOP 3 블로그 요약 — 추후 구현 */}
          <Card className="bg-gray-50 border-gray-100">
            <CardContent className="p-4 flex items-start gap-3">
              <Badge variant="outline" className="text-[11px] text-gray-500 border-gray-300 mt-0.5 shrink-0">
                추후 구현
              </Badge>
              <div>
                <p className="text-[13px] font-medium text-gray-600">
                  TOP 3 블로그 벤치마킹
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  상위 3개 블로그의 평균 글자 수, 이미지 수, 외부 링크 수 등을 분석하는
                  기능입니다. 곧 업데이트될 예정입니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
