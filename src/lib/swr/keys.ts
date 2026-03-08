// ── SWR 캐시 키 상수 ──

export const SWR_KEYS = {
  // 총가치각도기
  PROTRACTOR_ACCOUNTS: "/api/protractor/accounts",
  protractorInsights: (accountId: string, start: string, end: string) =>
    `/api/protractor/insights?account_id=${accountId}&start=${start}&end=${end}`,
  protractorTotalValue: (
    accountId: string,
    period: number,
    start: string,
    end: string,
  ) =>
    `/api/protractor/total-value?account_id=${accountId}&period=${period}&date_start=${start}&date_end=${end}`,
  protractorOverlap: (accountId: string, start: string, end: string) =>
    `/api/protractor/overlap?account_id=${accountId}&date_start=${start}&date_end=${end}`,
  PROTRACTOR_BENCHMARKS: "/api/protractor/benchmarks",

  // 대시보드
  SALES_SUMMARY: "/api/sales-summary",

  // 경쟁사분석
  COMPETITOR_MONITORS: "/api/competitor/monitors",

  // 관리자
  ADMIN_ACCOUNTS: "/api/admin/accounts",
  ADMIN_KNOWLEDGE_STATS: "/api/admin/knowledge/stats",

  // Server Action 기반 (접두사 "action:" 사용)
  ADMIN_CONTENTS: (typeFilter: string, statusFilter: string) =>
    `action:contents:${typeFilter}:${statusFilter}`,
  ADMIN_CURATION_COUNT: "action:curation-count",
  ADMIN_REVIEWS: "action:reviews",
  PIPELINE_STATS: "action:pipeline-stats",
  CURATION_SUMMARY_STATS: "action:curation-summary-stats",
  deletedContents: (sourceFilter?: string) =>
    `action:deleted-contents:${sourceFilter ?? "all"}`,
  curriculumContents: (sourceType: string) =>
    `action:curriculum:${sourceType}`,
  curationContents: (
    source: string,
    score: string,
    period: string,
    status: string,
  ) => `action:curation:${source}:${score}:${period}:${status}`,
  curationStatusCounts: (source: string) =>
    `action:curation-status:${source}`,
  subscribers: (page: number, status: string, search: string) =>
    `action:subscribers:${page}:${status}:${search}`,
  QA_REPORTS: "action:qa-reports",
} as const;
