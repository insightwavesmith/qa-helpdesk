import { NextRequest, NextResponse } from "next/server";
import { benchmarkTopBlogs, type BlogBenchmark } from "@/lib/naver-blog-scraper";

type BenchmarkAverage = Omit<BlogBenchmark, "url" | "title">;

// 향후 DB에서 불러올 수 있도록 샘플 키워드 목록 하드코딩
const SAMPLE_KEYWORDS = ["자사몰", "스마트스토어", "쿠팡 셀러"];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{
    keyword: string;
    blogs: BlogBenchmark[];
    average: BenchmarkAverage;
    error?: string;
  }> = [];

  for (const keyword of SAMPLE_KEYWORDS) {
    try {
      const data = await benchmarkTopBlogs(keyword, 3);
      results.push({ keyword, ...data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[organic-benchmark] 키워드 처리 실패 (${keyword}):`, message);
      results.push({
        keyword,
        blogs: [],
        average: { charCount: 0, imageCount: 0, externalLinkCount: 0, quoteCount: 0, dividerCount: 0, hashtagCount: 0 },
        error: message,
      });
    }
  }

  console.log(
    "[organic-benchmark] 크론 실행 완료:",
    JSON.stringify(
      results.map((r) => ({ keyword: r.keyword, avgChars: r.average.charCount }))
    )
  );

  return NextResponse.json({
    success: true,
    keywordsProcessed: results.length,
    results,
  });
}
