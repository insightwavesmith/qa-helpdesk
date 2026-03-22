#!/usr/bin/env node
/**
 * 수동 수집 스크립트 — 날짜 지정해서 collect-daily 실행
 * 프로덕션 Vercel API를 직접 호출 (CRON_SECRET 인증)
 * 
 * 사용법: node scripts/manual-collect.mjs 2026-03-18 2026-03-19 2026-03-20
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = 'https://bscamp.vercel.app';

if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET 환경변수 필요');
  process.exit(1);
}

const dates = process.argv.slice(2);
if (dates.length === 0) {
  console.error('사용법: node scripts/manual-collect.mjs 2026-03-18 2026-03-19');
  process.exit(1);
}

async function collectDate(date) {
  console.log(`\n📦 ${date} 수집 시작...`);
  const start = Date.now();
  
  try {
    const res = await fetch(`${BASE_URL}/api/cron/collect-daily?date=${date}`, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      signal: AbortSignal.timeout(600_000), // 10분 타임아웃
    });
    
    const data = await res.json();
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    
    if (res.ok) {
      const total = data.results?.reduce((s, r) => s + (r.meta_ads || 0), 0) || 0;
      console.log(`✅ ${date} 완료 (${dur}s) — ${data.accounts}개 계정, ${total}건 광고`);
    } else {
      console.error(`❌ ${date} 실패 (${dur}s):`, data.error || res.status);
    }
    return data;
  } catch (e) {
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`❌ ${date} 에러 (${dur}s):`, e.message);
    return null;
  }
}

// 순차 실행 (동시에 하면 Meta API rate limit)
for (const date of dates) {
  await collectDate(date);
}

console.log('\n🏁 전체 수집 완료');
