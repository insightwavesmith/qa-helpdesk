'use strict';
/**
 * Creative Pipeline — DeepGaze 시선 분석 서버
 * GCP Cloud Run 배포용 (Railway에서 이관)
 *
 * 활성 엔드포인트:
 *   GET  /health         — 헬스 체크
 *   POST /saliency       — 소재 이미지 시선 분석 (DeepGaze)
 *   POST /lp-saliency    — LP 스크린샷 시선 분석
 *   POST /video-saliency — 영상 프레임별 시선 분석
 *   POST /pipeline       — saliency 3종 순차 실행
 *
 * 제거된 엔드포인트 (Cloud Run Jobs로 이관됨):
 *   /analyze    → bscamp-analyze-five-axis
 *   /benchmark  → bscamp-score-percentiles
 *   /score      → bscamp-score-percentiles
 */

const express = require('express');
const { execFile } = require('child_process');
const app = express();
app.use(express.json());

const GIT_SHA = process.env.GIT_SHA || 'unknown';
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
  res.json({ status: 'ok', version: GIT_SHA.slice(0, 7), timestamp: new Date().toISOString() });
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

// ━━━ POST /saliency — 소재 이미지 시선 예측 ━━━
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

// ━━━ runLpSaliency 헬퍼 (Python subprocess) ━━━
function runLpSaliency({ limit, accountId }) {
  return new Promise((resolve, reject) => {
    const args = ['saliency/predict_lp.py', '--limit', String(limit)];
    if (accountId) args.push('--account-id', accountId);
    execFile('python3', args, { cwd: '/app', timeout: 1800000 }, (err, stdout, stderr) => {
      if (stderr) console.error('[lp-saliency stderr]', stderr.slice(-500));
      if (err) return reject(err);
      try {
        const lastLine = stdout.trim().split('\n').pop();
        resolve(JSON.parse(lastLine));
      } catch (parseErr) {
        reject(new Error(`lp-saliency stdout parse error: ${stdout.slice(-200)}`));
      }
    });
  });
}

// ━━━ POST /lp-saliency — LP 스크린샷 시선 예측 ━━━
app.post('/lp-saliency', auth, async (req, res) => {
  try {
    const { limit = 9999, accountId = null } = req.body || {};
    console.log(`[/lp-saliency] limit=${limit}, accountId=${accountId || '전체'}`);
    const result = await runLpSaliency({ limit, accountId });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/lp-saliency] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ runVideoSaliency 헬퍼 (Python subprocess) ━━━
function runVideoSaliency({ limit, accountId, maxFrames }) {
  return new Promise((resolve, reject) => {
    const args = ['saliency/predict_video_frames.py', '--limit', String(limit)];
    if (accountId) args.push('--account-id', accountId);
    if (maxFrames) args.push('--max-frames', String(maxFrames));
    execFile('python3', args, { cwd: '/app', timeout: 3600000 }, (err, stdout, stderr) => {
      if (stderr) console.error('[video-saliency stderr]', stderr.slice(-500));
      if (err) return reject(err);
      try {
        const lastLine = stdout.trim().split('\n').pop();
        resolve(JSON.parse(lastLine));
      } catch (parseErr) {
        reject(new Error(`video-saliency stdout parse error: ${stdout.slice(-200)}`));
      }
    });
  });
}

// ━━━ POST /video-saliency — 영상 프레임별 시선 예측 ━━━
app.post('/video-saliency', auth, async (req, res) => {
  try {
    const { limit = 10, accountId = null, maxFrames = 30 } = req.body || {};
    console.log(`[/video-saliency] limit=${limit}, accountId=${accountId || '전체'}, maxFrames=${maxFrames}`);
    const result = await runVideoSaliency({ limit, accountId, maxFrames });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/video-saliency] 에러:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ━━━ POST /pipeline — saliency 3종 순차 실행 ━━━
app.post('/pipeline', auth, async (req, res) => {
  try {
    const { limit, accountId } = req.body || {};
    console.log('[/pipeline] 시작 — saliency → lp-saliency → video-saliency');

    // 1. 소재 이미지 시선 분석
    console.log('[/pipeline] saliency 시작...');
    let saliencyResult = null;
    try {
      saliencyResult = await runSaliency({ limit: limit ?? 9999, accountId: accountId ?? null });
      console.log('[/pipeline] saliency 완료:', saliencyResult);
    } catch (e) {
      console.error('[/pipeline] saliency 실패 (무시):', e.message);
    }

    // 2. LP 시선 분석
    console.log('[/pipeline] lp-saliency 시작...');
    let lpResult = null;
    try {
      lpResult = await runLpSaliency({ limit: limit ?? 9999, accountId: accountId ?? null });
      console.log('[/pipeline] lp-saliency 완료:', lpResult);
    } catch (e) {
      console.error('[/pipeline] lp-saliency 실패 (무시):', e.message);
    }

    console.log('[/pipeline] 파이프라인 완료');
    res.json({
      ok: true,
      saliency: saliencyResult,
      lpSaliency: lpResult,
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
