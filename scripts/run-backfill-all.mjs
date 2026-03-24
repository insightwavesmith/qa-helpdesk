#!/usr/bin/env node
/**
 * run-backfill-all.mjs — 전체 계정 backfill (계정 1개씩 순차)
 * 
 * 사용법: node scripts/run-backfill-all.mjs [days]
 * 기본: 90일
 * 
 * 각 계정별로 POST /api/admin/protractor/collect (backfill 모드)
 * SSE 스트리밍으로 진행 상태 출력
 * 계정 간 5초 딜레이 (rate limit)
 */

import 'dotenv/config';

const BASE_URL = process.env.BACKFILL_URL || 'https://bscamp.vercel.app';
const CRON_SECRET = process.env.CRON_SECRET;
const DAYS = parseInt(process.argv[2] || '90', 10);

if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET 환경변수 필요');
  process.exit(1);
}

// Active 계정 목록 (Cloud SQL에서 조회)
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수 필요');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function getActiveAccounts() {
  const { rows } = await pool.query(
    "SELECT account_id, account_name FROM ad_accounts WHERE active = true ORDER BY account_name"
  );
  return rows;
}

async function backfillAccount(accountId, accountName, days) {
  console.log(`\n🔄 [${accountName}] ${accountId} — ${days}일 backfill 시작...`);
  
  const res = await fetch(`${BASE_URL}/api/admin/protractor/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({
      mode: 'backfill',
      accountIds: [accountId],
      days,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ HTTP ${res.status}: ${text}`);
    return false;
  }

  // SSE 스트리밍 읽기
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastAds = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'day_complete') {
          lastAds += data.ads || 0;
          // 10일마다 출력 (너무 많은 로그 방지)
          const dayNum = DAYS - Math.floor((new Date() - new Date(data.date)) / 86400000);
          if (dayNum % 10 === 0 || data.ads > 0) {
            process.stdout.write(`  📅 ${data.date} — ${data.ads}건\n`);
          }
        } else if (data.type === 'day_error') {
          console.error(`  ⚠️ ${data.date} 에러: ${data.error}`);
        } else if (data.type === 'backfill_complete') {
          console.log(`  ✅ 완료 — 성공: ${data.successDays}일, 실패: ${data.failedDays}일, 총 ${lastAds}건`);
        }
      } catch (e) {
        // JSON 파싱 실패 무시
      }
    }
  }

  return true;
}

async function main() {
  const accounts = await getActiveAccounts();
  console.log(`📊 Active 계정 ${accounts.length}개 × ${DAYS}일 backfill`);
  console.log(`🌐 대상: ${BASE_URL}`);
  console.log('');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < accounts.length; i++) {
    const { account_id, account_name } = accounts[i];
    console.log(`[${i + 1}/${accounts.length}]`);
    
    try {
      const ok = await backfillAccount(account_id, account_name || account_id, DAYS);
      if (ok) success++;
      else failed++;
    } catch (e) {
      console.error(`  ❌ ${account_name}: ${e.message}`);
      failed++;
    }

    // 계정 간 5초 딜레이
    if (i < accounts.length - 1) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n🏁 전체 완료 — 성공: ${success}, 실패: ${failed}`);
  pool.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  pool.end();
  process.exit(1);
});
