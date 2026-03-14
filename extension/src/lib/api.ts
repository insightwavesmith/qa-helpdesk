import { getSession } from "./auth";
import type {
  ForbiddenCheckResult,
  ProfanityResult,
  DiagnosisInput,
  DiagnosisResponse,
  KeywordAnalysis,
  BenchmarkResult,
} from "./types";

/**
 * 저장된 세션에서 서버 URL과 Authorization 헤더를 가져옴
 */
async function getRequestConfig(): Promise<{
  serverUrl: string;
  headers: HeadersInit;
}> {
  const session = await getSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return {
    serverUrl: session.serverUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
  };
}

/**
 * fetch 래퍼 — 401 시 재로그인 유도, 네트워크 에러 시 재시도 1회
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const { serverUrl, headers } = await getRequestConfig();
  const url = `${serverUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    if (retry) {
      await new Promise((r) => setTimeout(r, 1000));
      return apiFetch<T>(path, options, false);
    }
    throw new Error("네트워크 연결을 확인해 주세요.");
  }

  if (response.status === 401) {
    throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API 오류 (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * 금칙어 확인
 */
export async function forbiddenCheck(
  keywords: string[],
): Promise<ForbiddenCheckResult> {
  return apiFetch<ForbiddenCheckResult>("/api/ext/forbidden-check", {
    method: "POST",
    body: JSON.stringify({ keywords }),
  });
}

/**
 * 비속어 확인
 */
export async function profanityCheck(
  text: string,
): Promise<{ results: ProfanityResult[]; summary: { total: number; high: number; medium: number; low: number } }> {
  return apiFetch("/api/ext/profanity-check", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/**
 * 포스팅 진단
 */
export async function postDiagnosis(
  input: DiagnosisInput,
): Promise<DiagnosisResponse> {
  return apiFetch<DiagnosisResponse>("/api/ext/post-diagnosis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * 키워드 분석
 */
export async function keywordAnalysis(
  keyword: string,
): Promise<{ keyword: KeywordAnalysis | null; relatedKeywords: KeywordAnalysis[] }> {
  return apiFetch("/api/ext/keyword-analysis", {
    method: "POST",
    body: JSON.stringify({ keyword }),
  });
}

/**
 * TOP N 블로그 벤치마킹
 */
export async function blogBenchmark(
  keyword: string,
  count = 3,
): Promise<BenchmarkResult> {
  const params = new URLSearchParams({ keyword, count: String(count) });
  return apiFetch<BenchmarkResult>(`/api/ext/blog-benchmark?${params}`);
}
