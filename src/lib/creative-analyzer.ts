/**
 * 소재 유사도 분석 + 클러스터링 + 피로도 감지
 * 768차원 임베딩(embedding_768) 기반
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createServiceClient } from "@/lib/supabase/server";

export interface SimilarityPair {
  ad_id_a: string;
  ad_id_b: string;
  similarity: number;
  risk: "normal" | "warning" | "danger" | "duplicate";
}

export interface CreativeCluster {
  cluster_id: string;
  account_id: string;
  ad_ids: string[];
  centroid_ad_id: string | null;
  size: number;
  avg_similarity: number;
  created_at?: string;
}

export interface FatigueRisk {
  ad_id_a: string;
  ad_id_b: string;
  similarity: number;
  risk: "warning" | "danger" | "duplicate";
  message: string;
}

/**
 * 코사인 유사도 계산 (순수 JS)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * 위험도 판정
 * 0.90 이상 → duplicate (확실 중복)
 * 0.85 이상 → danger (위험)
 * 0.70 이상 → warning (경고)
 * 미만 → normal
 */
function getRisk(similarity: number): SimilarityPair["risk"] {
  if (similarity >= 0.9) return "duplicate";
  if (similarity >= 0.85) return "danger";
  if (similarity >= 0.7) return "warning";
  return "normal";
}

/**
 * 같은 계정 소재 간 코사인 유사도 계산
 * embedding_768 NOT NULL인 row만 처리
 * similarity >= 0.7인 쌍만 반환
 */
export async function computeSimilarityPairs(
  accountId: string,
): Promise<SimilarityPair[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("ad_id, embedding_768")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .not("embedding_768", "is", null);

  if (error || !rows || rows.length < 2) {
    return [];
  }

  const pairs: SimilarityPair[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const vecA = rows[i].embedding_768 as number[];
      const vecB = rows[j].embedding_768 as number[];

      if (!vecA || !vecB || vecA.length !== vecB.length) continue;

      const sim = cosineSimilarity(vecA, vecB);
      if (sim >= 0.7) {
        pairs.push({
          ad_id_a: rows[i].ad_id as string,
          ad_id_b: rows[j].ad_id as string,
          similarity: Math.round(sim * 10000) / 10000,
          risk: getRisk(sim),
        });
      }
    }
  }

  // 유사도 내림차순 정렬
  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs;
}

/**
 * Agglomerative 클러스터링 (threshold 0.8)
 * 가장 유사한 쌍부터 merge
 * creative_clusters 테이블에 upsert
 */
export async function generateClusters(accountId: string): Promise<{
  clusters_created: number;
  clusters: CreativeCluster[];
}> {
  const supabase = createServiceClient();

  // 1. embedding_768 가져오기
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from("ad_creative_embeddings")
    .select("ad_id, embedding_768")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .not("embedding_768", "is", null);

  if (error || !rows || rows.length < 2) {
    return { clusters_created: 0, clusters: [] };
  }

  const THRESHOLD = 0.8;

  // 2. 유사도 쌍 계산 (threshold 이상만)
  const highPairs: Array<{ i: number; j: number; sim: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const vecA = rows[i].embedding_768 as number[];
      const vecB = rows[j].embedding_768 as number[];
      if (!vecA || !vecB || vecA.length !== vecB.length) continue;
      const sim = cosineSimilarity(vecA, vecB);
      if (sim >= THRESHOLD) {
        highPairs.push({ i, j, sim });
      }
    }
  }

  // 유사도 내림차순 정렬 (가장 유사한 것부터 merge)
  highPairs.sort((a, b) => b.sim - a.sim);

  // 3. Union-Find 구조로 클러스터 병합
  const parent = new Map<number, number>();
  const getRoot = (x: number): number => {
    if (!parent.has(x)) return x;
    const root = getRoot(parent.get(x)!);
    parent.set(x, root);
    return root;
  };
  const union = (x: number, y: number) => {
    const rx = getRoot(x);
    const ry = getRoot(y);
    if (rx !== ry) parent.set(ry, rx);
  };

  for (const pair of highPairs) {
    union(pair.i, pair.j);
  }

  // 4. 클러스터 그룹화
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = getRoot(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(i);
  }

  // 5. 클러스터 크기 2 이상만 선별
  const validClusters = Array.from(clusterMap.values()).filter(
    (members) => members.length >= 2,
  );

  // 6. creative_clusters에 upsert
  const now = new Date().toISOString();
  const clusterRows = validClusters.map((members, idx) => {
    const adIds = members.map((i) => rows[i].ad_id as string);

    // 클러스터 내 평균 유사도 계산
    let totalSim = 0;
    let simCount = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const vecA = rows[members[a]].embedding_768 as number[];
        const vecB = rows[members[b]].embedding_768 as number[];
        if (vecA && vecB && vecA.length === vecB.length) {
          totalSim += cosineSimilarity(vecA, vecB);
          simCount++;
        }
      }
    }
    const avgSim = simCount > 0 ? Math.round((totalSim / simCount) * 10000) / 10000 : 0;

    return {
      cluster_label: `cluster_${idx + 1}`,
      account_id: accountId,
      member_ad_ids: adIds,
      member_count: adIds.length,
      avg_roas: avgSim, // 유사도를 avg_roas에 임시 저장 (향후 실제 ROAS로 교체)
      updated_at: now,
    };
  });

  if (clusterRows.length > 0) {
    // 기존 클러스터 삭제 후 재삽입
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("creative_clusters")
      .delete()
      .eq("account_id", accountId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("creative_clusters")
      .insert(clusterRows);
  }

  const result: CreativeCluster[] = clusterRows.map((r) => ({
    cluster_id: r.cluster_label,
    account_id: r.account_id,
    ad_ids: r.member_ad_ids,
    centroid_ad_id: r.member_ad_ids[0],
    size: r.member_count,
    avg_similarity: r.avg_roas ?? 0,
  }));

  return { clusters_created: result.length, clusters: result };
}

/**
 * 피로도 위험 감지
 * similarity >= 0.85 → "danger" (위험)
 * similarity >= 0.90 → "duplicate" (확실 중복)
 */
export async function detectFatigue(accountId: string): Promise<FatigueRisk[]> {
  const pairs = await computeSimilarityPairs(accountId);

  const risks: FatigueRisk[] = [];

  for (const pair of pairs) {
    if (pair.similarity >= 0.9) {
      risks.push({
        ad_id_a: pair.ad_id_a,
        ad_id_b: pair.ad_id_b,
        similarity: pair.similarity,
        risk: "duplicate",
        message: `소재 중복 확인 (유사도 ${(pair.similarity * 100).toFixed(1)}%) — 동일 소재 게재 중단 권장`,
      });
    } else if (pair.similarity >= 0.85) {
      risks.push({
        ad_id_a: pair.ad_id_a,
        ad_id_b: pair.ad_id_b,
        similarity: pair.similarity,
        risk: "danger",
        message: `소재 피로도 위험 (유사도 ${(pair.similarity * 100).toFixed(1)}%) — 소재 교체 검토 필요`,
      });
    }
  }

  return risks;
}
