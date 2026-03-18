/**
 * 소재↔LP 일관성 점수 계산 모듈
 * creative_lp_consistency 테이블에서 결과 조회
 */

import { createServiceClient } from "@/lib/supabase/server";

export interface LPConsistencyResult {
  ad_id: string;
  lp_url: string | null;
  visual_score: number | null;
  video_score: number | null;
  semantic_score: number | null;
  cross_vt_score: number | null;
  cross_tv_score: number | null;
  holistic_score: number | null;
  total_score: number | null;
  analyzed_at: string | null;
}

/**
 * account_id별 일관성 점수 조회
 */
export async function getConsistencyByAccount(
  accountId: string,
): Promise<LPConsistencyResult[]> {
  const supabase = createServiceClient();

  // ad_creative_embeddings에서 account_id 필터 → ad_id 목록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ads } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("ad_id")
    .eq("account_id", accountId)
    .eq("is_active", true);

  if (!ads || ads.length === 0) return [];

  const adIds = ads.map((a: { ad_id: string }) => a.ad_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores, error } = await (supabase as any)
    .from("creative_lp_consistency")
    .select("*")
    .in("ad_id", adIds)
    .order("total_score", { ascending: false });

  if (error) {
    console.error("[lp-consistency] 조회 실패:", error);
    return [];
  }

  return (scores ?? []) as LPConsistencyResult[];
}
