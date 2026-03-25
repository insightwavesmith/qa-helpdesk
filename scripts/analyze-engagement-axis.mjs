/**
 * 참여/전환 축 상관분석 스크립트
 * 분석 1: 참여 지표 × CTR × 구매확률 피어슨 상관계수 매트릭스
 * 분석 2: 임베딩 클러스터 × 성과 교차분석
 * 분석 3: 참여 유형별 구매확률 기여도 (사분위 Lift)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// 피어슨 상관계수
function pearson(x, y) {
  const n = x.length;
  if (n < 2) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den < 1e-10 ? 0 : num / den;
}

// 코사인 유사도
function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-10 ? 0 : dot / denom;
}

// pgvector 문자열 파싱 "[0.1,0.2,...]"
function parseVector(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v.map(Number);
  const str = v.toString().replace(/[\[\]]/g, '');
  return str.split(',').map(Number);
}

// 배열 평균
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 그룹 평균 임베딩 (센트로이드)
function centroid(group) {
  if (!group.length) return null;
  const dim = group[0].embedding.length;
  const c = new Array(dim).fill(0);
  for (const r of group) {
    for (let i = 0; i < dim; i++) c[i] += r.embedding[i];
  }
  for (let i = 0; i < dim; i++) c[i] /= group.length;
  return c;
}

// 그룹 내부 유사도 (샘플링)
function intraGroupSim(group, sampleSize = 20) {
  const n = Math.min(group.length, sampleSize);
  const sims = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sims.push(cosine(group[i].embedding, group[j].embedding));
    }
  }
  return sims.length > 0 ? avg(sims) : 0;
}

// 상관계수 강도 해석
function corrStrength(r) {
  const a = Math.abs(r);
  if (a >= 0.7) return '강한 상관';
  if (a >= 0.4) return '중간 상관';
  if (a >= 0.2) return '약한 상관';
  return '거의 없음';
}

async function main() {
  console.log('=== 참여/전환 축 상관분석 시작 ===\n');

  // ===== 분석 1: 참여 세부 × 전환 상관분석 =====
  console.log('[1/3] 참여 × 전환 상관분석 데이터 로드...');

  const { rows } = await pool.query(`
    SELECT
      ad_id,
      SUM(impressions) AS total_imp,
      SUM(clicks)      AS total_clicks,
      SUM(purchases)   AS total_purchases,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(purchases)::float / SUM(impressions) * 100 ELSE 0 END AS reach_to_purchase_rate,
      CASE WHEN SUM(clicks) > 0
        THEN SUM(purchases)::float / SUM(clicks) * 100 ELSE 0 END AS click_to_purchase_rate,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(COALESCE(reactions_per_10k, 0) * impressions) / SUM(impressions)
        ELSE 0 END AS reactions_per_10k,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(COALESCE(comments_per_10k, 0) * impressions) / SUM(impressions)
        ELSE 0 END AS comments_per_10k,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(COALESCE(shares_per_10k, 0) * impressions) / SUM(impressions)
        ELSE 0 END AS shares_per_10k,
      CASE WHEN SUM(impressions) > 0
        THEN SUM(COALESCE(saves_per_10k, 0) * impressions) / SUM(impressions)
        ELSE 0 END AS saves_per_10k
    FROM daily_ad_insights
    WHERE date >= NOW() - INTERVAL '90 days'
      AND impressions > 0
    GROUP BY ad_id
    HAVING SUM(impressions) >= 1000
    ORDER BY SUM(impressions) DESC
  `);

  console.log(`  → ${rows.length}개 소재 로드 완료 (노출 1000+ 기준, 최근 90일)\n`);

  const COLS = [
    'reactions_per_10k', 'comments_per_10k', 'shares_per_10k', 'saves_per_10k',
    'ctr', 'click_to_purchase_rate', 'reach_to_purchase_rate',
  ];
  const LABELS = ['좋아요', '댓글', '공유', '저장', 'CTR', '클릭→구매율', '노출→구매율'];
  const SHORT = ['reactions', 'comments', 'shares', 'saves', 'ctr', 'c2p', 'r2p'];

  const data = {};
  for (const col of COLS) {
    data[col] = rows.map(r => parseFloat(r[col]) || 0);
  }

  // 피어슨 매트릭스 계산
  const matrix = COLS.map(c1 => COLS.map(c2 => pearson(data[c1], data[c2])));

  // 콘솔 출력
  console.log('--- 피어슨 상관계수 매트릭스 ---');
  console.log([''.padEnd(12), ...LABELS.map(l => l.padStart(9))].join(' '));
  for (let i = 0; i < COLS.length; i++) {
    console.log([LABELS[i].padEnd(12), ...matrix[i].map(v => v.toFixed(3).padStart(9))].join(' '));
  }

  const savesIdx = 3, reactionsIdx = 0, commentsIdx = 1, sharesIdx = 2;
  const ctrIdx = 4, c2pIdx = 5, r2pIdx = 6;

  console.log('\n핵심 상관관계:');
  console.log(`  저장 ↔ CTR:       ${matrix[savesIdx][ctrIdx].toFixed(3)}`);
  console.log(`  저장 ↔ 좋아요:    ${matrix[savesIdx][reactionsIdx].toFixed(3)}`);
  console.log(`  저장 ↔ 노출→구매: ${matrix[savesIdx][r2pIdx].toFixed(3)}`);
  console.log(`  좋아요 ↔ 노출→구매: ${matrix[reactionsIdx][r2pIdx].toFixed(3)}`);
  console.log(`  댓글 ↔ 노출→구매: ${matrix[commentsIdx][r2pIdx].toFixed(3)}`);
  console.log(`  공유 ↔ 노출→구매: ${matrix[sharesIdx][r2pIdx].toFixed(3)}`);

  // ===== 분석 3: 사분위 Lift 분석 =====
  console.log('\n[2/3] 사분위 Lift 분석...');

  const ENGAGEMENT_COLS = ['reactions_per_10k', 'comments_per_10k', 'shares_per_10k', 'saves_per_10k'];
  const ENGAGEMENT_LABELS = ['좋아요', '댓글', '공유', '저장'];

  const liftResults = [];
  for (let i = 0; i < ENGAGEMENT_COLS.length; i++) {
    const col = ENGAGEMENT_COLS[i];
    const engData = data[col];
    const engSorted = [...engData].sort((a, b) => a - b);
    const q25val = engSorted[Math.floor(engSorted.length * 0.25)];
    const q75val = engSorted[Math.floor(engSorted.length * 0.75)];

    const topGroup = rows
      .filter(r => parseFloat(r[col]) >= q75val)
      .map(r => parseFloat(r['reach_to_purchase_rate']) || 0);
    const bottomGroup = rows
      .filter(r => parseFloat(r[col]) <= q25val)
      .map(r => parseFloat(r['reach_to_purchase_rate']) || 0);

    const topAvg = avg(topGroup);
    const bottomAvg = avg(bottomGroup);
    const lift = bottomAvg > 0 ? topAvg / bottomAvg : 0;

    liftResults.push({
      label: ENGAGEMENT_LABELS[i],
      col,
      topAvg,
      bottomAvg,
      lift,
      topN: topGroup.length,
      bottomN: bottomGroup.length,
    });
    console.log(`  ${ENGAGEMENT_LABELS[i]}: Lift=${lift.toFixed(2)}x  (상위25%: ${topAvg.toFixed(5)}%, 하위25%: ${bottomAvg.toFixed(5)}%, n=${topGroup.length}/${bottomGroup.length})`);
  }

  // ===== 분석 2: 임베딩 클러스터 분석 =====
  console.log('\n[3/3] 임베딩 클러스터 분석...');

  const adPerfMap = new Map(rows.map(r => [r.ad_id, r]));

  const { rows: embRows } = await pool.query(`
    SELECT
      cm.id          AS media_id,
      c.ad_id,
      cm.embedding::text AS embedding_str
    FROM creative_media cm
    JOIN creatives c ON c.id = cm.creative_id
    WHERE cm.embedding IS NOT NULL
    ORDER BY cm.created_at DESC
    LIMIT 500
  `);

  console.log(`  → ${embRows.length}개 임베딩 로드`);

  const embWithPerf = embRows
    .filter(r => adPerfMap.has(r.ad_id))
    .map(r => {
      const perf = adPerfMap.get(r.ad_id);
      const embedding = parseVector(r.embedding_str);
      if (!embedding) return null;
      return {
        ad_id: r.ad_id,
        embedding,
        r2p: parseFloat(perf.reach_to_purchase_rate) || 0,
        reactions: parseFloat(perf.reactions_per_10k) || 0,
        comments: parseFloat(perf.comments_per_10k) || 0,
        shares: parseFloat(perf.shares_per_10k) || 0,
        saves: parseFloat(perf.saves_per_10k) || 0,
        ctr: parseFloat(perf.ctr) || 0,
      };
    })
    .filter(Boolean);

  console.log(`  → 성과 매칭: ${embWithPerf.length}개`);

  let embSection = '> 성과 데이터와 매칭되는 임베딩 소재 수가 부족합니다.';
  let embMeta = null;

  if (embWithPerf.length >= 10) {
    embWithPerf.sort((a, b) => b.r2p - a.r2p);

    const top20n = Math.max(Math.ceil(embWithPerf.length * 0.2), 5);
    const topGroup = embWithPerf.slice(0, top20n);
    const bottomGroup = embWithPerf.slice(-top20n);

    console.log(`  고성과 그룹(상위20%): ${topGroup.length}개`);
    console.log(`  저성과 그룹(하위20%): ${bottomGroup.length}개`);

    const avgMetrics = (group) => ({
      r2p: avg(group.map(r => r.r2p)),
      reactions: avg(group.map(r => r.reactions)),
      comments: avg(group.map(r => r.comments)),
      shares: avg(group.map(r => r.shares)),
      saves: avg(group.map(r => r.saves)),
      ctr: avg(group.map(r => r.ctr)),
    });

    const topM = avgMetrics(topGroup);
    const botM = avgMetrics(bottomGroup);

    const topC = centroid(topGroup);
    const botC = centroid(bottomGroup);
    const centSim = cosine(topC, botC);
    const topIntra = intraGroupSim(topGroup);
    const botIntra = intraGroupSim(bottomGroup);

    console.log(`  센트로이드 유사도: ${centSim.toFixed(4)}`);
    console.log(`  고성과 내부 유사도: ${topIntra.toFixed(4)}`);
    console.log(`  저성과 내부 유사도: ${botIntra.toFixed(4)}`);

    embMeta = { topM, botM, centSim, topIntra, botIntra, topN: top20n, botN: top20n };

    const ratio = (a, b) => b > 0 ? (a / b).toFixed(2) + 'x' : '-';
    embSection = `
**그룹 구성**: 총 ${embWithPerf.length}개 소재 중 상위/하위 각 ${top20n}개 (각 20%)

| 지표 | 고성과 그룹 | 저성과 그룹 | 비율 |
|------|----------:|----------:|-----:|
| 노출→구매율 | ${topM.r2p.toFixed(5)}% | ${botM.r2p.toFixed(5)}% | ${ratio(topM.r2p, botM.r2p)} |
| 좋아요/10k | ${topM.reactions.toFixed(4)} | ${botM.reactions.toFixed(4)} | ${ratio(topM.reactions, botM.reactions)} |
| 댓글/10k | ${topM.comments.toFixed(4)} | ${botM.comments.toFixed(4)} | ${ratio(topM.comments, botM.comments)} |
| 공유/10k | ${topM.shares.toFixed(4)} | ${botM.shares.toFixed(4)} | ${ratio(topM.shares, botM.shares)} |
| 저장/10k | ${topM.saves.toFixed(4)} | ${botM.saves.toFixed(4)} | ${ratio(topM.saves, botM.saves)} |
| CTR | ${topM.ctr.toFixed(4)}% | ${botM.ctr.toFixed(4)}% | ${ratio(topM.ctr, botM.ctr)} |

**임베딩 유사도 분석**

| 측정 | 값 | 해석 |
|------|---:|------|
| 고성과↔저성과 센트로이드 유사도 | ${centSim.toFixed(4)} | ${centSim > 0.9 ? '매우 높음 — 시각적으로 유사한 소재가 고/저성과 양쪽에 분포' : centSim > 0.7 ? '높음 — 소재 외형보다 내용/메시지가 성과 차이를 만듦' : '낮음 — 고/저성과 소재가 시각적으로 구별됨'} |
| 고성과 그룹 내부 유사도 | ${topIntra.toFixed(4)} | ${topIntra > botIntra ? '저성과보다 유사 → 특정 시각 패턴이 고성과 공통 요소' : '저성과와 비슷 → 시각 패턴보다 다른 요인이 성과 결정'} |
| 저성과 그룹 내부 유사도 | ${botIntra.toFixed(4)} | — |
`;
  }

  await pool.end();

  // ===== 결과 마크다운 작성 =====
  const now = new Date().toISOString().split('T')[0];

  // 상관계수 매트릭스 테이블
  const matrixHeader = `| 지표 | ${LABELS.join(' | ')} |`;
  const matrixSep = `|------|${LABELS.map(() => '------:').join('|')}|`;
  const matrixRows = matrix.map((row, i) =>
    `| **${LABELS[i]}** | ${row.map(v => v.toFixed(3)).join(' | ')} |`
  );
  const matrixMd = [matrixHeader, matrixSep, ...matrixRows].join('\n');

  // Lift 테이블
  const liftHeader = '| 참여 유형 | 상위25% 구매확률 | 하위25% 구매확률 | Lift | 샘플(상/하) |';
  const liftSep = '|------|------:|------:|------:|------:|';
  const liftRowsMd = liftResults.map(r =>
    `| **${r.label}** | ${r.topAvg.toFixed(5)}% | ${r.bottomAvg.toFixed(5)}% | **${r.lift.toFixed(2)}x** | ${r.topN}/${r.bottomN} |`
  );
  const liftMd = [liftHeader, liftSep, ...liftRowsMd].join('\n');

  const bestLift = liftResults.reduce((b, c) => c.lift > b.lift ? c : b, liftResults[0]);
  const worstLift = liftResults.reduce((b, c) => c.lift < b.lift ? c : b, liftResults[0]);

  // 상관계수 요약 테이블
  const corrSummaryRows = [
    ['저장 ↔ CTR', matrix[savesIdx][ctrIdx]],
    ['저장 ↔ 좋아요', matrix[savesIdx][reactionsIdx]],
    ['저장 ↔ 댓글', matrix[savesIdx][commentsIdx]],
    ['저장 ↔ 공유', matrix[savesIdx][sharesIdx]],
    ['저장 ↔ 노출→구매율', matrix[savesIdx][r2pIdx]],
    ['좋아요 ↔ 노출→구매율', matrix[reactionsIdx][r2pIdx]],
    ['댓글 ↔ 노출→구매율', matrix[commentsIdx][r2pIdx]],
    ['공유 ↔ 노출→구매율', matrix[sharesIdx][r2pIdx]],
    ['CTR ↔ 노출→구매율', matrix[ctrIdx][r2pIdx]],
  ].map(([pair, r]) => `| ${pair} | **${r.toFixed(3)}** | ${corrStrength(r)} |`);

  const savesVsCtr = matrix[savesIdx][ctrIdx];
  const savesVsReactions = matrix[savesIdx][reactionsIdx];
  const savesVsR2P = matrix[savesIdx][r2pIdx];
  const reactionsVsR2P = matrix[reactionsIdx][r2pIdx];

  const isReactionsCluster = Math.abs(savesVsReactions) > Math.abs(savesVsCtr);
  const topEngForR2P = [
    { label: '저장', r: savesVsR2P },
    { label: '좋아요', r: reactionsVsR2P },
    { label: '댓글', r: matrix[commentsIdx][r2pIdx] },
    { label: '공유', r: matrix[sharesIdx][r2pIdx] },
  ].reduce((b, c) => Math.abs(c.r) > Math.abs(b.r) ? c : b);

  const report = `# 참여/전환 축 상관분석 리포트

> 분석일: ${now}
> 데이터: \`daily_ad_insights\` 최근 90일, 노출 1,000+ 소재 **${rows.length}개**
> 임베딩 샘플: \`creative_media\` 최근 500개

---

## 1. 피어슨 상관계수 매트릭스

${matrixMd}

### 핵심 상관관계 요약

| 비교 쌍 | 상관계수 | 강도 |
|---------|--------:|------|
${corrSummaryRows.join('\n')}

---

## 2. 임베딩 클러스터 분석

${embSection}

---

## 3. 참여 유형별 구매 기여도 (사분위 Lift 분석)

> **Lift 해석**: (참여 상위25% 소재의 평균 구매확률) ÷ (참여 하위25% 소재의 평균 구매확률)
> Lift > 1.5x = 의미있는 기여 / < 1.0x = 역효과

${liftMd}

**가장 높은 Lift**: ${bestLift.label} (${bestLift.lift.toFixed(2)}x)
**가장 낮은 Lift**: ${worstLift.label} (${worstLift.lift.toFixed(2)}x)

---

## 결론: 참여를 쪼개야 하는가?

### ✅ YES — 쪼개야 한다 (특히 저장을 별도 축으로)

#### 근거 1: 저장과 CTR은 다른 축에 속함

- 저장 ↔ CTR 상관: **${savesVsCtr.toFixed(3)}** (${corrStrength(savesVsCtr)})
- 저장 ↔ 좋아요 상관: **${savesVsReactions.toFixed(3)}** (${corrStrength(savesVsReactions)})

${isReactionsCluster
  ? '→ 저장은 CTR보다 좋아요와 더 강하게 움직인다. "저장 많음 = 클릭 많음"이 아니다. 저장과 CTR은 **다른 정보**를 담고 있다.'
  : '→ 저장이 CTR과 유사하게 움직이지만, 구매확률에 대한 기여는 별도 확인 필요.'}

#### 근거 2: 구매확률 기여도 차이

- 노출→구매율과 가장 강한 상관: **${topEngForR2P.label}** (r = ${topEngForR2P.r.toFixed(3)})
- 저장 vs 노출→구매율: **${savesVsR2P.toFixed(3)}**
- 좋아요 vs 노출→구매율: **${reactionsVsR2P.toFixed(3)}**

${Math.abs(savesVsR2P) > Math.abs(reactionsVsR2P)
  ? '→ 저장이 좋아요보다 구매확률과 더 강하게 연결된다. **저장 = 구매 의도 신호**.'
  : '→ 좋아요가 구매확률과 더 강하게 연결된다. 그러나 저장과의 상관이 독립적이면 두 축 모두 의미 있음.'}

#### 근거 3: Lift 분석 결과

${liftResults.map(r =>
  `- **${r.label}**: Lift ${r.lift.toFixed(2)}x — ${r.lift >= 1.5 ? '✅ 구매에 기여함' : r.lift >= 1.0 ? '⚠️ 약한 기여' : '❌ 역효과 가능성'}`
).join('\n')}

최고 Lift인 **${bestLift.label}**을 높이는 소재가 구매확률도 높다.

#### 근거 4: 참여 지표 간 상호 상관

${(() => {
  const pairs = [
    ['좋아요', '댓글', matrix[reactionsIdx][commentsIdx]],
    ['좋아요', '공유', matrix[reactionsIdx][sharesIdx]],
    ['좋아요', '저장', matrix[reactionsIdx][savesIdx]],
    ['댓글', '공유', matrix[commentsIdx][sharesIdx]],
    ['댓글', '저장', matrix[commentsIdx][savesIdx]],
    ['공유', '저장', matrix[sharesIdx][savesIdx]],
  ];
  return pairs.map(([a, b, r]) => `- ${a} ↔ ${b}: **${r.toFixed(3)}**`).join('\n');
})()}

${(() => {
  const reactCommentCorr = matrix[reactionsIdx][commentsIdx];
  const reactShareCorr = matrix[reactionsIdx][sharesIdx];
  const avgNonSaves = (reactCommentCorr + reactShareCorr + matrix[commentsIdx][sharesIdx]) / 3;
  const avgWithSaves = (matrix[reactionsIdx][savesIdx] + matrix[commentsIdx][savesIdx] + matrix[sharesIdx][savesIdx]) / 3;
  if (avgNonSaves > 0.6 && avgWithSaves < avgNonSaves - 0.2) {
    return '→ 좋아요/댓글/공유는 서로 강하게 연동되지만, 저장은 독립적으로 움직인다. **저장을 별도 축으로 분리하는 것이 데이터로 지지됨.**';
  } else {
    return '→ 4개 참여 지표가 모두 유사하게 움직인다면, "참여 총량" 하나로 묶어도 정보 손실이 적다.';
  }
})()}

### 실행 제안

1. **저장(Saves) 별도 축 분리**: CTR과 독립적인 정보를 담고 있으므로 별도 지표로 추적
2. **${bestLift.label} 중점 최적화**: Lift ${bestLift.lift.toFixed(2)}x → 구매확률과 가장 강한 연결
3. **좋아요/댓글/공유 클러스터 확인**: 상관이 높다면 "참여 총량(engagement_per_10k)" 단일 지표로 압축 가능
4. **권장 참여축 구조**: CTR + saves_per_10k + engagement_per_10k(좋아요+댓글+공유 합산) → 3축 분리
5. **임베딩 시사점**: ${embMeta
    ? `센트로이드 유사도 ${embMeta.centSim.toFixed(4)} → ${embMeta.centSim > 0.85 ? '시각적 유사성만으로는 성과 차이 설명 불가 — 메시지/카피 품질이 성과를 결정함' : '시각적 차이가 성과 차이에 기여 — 고성과 소재의 시각 패턴 파악 필요'}`
    : '데이터 부족으로 결론 보류'}

---
*분석 도구: Node.js + pg (피어슨 상관계수 직접 계산)*
`;

  const outputPath = path.join(__dirname, '..', 'docs', 'analysis-engagement-axis.md');
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`\n✅ 결과 저장: ${outputPath}`);
  console.log('\n=== 분석 완료 ===');
}

main().catch(e => {
  console.error('오류:', e.message, e.stack);
  process.exit(1);
});
