/**
 * GET /api/protractor/account-diversity?account_id=xxx
 * 계정 소재 다양성 분석 API (Andromeda)
 * 임베딩 + 4축 가중 Jaccard 기반 클러스터링
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/db';
import { computeWeightedJaccard, findOverlapAxes } from '@/lib/protractor/andromeda-analyzer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AJ = Record<string, any>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('account_id');
  if (!accountId) {
    return NextResponse.json({ error: 'account_id 필수' }, { status: 400 });
  }

  const svc = createServiceClient();

  // 계정의 활성 소재 조회 (analysis_json + 성과 데이터)
  const { data: mediaRows, error } = await svc
    .from('creative_media')
    .select('id, creative_id, analysis_json, media_type')
    .not('analysis_json', 'is', null);

  if (error || !mediaRows) {
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  // account_id로 필터 (creative_media에 직접 account_id가 없으므로 creatives 조인)
  const creativeIds = [...new Set(mediaRows.map((r: AJ) => r.creative_id as string))];
  const { data: creatives } = await svc
    .from('creatives')
    .select('id, account_id')
    .in('id', creativeIds)
    .eq('account_id', accountId);

  const accountCreativeIds = new Set((creatives ?? []).map((c: AJ) => c.id as string));
  const accountMedia = mediaRows.filter((r: AJ) => accountCreativeIds.has(r.creative_id));

  if (accountMedia.length < 2) {
    return NextResponse.json({
      diversity_score: 100,
      warning_level: 'low',
      message: '소재가 2개 미만이라 다양성 분석 불가',
      similar_pairs: [],
      diversification_suggestion: null,
      clusters: [],
    });
  }

  // 성과 데이터 조회
  const perfCreativeIds = [...accountCreativeIds];
  const { data: perfRows } = await svc
    .from('creative_performance')
    .select('creative_id, roas, ctr')
    .in('creative_id', perfCreativeIds);

  const perfMap = new Map<string, { roas: number; ctr: number }>();
  for (const p of (perfRows ?? []) as AJ[]) {
    perfMap.set(p.creative_id, { roas: p.roas ?? 0, ctr: p.ctr ?? 0 });
  }

  // 유사도 행렬 계산
  const items = accountMedia as AJ[];
  const pairs: Array<{ i: number; j: number; sim: number; overlap: string[] }> = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = computeWeightedJaccard(items[i].analysis_json, items[j].analysis_json);
      if (sim >= 0.30) {
        pairs.push({
          i, j, sim,
          overlap: findOverlapAxes(items[i].analysis_json, items[j].analysis_json),
        });
      }
    }
  }

  // 클러스터링 (union-find 방식, threshold 0.60)
  const parent = items.map((_, idx) => idx);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  for (const p of pairs) {
    if (p.sim >= 0.60) union(p.i, p.j);
  }

  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(i);
  }

  // 클러스터 정보 조립
  const clusters = [...clusterMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([, members], idx) => {
      const memberItems = members.map(i => items[i]);
      const avgRoas = memberItems.reduce((s, m) => {
        const p = perfMap.get(m.creative_id);
        return s + (p?.roas ?? 0);
      }, 0) / members.length;
      const avgCtr = memberItems.reduce((s, m) => {
        const p = perfMap.get(m.creative_id);
        return s + (p?.ctr ?? 0);
      }, 0) / members.length;

      // 태그 추출 (hook_type, style 등)
      const tags: string[] = [];
      for (const m of memberItems) {
        const aj = m.analysis_json as AJ;
        if (aj?.hook?.hook_type) tags.push(aj.hook.hook_type);
        if (aj?.hook?.visual_style) tags.push(aj.hook.visual_style);
      }
      const uniqueTags = [...new Set(tags)].slice(0, 3);

      return {
        id: 'cluster_' + String.fromCharCode(65 + idx),
        label: '클러스터 ' + String.fromCharCode(65 + idx),
        count: members.length,
        avg_roas: avgRoas,
        avg_ctr: avgCtr,
        tags: uniqueTags,
        is_overcrowded: members.length >= Math.ceil(items.length * 0.5),
        is_top_performer: avgRoas >= 2.0,
      };
    });

  // 다양성 점수
  const diversityScore = Math.round((clusterMap.size / items.length) * 100);

  // 경고 수준
  const maxSim = pairs.length > 0 ? Math.max(...pairs.map(p => p.sim)) : 0;
  let warningLevel: 'low' | 'medium' | 'high' = 'low';
  let message = '소재 다양성이 양호합니다.';
  if (maxSim >= 0.80) {
    warningLevel = 'high';
    message = '⚠️ 경매차단/노출제한 위험: 유사도 ' + (maxSim * 100).toFixed(0) + '% 쌍 감지';
  } else if (maxSim >= 0.60) {
    warningLevel = 'medium';
    message = '⚠ 도달감소 위험: 유사도 ' + (maxSim * 100).toFixed(0) + '% 쌍 감지';
  }

  // 유사 쌍 (상위 5개)
  const similarPairs = pairs
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
    .map(p => ({
      creative_id: items[p.j].id,
      similarity: Math.round(p.sim * 100) / 100,
      overlap_axes: p.overlap,
    }));

  // PDA 제안
  let diversificationSuggestion = null;
  if (warningLevel !== 'low') {
    const usedHooks = new Set(items.map(i => (i.analysis_json as AJ)?.hook?.hook_type).filter(Boolean));
    const allHooks = ['problem', 'curiosity', 'benefit', 'shock', 'question', 'contrast', 'relatability'];
    const unusedHook = allHooks.find(h => !usedHooks.has(h)) || 'curiosity';

    const usedEmotions = new Set(items.map(i => (i.analysis_json as AJ)?.psychology?.emotion).filter(Boolean));
    const allEmotions = ['joy', 'trust', 'anticipation', 'surprise', 'fear'];
    const unusedEmotion = allEmotions.find(e => !usedEmotions.has(e)) || 'trust';

    diversificationSuggestion = {
      persona: '현재 미사용 감정(' + unusedEmotion + ')에 반응하는 고객층 타겟',
      desire: '현재 미사용 훅(' + unusedHook + ')으로 새로운 욕구 자극',
      awareness: '인지 수준이 다른 고객을 위한 Cold/Warm 분리 소재 제작',
    };
  }

  return NextResponse.json({
    diversity_score: diversityScore,
    warning_level: warningLevel,
    message,
    similar_pairs: similarPairs,
    diversification_suggestion: diversificationSuggestion,
    clusters,
  });
}
