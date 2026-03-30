/**
 * 소재↔LP 일관성 점수 계산 모듈
 * creative_lp_map 테이블에서 결과 조회
 */

import { createServiceClient } from "@/lib/db";

export interface LPConsistencyResult {
  creative_id: string;
  lp_url: string | null;
  consistency_score: number | null;
  analysis_json: Record<string, unknown> | null;
  analyzed_at: string | null;
}

/**
 * account_id별 일관성 점수 조회
 */
export async function getConsistencyByAccount(
  accountId: string,
): Promise<LPConsistencyResult[]> {
  const db = createServiceClient();

  // creatives에서 account_id 필터 → creative id 목록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creatives } = await (db as any)
    .from("creatives")
    .select("id")
    .eq("account_id", accountId)
    .eq("is_active", true);

  if (!creatives || creatives.length === 0) return [];

  const creativeIds = creatives.map((c: { id: string }) => c.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores, error } = await (db as any)
    .from("creative_lp_map")
    .select("*")
    .in("creative_id", creativeIds)
    .order("consistency_score", { ascending: false });

  if (error) {
    console.error("[lp-consistency] 조회 실패:", error);
    return [];
  }

  return (scores ?? []) as LPConsistencyResult[];
}
