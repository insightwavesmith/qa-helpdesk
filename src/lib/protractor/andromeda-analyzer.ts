/**
 * Andromeda 계정 소재 다양성 분석 모듈
 * 설계서 STEP 5: 계정 내 소재 다양성 분석 (768차원 embedding + 4축 가중 Jaccard)
 */

import type { DbClient } from '@/lib/db';
import type { AnalysisJsonV3, AndromedaResult } from '@/types/prescription';

// ── Jaccard 유사도 헬퍼 ────────────────────────────────────────────────

/**
 * 단일 값 비교: 동일하면 1, 다르면 0 (categorical attribute용)
 */
function categoricalSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  return a === b ? 1 : 0;
}

/**
 * 축별 categorical Jaccard 유사도
 * 해당 축의 주요 속성들을 비교해 교집합/합집합 비율 계산
 */
function axisJaccard(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0;
  const a = new Set(setA.filter(Boolean));
  const b = new Set(setB.filter(Boolean));
  let intersection = 0;
  for (const v of a) {
    if (b.has(v)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * analysis_json에서 축별 attribute 값 추출
 */
function extractAxisValues(
  analysis: AnalysisJsonV3 | null,
  axis: 'visual' | 'text' | 'psychology' | 'hook'
): string[] {
  if (!analysis) return [];

  switch (axis) {
    case 'visual':
      return [
        analysis.visual?.color_scheme,
        analysis.visual?.product_visibility,
        analysis.visual?.color?.contrast,
      ].filter(Boolean) as string[];

    case 'text':
      return [
        analysis.text?.headline_type,
        analysis.text?.readability,
      ].filter(Boolean) as string[];

    case 'psychology':
      return [
        analysis.psychology?.emotion,
        analysis.psychology?.social_proof_type,
        analysis.psychology?.urgency,
        analysis.psychology?.authority,
      ].filter(Boolean) as string[];

    case 'hook':
      return [
        analysis.hook?.hook_type,
        analysis.hook?.visual_style,
        analysis.hook?.composition,
      ].filter(Boolean) as string[];

    default:
      return [];
  }
}

/**
 * 핑거프린트 Jaccard (토큰 기반)
 * andromeda_signals 핑거프린트가 있으면 이것을 우선 사용
 */
function fingerprintJaccard(fp1: string | null | undefined, fp2: string | null | undefined): number {
  if (!fp1 || !fp2) return 0;
  const tokens1 = new Set(fp1.split('-'));
  const tokens2 = new Set(fp2.split('-'));
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 4축 가중 Jaccard 유사도 계산
 * 설계서: visual 0.3, text 0.3, psychology 0.2, hook 0.2
 */
export function computeWeightedJaccard(
  a: AnalysisJsonV3 | null,
  b: AnalysisJsonV3 | null
): number {
  if (!a || !b) return 0;

  // 핑거프린트 우선 사용 (더 정확한 유사도)
  const aFp = a.andromeda_signals;
  const bFp = b.andromeda_signals;

  if (aFp && bFp && aFp.visual_fingerprint && bFp.visual_fingerprint) {
    const visualSim = fingerprintJaccard(aFp.visual_fingerprint, bFp.visual_fingerprint);
    const textSim = fingerprintJaccard(aFp.text_fingerprint, bFp.text_fingerprint);
    const audioSim = aFp.audio_fingerprint && bFp.audio_fingerprint
      ? fingerprintJaccard(aFp.audio_fingerprint, bFp.audio_fingerprint)
      : 0;
    const structureSim = fingerprintJaccard(aFp.structure_fingerprint, bFp.structure_fingerprint);

    return visualSim * 0.3 + textSim * 0.3 + audioSim * 0.2 + structureSim * 0.2;
  }

  // Fallback: analysis_json 속성값 기반 Jaccard
  const visualSim = axisJaccard(extractAxisValues(a, 'visual'), extractAxisValues(b, 'visual'));
  const textSim = axisJaccard(extractAxisValues(a, 'text'), extractAxisValues(b, 'text'));
  const psychSim = axisJaccard(extractAxisValues(a, 'psychology'), extractAxisValues(b, 'psychology'));
  const hookSim = axisJaccard(extractAxisValues(a, 'hook'), extractAxisValues(b, 'hook'));

  return visualSim * 0.3 + textSim * 0.3 + psychSim * 0.2 + hookSim * 0.2;
}

/**
 * 유사도가 높은 축 목록 반환 (Jaccard > 0.5인 축)
 */
export function findOverlapAxes(
  a: AnalysisJsonV3 | null,
  b: AnalysisJsonV3 | null
): string[] {
  if (!a || !b) return [];

  const axes: string[] = [];

  const THRESHOLD = 0.5;

  if (axisJaccard(extractAxisValues(a, 'visual'), extractAxisValues(b, 'visual')) > THRESHOLD) {
    axes.push('visual');
  }
  if (axisJaccard(extractAxisValues(a, 'text'), extractAxisValues(b, 'text')) > THRESHOLD) {
    axes.push('text');
  }
  if (axisJaccard(extractAxisValues(a, 'psychology'), extractAxisValues(b, 'psychology')) > THRESHOLD) {
    axes.push('psychology');
  }
  if (axisJaccard(extractAxisValues(a, 'hook'), extractAxisValues(b, 'hook')) > THRESHOLD) {
    axes.push('hook');
  }

  return axes;
}

/**
 * PDA 프레임 기반 차별화 제안 생성
 * Persona / Desire / Awareness 기반으로 다양화 방향 제시
 */
function generatePDASuggestion(
  current: AnalysisJsonV3,
  allCreatives: Array<{ id: string; analysis_json: AnalysisJsonV3 | null }>
): { persona: string; desire: string; awareness: string } {
  // 현재 소재의 emotion 확인 → 반대 emotion 제안
  const currentEmotion = current.psychology?.emotion ?? 'neutral';
  const usedEmotions = new Set(
    allCreatives
      .map(c => c.analysis_json?.psychology?.emotion)
      .filter(Boolean)
  );

  const allEmotions = ['joy', 'trust', 'anticipation', 'surprise', 'fear'] as const;
  const unusedEmotion = allEmotions.find(e => !usedEmotions.has(e)) ?? 'trust';

  // 현재 hook_type 확인 → 다른 hook 제안
  const currentHook = current.hook?.hook_type ?? 'none';
  const usedHooks = new Set(
    allCreatives
      .map(c => c.analysis_json?.hook?.hook_type)
      .filter(Boolean)
  );
  const allHooks = ['problem', 'curiosity', 'benefit', 'shock', 'question', 'contrast', 'relatability'] as const;
  const unusedHook = allHooks.find(h => !usedHooks.has(h)) ?? 'curiosity';

  return {
    persona: `현재 소재(${currentEmotion} 감정/${currentHook} 훅)와 다른 페르소나 타겟: ` +
      `${unusedEmotion} 감정에 반응하는 고객층`,
    desire: `기존 소재가 다루지 않는 욕구/니즈 탐색 — 현재 ${currentHook} 훅 중심에서 ${unusedHook} 훅으로 전환`,
    awareness: `인지 수준이 다른 고객 타겟: ` +
      `현재 소재가 높은 인지 수준을 가정한다면 신규 노출(Cold) 타겟용 소재 제작 권장`,
  };
}

/**
 * 간단한 클러스터링: 유사도 ≥ 0.60인 소재를 같은 클러스터로 묶기
 */
function clusterCreatives(
  creatives: Array<{ id: string; analysis_json: AnalysisJsonV3 | null }>
): string[][] {
  const n = creatives.length;
  const visited = new Set<number>();
  const clusters: string[][] = [];

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    const cluster = [creatives[i].id];
    visited.add(i);

    for (let j = i + 1; j < n; j++) {
      if (visited.has(j)) continue;
      const sim = computeWeightedJaccard(
        creatives[i].analysis_json,
        creatives[j].analysis_json
      );
      if (sim >= 0.60) {
        cluster.push(creatives[j].id);
        visited.add(j);
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

/**
 * STEP 5: 계정 전체 소재 다양성 분석
 */
export async function analyzeAccountDiversity(
  svc: DbClient,
  accountId: string,
  currentMediaId: string,
  currentAnalysis: AnalysisJsonV3
): Promise<AndromedaResult> {
  // 같은 account_id 내 활성 소재 전체 조회 (analysis_json 있는 것만)
  const { data: accountCreatives } = await svc
    .from('creative_media')
    .select('id, analysis_json')
    .eq('account_id', accountId)
    .not('analysis_json', 'is', null);

  if (!accountCreatives || accountCreatives.length < 2) {
    return {
      diversityScore: 100,
      warningLevel: 'low',
      similarPairs: [],
      diversificationSuggestion: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatives = accountCreatives as Array<{ id: string; analysis_json: any }>;

  // 현재 소재 제외 후 유사도 계산 (threshold ≥ 0.40인 쌍만 포함)
  const similarities = creatives
    .filter(c => c.id !== currentMediaId)
    .map(c => ({
      creative_id: c.id as string,
      similarity: computeWeightedJaccard(currentAnalysis, c.analysis_json),
      overlap_axes: findOverlapAxes(currentAnalysis, c.analysis_json),
    }))
    .filter(s => s.similarity >= 0.40)
    .sort((a, b) => b.similarity - a.similarity);

  // 다양성 점수 = 고유 클러스터 수 / 총 소재 수 × 100
  const clusters = clusterCreatives(creatives);
  const diversityScore = Math.round((clusters.length / creatives.length) * 100);

  // 4계층 패널티 감지 (설계서 STEP 5 기준)
  // ≥0.92: 경매차단 위험 → 'high'
  // ≥0.80: 노출제한 위험 → 'high'
  // ≥0.60: 도달감소 → 'medium'
  // <0.60: 안전 → 'low'
  let warningLevel: 'low' | 'medium' | 'high' = 'low';
  if (similarities.some(s => s.similarity >= 0.80)) {
    warningLevel = 'high';
  } else if (similarities.some(s => s.similarity >= 0.60)) {
    warningLevel = 'medium';
  }

  // PDA 프레임 기반 차별화 방향 (경고가 있는 경우만)
  const suggestion = warningLevel !== 'low'
    ? generatePDASuggestion(currentAnalysis, creatives)
    : null;

  return {
    diversityScore,
    warningLevel,
    similarPairs: similarities.slice(0, 5),
    diversificationSuggestion: suggestion,
  };
}

/**
 * Andromeda 경고 메시지 생성
 */
export function generateAndromedaMessage(result: AndromedaResult): string {
  const maxSim = result.similarPairs.length > 0
    ? Math.round(result.similarPairs[0].similarity * 100)
    : 0;

  switch (result.warningLevel) {
    case 'high':
      if (result.similarPairs.some(s => s.similarity >= 0.92)) {
        return `⚠️ 즉시 교체 권장: 계정 내 소재가 ${maxSim}% 유사합니다. 메타 경매 차단 위험이 있습니다. ` +
          `다양성 점수: ${result.diversityScore}/100`;
      }
      return `🔴 강력 경고: 계정 내 소재가 ${maxSim}% 유사합니다. 노출 제한이 발생할 수 있습니다. ` +
        `다양성 점수: ${result.diversityScore}/100`;
    case 'medium':
      return `🟡 다양성 경고: 계정 내 소재가 ${maxSim}% 유사합니다. 도달 감소가 시작될 수 있습니다. ` +
        `다양성 점수: ${result.diversityScore}/100`;
    default:
      return `다양성 점수: ${result.diversityScore}/100`;
  }
}

// 개별 속성 비교를 위한 유틸리티 (prescription-engine에서 활용)
export { categoricalSimilarity };
