#!/usr/bin/env node
/**
 * 로컬 임베딩 스크립트
 * - embedding_3072 또는 text_embedding_3072가 없는 소재를 찾아서 임베딩
 * - Gemini Embedding API 사용
 * - 타임아웃 제한 없음 (로컬 실행)
 * - 배치 처리 + rate limit 대응
 * 
 * 사용법: node scripts/local-embed.mjs [--batch 100] [--delay 300]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-2-preview';

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY 필요');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// CLI 파라미터 파싱
const args = process.argv.slice(2);
const BATCH_SIZE = parseInt(args[args.indexOf('--batch') + 1]) || 100;
const DELAY_MS = parseInt(args[args.indexOf('--delay') + 1]) || 300;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Gemini 임베딩 API 호출 ──
async function generateEmbedding(input, taskType = 'SEMANTIC_SIMILARITY') {
  const isImage = typeof input === 'object' && input.imageUrl;
  
  const content = isImage
    ? { parts: [{ inlineData: await fetchImageBase64(input.imageUrl) }] }
    : { parts: [{ text: input }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${EMBEDDING_MODEL}`, content, taskType }),
      });

      if (res.status === 429) {
        const wait = Math.min(30000, (attempt + 1) * 5000);
        console.log(`  ⏳ Rate limited, ${wait/1000}s 대기...`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini API ${res.status}: ${text.substring(0, 200)}`);
      }

      const data = await res.json();
      return data.embedding?.values || null;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(2000);
    }
  }
}

// ── 이미지 URL → base64 ──
async function fetchImageBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mime = res.headers.get('content-type') || 'image/jpeg';
  return { mimeType: mime, data: base64 };
}

// ── 메인 ──
async function main() {
  console.log('🔄 로컬 임베딩 시작');
  console.log(`   배치: ${BATCH_SIZE}건, 딜레이: ${DELAY_MS}ms`);
  console.log(`   모델: ${EMBEDDING_MODEL}`);
  console.log('');

  let totalProcessed = 0;
  let totalEmbedded = 0;
  let totalErrors = 0;
  let round = 0;

  while (true) {
    round++;
    // embedding_3072 또는 text_embedding_3072가 없는 소재 조회 (active/inactive 모두)
    // media_url 또는 ad_copy가 있는 것만 (임베딩 가능한 것만)
    // embedding_model이 'skip:' 시작하는 건 제외 (접근 불가 이미지)
    const { data: rows, error } = await sb
      .from('ad_creative_embeddings')
      .select('id, ad_id, media_url, ad_copy, embedding_3072, text_embedding_3072, embedding_model')
      .or('and(embedding_3072.is.null,media_url.not.is.null),and(text_embedding_3072.is.null,ad_copy.not.is.null)')
      .not('embedding_model', 'like', 'skip:%')
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌ DB 조회 실패:', error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('✅ 모든 소재 임베딩 완료!');
      break;
    }

    console.log(`📦 라운드 ${round}: ${rows.length}건 처리`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const updates = {};
      let embedded = false;

      // 이미지 임베딩
      if (!row.embedding_3072 && row.media_url) {
        try {
          const emb = await generateEmbedding({ imageUrl: row.media_url });
          if (emb) {
            updates.embedding_3072 = emb;
            embedded = true;
          }
        } catch (e) {
          const msg = e.message || '';
          if (msg.includes('403') || msg.includes('404')) {
            // CDN 만료 이미지 → media_url을 null로 → 다음 쿼리에서 안 잡힘
            updates.media_url = null;
            console.log(`  ⏭️ 이미지 접근 불가 [${row.ad_id}] — media_url null 처리`);
          } else {
            console.error(`  ❌ 이미지 임베딩 실패 [${row.ad_id}]:`, msg.substring(0, 100));
          }
          totalErrors++;
        }
      }

      // 텍스트 임베딩
      if (!row.text_embedding_3072 && row.ad_copy && row.ad_copy.trim().length > 5) {
        try {
          const emb = await generateEmbedding(row.ad_copy);
          if (emb) {
            updates.text_embedding_3072 = emb;
            embedded = true;
          }
        } catch (e) {
          console.error(`  ❌ 텍스트 임베딩 실패 [${row.ad_id}]:`, e.message?.substring(0, 100));
          totalErrors++;
        }
      }

      // DB 업데이트
      if (Object.keys(updates).length > 0) {
        updates.embedded_at = new Date().toISOString();
        // skip 표시된 건 embedding_model 덮어쓰지 않음
        if (!updates.embedding_model?.startsWith('skip:')) {
          updates.embedding_model = EMBEDDING_MODEL;
        }
        const { error: upErr } = await sb
          .from('ad_creative_embeddings')
          .update(updates)
          .eq('id', row.id);
        
        if (upErr) {
          console.error(`  ❌ DB 업데이트 실패 [${row.ad_id}]:`, upErr.message);
          totalErrors++;
        } else if (embedded) {
          totalEmbedded++;
        }
      }

      totalProcessed++;

      // 진행상황 (10건마다)
      if (totalProcessed % 10 === 0) {
        console.log(`  📊 ${totalProcessed}건 처리 / ${totalEmbedded}건 임베딩 / ${totalErrors}건 에러`);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log('');
  console.log('═══════════════════════════════');
  console.log(`✅ 완료: ${totalProcessed}건 처리`);
  console.log(`   임베딩: ${totalEmbedded}건`);
  console.log(`   에러: ${totalErrors}건`);
  console.log('═══════════════════════════════');
}

main().catch(e => {
  console.error('💥 치명적 에러:', e);
  process.exit(1);
});
