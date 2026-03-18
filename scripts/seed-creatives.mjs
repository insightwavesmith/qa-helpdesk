#!/usr/bin/env node
/**
 * 소재 초기 수집 스크립트 — Meta API → ad_creative_embeddings
 * 로컬 실행 전용 (프로덕션 API 대체)
 * 
 * Usage: node scripts/seed-creatives.mjs
 * 
 * 플로우:
 * 1. daily_ad_insights에서 고유 ad_id 추출
 * 2. ad_creative_embeddings에 이미 있는 ad_id 제외
 * 3. Meta Graph API로 소재 상세 (이미지URL, 카피, LP URL) 수집
 * 4. Gemini 임베딩 생성
 * 5. ad_creative_embeddings INSERT
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 파싱
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const META_TOKEN = env.META_ACCESS_TOKEN;
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const META_API = 'https://graph.facebook.com/v21.0';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const DIMENSIONS = 3072;

if (!META_TOKEN || !GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env.local에 META_ACCESS_TOKEN, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

// ── Supabase REST ──
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function sbUpsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

// ── Meta API ──
async function metaFetch(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        const wait = (i + 1) * 3000;
        console.log(`  ⏳ Rate limited, ${wait}ms 대기...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok && i < retries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function fetchCreativeDetail(adId) {
  // Step 1: ad에서 creative id + thumbnail 가져오기
  const adUrl = `${META_API}/${adId}?access_token=${META_TOKEN}&fields=creative%7Bid,thumbnail_url,image_url,image_hash%7D`;
  const adData = await metaFetch(adUrl);
  if (adData?.error) {
    console.log(`  ⚠️ ad 조회 에러: ${adData.error.message}`);
    return null;
  }

  const creativeId = adData?.creative?.id;
  const thumbnailUrl = adData?.creative?.thumbnail_url || null;
  let imageUrl = adData?.creative?.image_url || null;
  let imageHash = adData?.creative?.image_hash || null;

  if (!creativeId) return { imageUrl: imageUrl || thumbnailUrl, imageHash, adCopy: null, lpUrl: null };

  // Step 2: creative id로 직접 조회 (body, link_url 등)
  const creativeUrl = `${META_API}/${creativeId}?access_token=${META_TOKEN}&fields=body,image_url,thumbnail_url,image_hash,link_url,object_story_spec`;
  const cData = await metaFetch(creativeUrl);
  if (cData?.error) {
    return { imageUrl: imageUrl || thumbnailUrl, imageHash, adCopy: null, lpUrl: null };
  }

  // creative 직접 조회 결과에서 추출
  imageUrl = imageUrl || cData?.image_url || cData?.thumbnail_url || thumbnailUrl;
  imageHash = imageHash || cData?.image_hash || null;
  
  // LP URL: link_url 또는 object_story_spec.link_data.link
  const storySpec = cData?.object_story_spec || {};
  const linkData = storySpec.link_data || {};
  const lpUrl = cData?.link_url || linkData.link || linkData.call_to_action?.value?.link || null;

  // 카피: body 또는 link_data.message
  const adCopy = cData?.body || linkData.message || null;

  return { imageUrl, imageHash, adCopy, lpUrl };
}

async function fetchImageUrlByHash(accountId, hash) {
  const cleanId = accountId.replace(/^act_/, '');
  const url = `${META_API}/act_${cleanId}/adimages?access_token=${META_TOKEN}&hashes=${JSON.stringify([hash])}&fields=url_128,url,hash`;
  try {
    const data = await metaFetch(url);
    if (data?.data?.[0]) return data.data[0].url || data.data[0].url_128 || null;
    if (data?.images) {
      const img = Object.values(data.images)[0];
      return img?.url || img?.url_128 || null;
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Gemini 임베딩 ──
async function embedText(text) {
  if (!text || text.trim().length < 5) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: DIMENSIONS,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedding?.values || null;
}

async function embedImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    // fetch image → base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';
    const buf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ inline_data: { mime_type: mimeType, data: base64 } }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: DIMENSIONS,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`    ⚠️ 이미지 임베딩 실패: ${res.status} ${err.slice(0, 100)}`);
      return null;
    }
    const data = await res.json();
    return data.embedding?.values || null;
  } catch (e) {
    console.log(`    ⚠️ 이미지 fetch 실패: ${e.message}`);
    return null;
  }
}

// ── 메인 ──
async function main() {
  console.log('🔍 daily_ad_insights에서 고유 ad_id 추출...');
  
  // Supabase REST는 1000개 제한 → offset으로 반복
  let allInsights = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const batch = await sbGet(
      `/daily_ad_insights?select=ad_id,ad_name,account_id,creative_type&ad_id=not.is.null&order=date.desc&offset=${offset}&limit=${PAGE}`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    allInsights = allInsights.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  // 고유 ad_id
  const adMap = new Map();
  for (const row of allInsights) {
    if (row.ad_id && !adMap.has(row.ad_id)) {
      adMap.set(row.ad_id, row);
    }
  }
  console.log(`  총 ${allInsights.length}행 → ${adMap.size}개 고유 ad_id`);

  // 이미 있는 ad_id 확인
  const existing = await sbGet('/ad_creative_embeddings?select=ad_id');
  const existingSet = new Set((existing || []).map(r => r.ad_id));
  
  const newAds = [...adMap.values()].filter(ad => !existingSet.has(ad.ad_id));
  console.log(`  이미 존재: ${existingSet.size}개, 신규: ${newAds.length}개`);

  if (newAds.length === 0) {
    console.log('✅ 시드할 새 소재 없음');
    return;
  }

  let seeded = 0;
  let embedded = 0;
  let errors = 0;

  for (let i = 0; i < newAds.length; i++) {
    const ad = newAds[i];
    console.log(`\n[${i + 1}/${newAds.length}] ad_id=${ad.ad_id}`);

    // 1. Meta API 소재 상세
    let detail = null;
    try {
      detail = await fetchCreativeDetail(ad.ad_id);
    } catch (e) {
      console.log(`  ⚠️ Meta API 실패: ${e.message}`);
    }

    let imageUrl = detail?.imageUrl || null;
    
    // image_hash → URL 변환
    if (!imageUrl && detail?.imageHash && ad.account_id) {
      imageUrl = await fetchImageUrlByHash(ad.account_id, detail.imageHash);
    }

    // 2. row 구성
    const row = {
      ad_id: ad.ad_id,
      account_id: (ad.account_id || '').replace(/^act_/, ''),
      source: 'own',
      media_url: imageUrl,
      media_type: ad.creative_type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      ad_copy: detail?.adCopy || null,
      lp_url: detail?.lpUrl || null,
      creative_type: ad.creative_type || null,
      media_hash: detail?.imageHash || null,
      embedding_model: EMBEDDING_MODEL,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // 3. 이미지 임베딩
    if (imageUrl) {
      const imgEmb = await embedImage(imageUrl);
      if (imgEmb) {
        row.embedding = JSON.stringify(imgEmb);
        embedded++;
        console.log(`  ✅ 이미지 임베딩 완료`);
      }
    }

    // 4. 텍스트 임베딩
    if (detail?.adCopy) {
      const txtEmb = await embedText(detail.adCopy);
      if (txtEmb) {
        row.text_embedding = JSON.stringify(txtEmb);
        console.log(`  ✅ 텍스트 임베딩 완료`);
      }
    }

    // 5. Upsert
    const result = await sbUpsert('ad_creative_embeddings', row);
    if (result.ok) {
      seeded++;
      console.log(`  💾 DB 저장 완료 (이미지: ${imageUrl ? '✅' : '❌'}, 카피: ${detail?.adCopy ? '✅' : '❌'}, LP: ${detail?.lpUrl ? '✅' : '❌'})`);
    } else {
      errors++;
      console.log(`  ❌ DB 저장 실패: ${result.status}`);
    }

    // Rate limit 대비 딜레이
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n━━━ 결과 ━━━`);
  console.log(`시드: ${seeded} / 임베딩: ${embedded} / 실패: ${errors} / 총: ${newAds.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
