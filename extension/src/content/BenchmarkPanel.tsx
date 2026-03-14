import { useState, useCallback } from "react";
import { blogBenchmark } from "../lib/api";
import type { EditorContent } from "../lib/editor-reader";
import type { BlogBenchmark, BenchmarkResult } from "../lib/types";

interface BenchmarkPanelProps {
  targetKeyword: string;
  editorContent: EditorContent | null;
  loggedIn: boolean;
}

interface ComparisonItem {
  label: string;
  myValue: number;
  avgValue: number;
  unit: string;
  recommendation: string;
}

export function BenchmarkPanel({ targetKeyword, editorContent, loggedIn }: BenchmarkPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState("");

  const fetchBenchmark = useCallback(async () => {
    if (!targetKeyword.trim()) {
      setError("타겟 키워드를 입력해주세요.");
      return;
    }
    if (!loggedIn) {
      setError("로그인이 필요합니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await blogBenchmark(targetKeyword.trim(), 3);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "벤치마크 데이터를 가져올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [targetKeyword, loggedIn]);

  const comparisons = buildComparisons(editorContent, result?.average ?? null);

  return (
    <div className="bscamp-benchmark">
      <div className="bscamp-benchmark-header">
        <h3 className="bscamp-section-title">TOP3 벤치마크 비교</h3>
        <button className="bscamp-analyze-btn" onClick={fetchBenchmark} disabled={loading}>
          {loading ? "조회 중..." : "TOP3 조회"}
        </button>
      </div>

      {error && <p className="bscamp-error-text">{error}</p>}

      {!result && !loading && !error && (
        <p className="bscamp-hint-text">
          타겟 키워드를 입력하고 "TOP3 조회"를 클릭하면
          상위 블로그와 내 글을 비교합니다.
        </p>
      )}

      {result && (
        <>
          {/* 비교 바 차트 */}
          <div className="bscamp-comparison-list">
            {comparisons.map((item) => (
              <ComparisonBar key={item.label} item={item} />
            ))}
          </div>

          {/* 부족한 항목 안내 */}
          <GapAnalysis comparisons={comparisons} />

          {/* TOP3 블로그 목록 */}
          <div className="bscamp-top3-list">
            <h4 className="bscamp-subsection-title">TOP3 블로그</h4>
            {result.blogs.map((blog, idx) => (
              <TopBlogItem key={blog.url} blog={blog} rank={idx + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ComparisonBar({ item }: { item: ComparisonItem }) {
  const maxVal = Math.max(item.myValue, item.avgValue, 1);
  const myPct = Math.min((item.myValue / maxVal) * 100, 100);
  const avgPct = Math.min((item.avgValue / maxVal) * 100, 100);
  const isAhead = item.myValue >= item.avgValue;

  return (
    <div className="bscamp-comparison-item">
      <div className="bscamp-comparison-label">{item.label}</div>
      <div className="bscamp-comparison-bars">
        <div className="bscamp-bar-row">
          <span className="bscamp-bar-label">내 글</span>
          <div className="bscamp-bar-track">
            <div
              className={`bscamp-bar-fill ${isAhead ? "bscamp-bar-good" : "bscamp-bar-behind"}`}
              style={{ width: `${myPct}%` }}
            />
          </div>
          <span className="bscamp-bar-value">{item.myValue}{item.unit}</span>
        </div>
        <div className="bscamp-bar-row">
          <span className="bscamp-bar-label">TOP3</span>
          <div className="bscamp-bar-track">
            <div className="bscamp-bar-fill bscamp-bar-avg" style={{ width: `${avgPct}%` }} />
          </div>
          <span className="bscamp-bar-value">{item.avgValue}{item.unit}</span>
        </div>
      </div>
    </div>
  );
}

function GapAnalysis({ comparisons }: { comparisons: ComparisonItem[] }) {
  const gaps = comparisons.filter((c) => c.myValue < c.avgValue);
  if (gaps.length === 0) {
    return (
      <div className="bscamp-gap-analysis bscamp-gap-good">
        <p>{"\u{1F389}"} 모든 항목에서 TOP3 평균 이상입니다!</p>
      </div>
    );
  }

  return (
    <div className="bscamp-gap-analysis bscamp-gap-needs-work">
      <h4 className="bscamp-subsection-title">{"\u{1F4CB}"} 1등 되려면 부족한 것</h4>
      <ul className="bscamp-gap-list">
        {gaps.map((g) => (
          <li key={g.label} className="bscamp-gap-item">
            <strong>{g.label}</strong>: {g.recommendation}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopBlogItem({ blog, rank }: { blog: BlogBenchmark; rank: number }) {
  return (
    <div className="bscamp-top-blog-item">
      <span className="bscamp-top-rank">{rank}</span>
      <div className="bscamp-top-info">
        <a
          className="bscamp-top-title"
          href={blog.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {blog.title || "제목 없음"}
        </a>
        <div className="bscamp-top-stats">
          <span>{blog.charCount}자</span>
          <span>{blog.imageCount}장</span>
          <span>링크 {blog.externalLinkCount}</span>
        </div>
      </div>
    </div>
  );
}

function buildComparisons(
  content: EditorContent | null,
  avg: Omit<BlogBenchmark, "url" | "title"> | null,
): ComparisonItem[] {
  const myChars = content ? content.content.replace(/\s/g, "").length : 0;
  const myImages = content?.imageCount ?? 0;
  const myLinks = content?.externalLinks.length ?? 0;

  const avgChars = avg?.charCount ?? 0;
  const avgImages = avg?.imageCount ?? 0;
  const avgLinks = avg?.externalLinkCount ?? 0;

  return [
    {
      label: "글자 수",
      myValue: myChars,
      avgValue: Math.round(avgChars),
      unit: "자",
      recommendation: `${Math.round(avgChars) - myChars}자 더 작성하세요`,
    },
    {
      label: "이미지 수",
      myValue: myImages,
      avgValue: Math.round(avgImages),
      unit: "장",
      recommendation: `${Math.round(avgImages) - myImages}장 더 추가하세요`,
    },
    {
      label: "외부 링크",
      myValue: myLinks,
      avgValue: Math.round(avgLinks),
      unit: "개",
      recommendation: myLinks > Math.round(avgLinks)
        ? "외부 링크를 줄이세요"
        : `${Math.round(avgLinks) - myLinks}개 더 추가하세요`,
    },
    {
      label: "인용구",
      myValue: 0,
      avgValue: Math.round(avg?.quoteCount ?? 0),
      unit: "개",
      recommendation: `인용구를 ${Math.round(avg?.quoteCount ?? 0)}개 추가하세요`,
    },
  ];
}
