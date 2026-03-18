'use strict';
/**
 * Creative Intelligence Pipeline — Express 서버
 * Railway 배포용
 */

const express = require('express');
const { execFile } = require('child_process');
const app = express();
app.use(express.json());

const API_SECRET = process.env.API_SECRET || '';

// ━━━ 인증 미들웨어 ━━━
function auth(req, res, next) {
  if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ━━━ 헬스 체크 (인증 없음) ━━━
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ━━━ POST /analyze — L1 소재 요소 태깅 ━━━
app.post('/analyze', auth, async (req, res) => {
  try {
    const { runAnalyze } = await import('./analyze.mjs');
    const { limit = 9999, accountId = null } = req.body || {};
    console.log(`[/analyze] limit=${limit}, accountId=${accountId || '전체'}`);
    const result = await runAnalyze({ limit, accountId });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/analyze] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ runSaliency 헬퍼 (Python subprocess) ━━━
function runSaliency({ limit, accountId }) {
  return new Promise((resolve, reject) => {
    const args = ['saliency/predict.py', '--limit', String(limit)];
    if (accountId) args.push('--account-id', accountId);
    execFile('python3', args, { cwd: '/app', timeout: 1800000 }, (err, stdout, stderr) => {
      if (stderr) console.error('[saliency stderr]', stderr.slice(-500));
      if (err) return reject(err);
      try {
        const lastLine = stdout.trim().split('\n').pop();
        resolve(JSON.parse(lastLine));
      } catch (parseErr) {
        reject(new Error(`saliency stdout parse error: ${stdout.slice(-200)}`));
      }
    });
  });
}

// ━━━ POST /saliency — L2 시선 예측 ━━━
app.post('/saliency', auth, async (req, res) => {
  try {
    const { limit = 9999, accountId = null } = req.body || {};
    console.log(`[/saliency] limit=${limit}, accountId=${accountId || '전체'}`);
    const result = await runSaliency({ limit, accountId });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/saliency] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ POST /benchmark — L3 벤치마크 계산 ━━━
app.post('/benchmark', auth, async (req, res) => {
  try {
    const { runBenchmark } = await import('./benchmark.mjs');
    const { dryRun = false } = req.body || {};
    console.log(`[/benchmark] dryRun=${dryRun}`);
    const result = await runBenchmark({ dryRun });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/benchmark] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ POST /score — L4 종합 점수 + 제안 ━━━
app.post('/score', auth, async (req, res) => {
  try {
    const { runScore } = await import('./score.mjs');
    const { limit = 999, accountId = null } = req.body || {};
    console.log(`[/score] limit=${limit}, accountId=${accountId || '전체'}`);
    const result = await runScore({ limit, accountId });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/score] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ POST /pipeline — L1 → L2 → L3 → L4 순차 실행 ━━━
app.post('/pipeline', auth, async (req, res) => {
  try {
    const { runAnalyze } = await import('./analyze.mjs');
    const { runBenchmark } = await import('./benchmark.mjs');
    const { runScore } = await import('./score.mjs');

    const { limit, accountId } = req.body || {};
    console.log('[/pipeline] 시작 — L1 → L2 → L3 → L4');

    // L1: 소재 요소 태깅
    console.log('[/pipeline] L1 analyze 시작...');
    const analyzeResult = await runAnalyze({
      limit: limit ?? 9999,
      accountId: accountId ?? null,
    });
    console.log('[/pipeline] L1 완료:', analyzeResult);

    // L2: 시선 예측 (IMAGE 소재만, optional)
    console.log('[/pipeline] L2 saliency 시작...');
    let saliencyResult = null;
    try {
      saliencyResult = await runSaliency({ limit: limit ?? 9999, accountId: accountId ?? null });
      console.log('[/pipeline] L2 완료:', saliencyResult);
    } catch (l2err) {
      console.error('[/pipeline] L2 실패 (무시), L3 계속:', l2err.message);
    }

    // L3: 벤치마크 계산
    console.log('[/pipeline] L3 benchmark 시작...');
    const benchmarkResult = await runBenchmark({ dryRun: false });
    console.log('[/pipeline] L3 완료:', benchmarkResult);

    // L4: 종합 점수 + 제안
    console.log('[/pipeline] L4 score 시작...');
    const scoreResult = await runScore({
      limit: limit ?? 999,
      accountId: accountId ?? null,
    });
    console.log('[/pipeline] L4 완료:', scoreResult);

    console.log('[/pipeline] 파이프라인 완료');
    res.json({
      ok: true,
      analyze: analyzeResult,
      saliency: saliencyResult,
      benchmark: benchmarkResult,
      score: scoreResult,
    });
  } catch (e) {
    console.error('[/pipeline] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ 서버 시작 ━━━
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`creative-pipeline listening on ${PORT}`);
});
