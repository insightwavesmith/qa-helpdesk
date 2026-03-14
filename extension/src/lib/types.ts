export interface ForbiddenCheckResult {
  results: Array<{
    keyword: string;
    isForbidden: boolean;
    isSuicideWord: boolean;
  }>;
}

export interface ProfanityResult {
  word: string;
  matched: string;
  category: string;
  severity: "low" | "medium" | "high";
}

export interface DiagnosisInput {
  title: string;
  content: string;
  targetKeyword: string;
  imageCount: number;
  externalLinks: string[];
}

export interface DiagnosisItem {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  value: string;
  message: string;
  recommendation?: string;
}

export interface DiagnosisResponse {
  results: DiagnosisItem[];
  overallScore: number;
}

export interface KeywordAnalysis {
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  totalSearchCount: number;
  compIdx: string;
  saturationRate: number;
  publishedCount: number;
}

export interface BlogBenchmark {
  url: string;
  title: string;
  charCount: number;
  imageCount: number;
  externalLinkCount: number;
  quoteCount: number;
  dividerCount: number;
  hashtagCount: number;
}

export interface BenchmarkResult {
  blogs: BlogBenchmark[];
  average: Omit<BlogBenchmark, "url" | "title">;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  serverUrl: string;
}

export type MessageType =
  | { type: "GET_AUTH" }
  | { type: "SET_AUTH"; payload: StoredSession }
  | { type: "LOGOUT" }
  | { type: "CHECK_EDITOR" }
  | { type: "DEBUGGER_ATTACH" }
  | { type: "DEBUGGER_CLICK"; payload: { x: number; y: number } }
  | { type: "DEBUGGER_INSERT_TEXT"; payload: { text: string } }
  | { type: "DEBUGGER_ENTER" }
  | { type: "DEBUGGER_DETACH" };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
