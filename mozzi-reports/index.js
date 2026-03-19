'use strict';
/**
 * 모찌 리포트 — 정적 HTML 리포트 서버
 * Railway 배포용 (magnificent-appreciation)
 */

const express = require('express');
const path = require('path');
const app = express();

// 정적 파일 서빙 (public/ 하위의 HTML 리포트)
app.use('/reports', express.static(path.join(__dirname, 'public', 'reports')));

// 헬스 체크
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mozzi-reports', timestamp: new Date().toISOString() });
});

// 루트 → 리포트 목록
app.get('/', (_req, res) => {
  const fs = require('fs');
  const reportsDir = path.join(__dirname, 'public', 'reports', 'review');
  let files = [];
  try {
    files = fs.readdirSync(reportsDir)
      .filter(f => f.endsWith('.html'))
      .sort()
      .reverse();
  } catch { /* 디렉토리 없으면 빈 목록 */ }

  const links = files.map(f =>
    `<li><a href="/reports/review/${f}">${f.replace('.html', '')}</a></li>`
  ).join('\n');

  res.send(`<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>모찌 리포트</title>
<style>body{font-family:Pretendard,sans-serif;max-width:720px;margin:40px auto;padding:0 20px}
a{color:#F75D5D}h1{font-size:1.5rem}</style></head>
<body><h1>모찌 리포트</h1><ul>${links || '<li>리포트 없음</li>'}</ul></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`mozzi-reports listening on ${PORT}`);
});
