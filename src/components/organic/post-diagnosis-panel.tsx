"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface DiagnosisItem {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  value: number | string;
  message: string;
  recommendation?: string;
}

interface DiagnosisResult {
  results: DiagnosisItem[];
  overallScore: number;
}

const STATUS_CONFIG: Record<
  DiagnosisItem["status"],
  { label: string; emoji: string; cardClass: string; badgeClass: string }
> = {
  pass: {
    label: "통과",
    emoji: "✅",
    cardClass: "bg-green-50 border-green-200",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  warn: {
    label: "주의",
    emoji: "⚠️",
    cardClass: "bg-yellow-50 border-yellow-200",
    badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  fail: {
    label: "실패",
    emoji: "❌",
    cardClass: "bg-red-50 border-red-200",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

function OverallScore({ score }: { score: number }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          className="transition-all duration-500"
        />
        <text
          x="60"
          y="60"
          textAnchor="middle"
          dy="0.35em"
          fontSize="24"
          fontWeight="bold"
          fill="#111827"
        >
          {score}
        </text>
      </svg>
      <span className="text-[13px] text-gray-500">전체 점수</span>
    </div>
  );
}

function DiagnosisCard({ item }: { item: DiagnosisItem }) {
  const config = STATUS_CONFIG[item.status];

  return (
    <div className={`rounded-lg border p-4 ${config.cardClass}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[14px]">{config.emoji}</span>
          <span className="text-[13px] font-medium text-gray-800 truncate">
            {item.name}
          </span>
        </div>
        <Badge
          variant="outline"
          className={`text-[11px] shrink-0 ${config.badgeClass}`}
        >
          {config.label}
        </Badge>
      </div>
      <p className="text-[13px] text-gray-700 font-semibold mb-1">
        {String(item.value)}
      </p>
      <p className="text-[12px] text-gray-600">{item.message}</p>
      {item.recommendation && (
        <p className="text-[12px] text-gray-400 mt-2 pt-2 border-t border-gray-200">
          {item.recommendation}
        </p>
      )}
    </div>
  );
}

export default function PostDiagnosisPanel() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [imageCount, setImageCount] = useState<number>(0);
  const [externalLinksText, setExternalLinksText] = useState("");
  const [diagnosisResult, setDiagnosisResult] =
    useState<DiagnosisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parseExternalLinks = (text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http"));
  };

  const handleDiagnose = async () => {
    if (!title.trim() || !content.trim()) {
      setErrorMessage("제목과 본문을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setDiagnosisResult(null);

    try {
      const externalLinks = parseExternalLinks(externalLinksText);

      const response = await fetch("/api/admin/post-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          targetKeyword,
          imageCount,
          externalLinks,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error ?? "진단 요청에 실패했습니다."
        );
      }

      const data: DiagnosisResult = await response.json();
      setDiagnosisResult(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] font-semibold">
            포스팅 정보 입력
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[13px]">제목</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="글 제목을 입력하세요"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px]">본문</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="본문 내용을 붙여넣으세요"
              rows={8}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">타겟 키워드</Label>
              <Input
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="타겟 키워드"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">이미지 수</Label>
              <Input
                type="number"
                min={0}
                value={imageCount}
                onChange={(e) =>
                  setImageCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px]">외부 링크</Label>
            <Textarea
              value={externalLinksText}
              onChange={(e) => setExternalLinksText(e.target.value)}
              placeholder="외부 링크를 줄바꿈으로 구분하여 입력"
              rows={3}
              className="resize-none"
            />
            <p className="text-[12px] text-gray-400">
              http로 시작하는 링크만 인식됩니다.
            </p>
          </div>

          {errorMessage && (
            <p className="text-[13px] text-red-500">{errorMessage}</p>
          )}

          <Button
            onClick={handleDiagnose}
            disabled={isLoading}
            className="w-full text-white"
            style={{ backgroundColor: "#F75D5D" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#E54949")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#F75D5D")
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                진단 중...
              </>
            ) : (
              "진단하기"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          <span className="text-[14px]">포스팅을 분석하고 있습니다...</span>
        </div>
      )}

      {/* 결과 영역 */}
      {diagnosisResult && !isLoading && (
        <div className="space-y-6">
          {/* 전체 점수 */}
          <Card>
            <CardContent className="flex justify-center py-8">
              <OverallScore score={diagnosisResult.overallScore} />
            </CardContent>
          </Card>

          {/* 진단 카드 목록 */}
          {diagnosisResult.results.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold text-gray-700 mb-3">
                항목별 진단 결과
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {diagnosisResult.results.map((item) => (
                  <DiagnosisCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
