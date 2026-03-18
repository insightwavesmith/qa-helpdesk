#!/usr/bin/env node
/**
 * 소재 전체 재수집 + 동영상 + spend>0 필터 임베딩 스크립트
 *
 * Phase 1.5: OFF 광고 포함 전체 소재 수집, VIDEO thumbnail 임베딩, spend>0 필터
 *
 * Usage: node scripts/reseed-creatives.mjs [--embed-only] [--refresh-urls]
 *   --embed-only    : 소재 수집 스킵, 임베딩만 실행
 *   --refresh-urls  : 기존 row 중 media_url 403인 건 Meta API로 URL 재수집
 *
 * 환경변수: .env.local에서 자동 로드
 *   META_ACCESS_TOKEN, GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const EMBED_ONLY = args.includes("--embed-only");
const REFRESH_URLS = args.includes("--refresh-urls");

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const META_TOKEN = env.META_ACCESS_TOKEN;
const GEMINI_KEY = env.GEMINI_API_KEY;
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const META_API = "https://graph.facebook.com/v21.0";
const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 3072;
const EMBED_DELAY = 400; // ms between embedding calls

if (!META_TOKEN || !GEMINI_KEY || !SB_URL || !SB_KEY) {
  console.error(
    "❌ .env.local에 META_ACCESS_TOKEN, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요"
  );
  process.exit(1);
}

// ━━━ Supabase REST ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function sbUpsert(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

async function sbUpdate(table, matchCol, matchVal, updates) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updates),
    }
  );
  return { ok: res.ok, status: res.status };
}

// ━━━ Meta API ━━━
async function metaFetch(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        const wait = (i + 1) * 3000;
        console.log(`  ⏳ Rate limited, ${wait}ms 대기...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok && i < retries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/**
 * Meta API로 account의 전체 광고 목록 수집 (ON + OFF)
 */
async function fetchAllAdsForAccount(accountId) {
  const cleanId = accountId.replace(/^act_/, "");
  const fields =
    "id,name,effective_status,creative{id,thumbnail_url,image_url,image_hash,body,object_story_spec}";
  let url = `${META_API}/act_${cleanId}/ads?access_token=${META_TOKEN}&fields=${encodeURIComponent(fields)}&limit=500`;

  const allAds = [];
  let page = 1;

  while (url) {
    console.log(`    페이지 ${page}...`);
    const data = await metaFetch(url);
    if (data?.error) {
      console.error(`    ⚠️ Meta API 에러: ${data.error.message}`);
      break;
    }
    if (data?.data) {
      allAds.push(...data.data);
    }
    url = data?.paging?.next || null;
    page++;
    if (url) await new Promise((r) => setTimeout(r, 200));
  }

  return allAds;
}

/**
 * 단일 ad에서 creative detail 추출 (Meta API 응답에서)
 */
function extractCreativeFromAd(ad) {
  const creative = ad.creative || {};
  const storySpec = creative.object_story_spec || {};
  const linkData = storySpec.link_data || {};
  const videoData = storySpec.video_data || {};

  // 이미지 URL: image_url > thumbnail_url
  const imageUrl = creative.image_url || creative.thumbnail_url || null;
  const thumbnailUrl = creative.thumbnail_url || null;

  // LP URL
  const lpUrl =
    linkData.link ||
    linkData.call_to_action?.value?.link ||
    videoData.call_to_action?.value?.link ||
    null;

  // 카피: body > link_data.message > video_data.message
  const adCopy =
    creative.body || linkData.message || videoData.message || null;

  // 미디어 타입: effective_status 기반이 아닌 creative 구조 기반
  const isVideo = !!storySpec.video_data || !!videoData.video_id;
  const mediaType = isVideo ? "VIDEO" : "IMAGE";

  // VIDEO면 thumbnail, IMAGE면 image_url
  const mediaUrl = isVideo ? thumbnailUrl : imageUrl;

  return {
    imageUrl: mediaUrl,
    thumbnailUrl,
    adCopy,
    lpUrl,
    mediaType,
    imageHash: creative.image_hash || null,
    effectiveStatus: ad.effective_status || "UNKNOWN",
    adName: ad.name || null,
  };
}

/**
 * 개별 ad의 creative 상세 조회 (fetchAllAdsForAccount 실패 시 폴백)
 */
async function fetchCreativeDetail(adId) {
  const adUrl = `${META_API}/${adId}?access_token=${META_TOKEN}&fields=creative%7Bid,thumbnail_url,image_url,image_hash,body,object_story_spec%7D,effective_status`;
  const adData = await metaFetch(adUrl);
  if (adData?.error) return null;

  return extractCreativeFromAd(adData);
}

/**
 * image_hash → URL 변환
 */
async function fetchImageUrlByHash(accountId, hash) {
  const cleanId = accountId.replace(/^act_/, "");
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

// ━━━ Gemini 임베딩 ━━━
async function embedText(text) {
  if (!text || text.trim().length < 5) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.log(`    ⚠️ 텍스트 임베딩 실패: ${res.status} ${err.slice(0, 100)}`);
    return null;
  }
  const data = await res.json();
  return data.embedding?.values || null;
}

async function embedImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) {
      console.log(`    ⚠️ 이미지 fetch 실패: ${imgRes.status}`);
      return null;
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.startsWith("image/")
      ? contentType.split(";")[0]
      : "image/jpeg";
    const buf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: {
          parts: [{ inline_data: { mime_type: mimeType, data: base64 } }],
        },
        taskType: "SEMANTIC_SIMILARITY",
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
    console.log(`    ⚠️ 이미지 처리 실패: ${e.message}`);
    return null;
  }
}

// ━━━ Step 1: 전체 소재 수집 ━━━
async function collectAllCreatives() {
  console.log("\n━━━ Step 1: 전체 소재 수집 (ON + OFF) ━━━");

  // 1-1. 고유 account_id 목록
  console.log("  account_id 목록 조회...");
  let allInsights = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/daily_ad_insights?select=account_id&order=account_id&offset=${offset}&limit=1000`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    allInsights = allInsights.concat(batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  const accountIds = [...new Set(allInsights.map((r) => r.account_id).filter(Boolean))];
  console.log(`  고유 account_id: ${accountIds.length}개`);

  // 1-2. 기존 ad_creative_embeddings
  const existing = await sbGet("/ad_creative_embeddings?select=ad_id");
  const existingSet = new Set((existing || []).map((r) => r.ad_id));
  console.log(`  기존 ad_creative_embeddings: ${existingSet.size}건`);

  // 1-3. 각 account에서 Meta API로 전체 광고 수집
  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const accountId of accountIds) {
    const cleanId = accountId.replace(/^act_/, "");
    console.log(`\n  📡 account ${cleanId} 소재 수집...`);

    let ads;
    try {
      ads = await fetchAllAdsForAccount(accountId);
    } catch (e) {
      console.error(`    ❌ Meta API 실패: ${e.message}`);
      continue;
    }
    console.log(`    Meta API 응답: ${ads.length}건`);

    for (const ad of ads) {
      const detail = extractCreativeFromAd(ad);
      const adId = ad.id;

      if (existingSet.has(adId)) {
        totalSkipped++;
        continue;
      }

      // media_url이 없으면 image_hash로 시도
      let mediaUrl = detail.imageUrl;
      if (!mediaUrl && detail.imageHash) {
        mediaUrl = await fetchImageUrlByHash(accountId, detail.imageHash);
      }

      const row = {
        ad_id: adId,
        account_id: cleanId,
        source: "own",
        media_url: mediaUrl,
        media_type: detail.mediaType,
        ad_copy: detail.adCopy,
        lp_url: detail.lpUrl,
        creative_type: detail.mediaType,
        media_hash: detail.imageHash,
        embedding_model: EMBEDDING_MODEL,
        is_active: detail.effectiveStatus === "ACTIVE",
        updated_at: new Date().toISOString(),
      };

      const result = await sbUpsert("ad_creative_embeddings", row);
      if (result.ok) {
        totalNew++;
        existingSet.add(adId);
      } else {
        console.log(`    ❌ DB 저장 실패 ${adId}: ${result.status}`);
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(
    `\n  ✅ 수집 완료: 신규 ${totalNew}, 기존 ${totalSkipped}, 업데이트 ${totalUpdated}`
  );
}

// ━━━ Step 2: 만료 URL 재수집 ━━━
async function refreshExpiredUrls() {
  console.log("\n━━━ Step 2: 만료 URL 재수집 ━━━");

  // embedding_3072 IS NULL이고 media_url이 있는 row
  const rows = await sbGet(
    "/ad_creative_embeddings?select=ad_id,account_id,media_url,media_type&embedding_3072=is.null&media_url=not.is.null&is_active=eq.true&limit=500"
  );
  console.log(`  대상: ${rows.length}건`);

  let refreshed = 0;
  let failed = 0;

  for (const row of rows) {
    // URL이 유효한지 확인
    let isExpired = false;
    try {
      const check = await fetch(row.media_url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (check.status === 403 || check.status === 404) {
        isExpired = true;
      }
    } catch {
      isExpired = true;
    }

    if (!isExpired) continue;

    // Meta API로 최신 URL 재수집
    try {
      const detail = await fetchCreativeDetail(row.ad_id);
      if (detail?.imageUrl || detail?.thumbnailUrl) {
        const newUrl = detail.imageUrl || detail.thumbnailUrl;
        await sbUpdate("ad_creative_embeddings", "ad_id", row.ad_id, {
          media_url: newUrl,
          updated_at: new Date().toISOString(),
        });
        refreshed++;
        process.stdout.write(".");
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n  ✅ URL 재수집: 갱신 ${refreshed}, 실패 ${failed}`);
}

// ━━━ Step 3: spend > 0 필터 + 임베딩 ━━━
async function embedWithSpendFilter() {
  console.log("\n━━━ Step 3: spend > 0 필터 + 임베딩 ━━━");

  // 3-1. daily_ad_insights에서 spend > 0인 ad_id 목록
  console.log("  spend > 0 ad_id 조회...");
  let allSpend = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/daily_ad_insights?select=ad_id,spend&ad_id=not.is.null&spend=gt.0&order=ad_id&offset=${offset}&limit=1000`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    allSpend = allSpend.concat(batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }

  // ad_id별 총 spend 합산
  const spendMap = new Map();
  for (const row of allSpend) {
    if (!row.ad_id) continue;
    spendMap.set(row.ad_id, (spendMap.get(row.ad_id) || 0) + (row.spend || 0));
  }
  const spendAdIds = new Set(
    [...spendMap.entries()].filter(([, v]) => v > 0).map(([k]) => k)
  );
  console.log(`  spend > 0인 ad_id: ${spendAdIds.size}개`);

  // 3-2. embedding_3072 IS NULL인 row
  const rows = await sbGet(
    "/ad_creative_embeddings?select=ad_id,media_url,media_type,ad_copy&embedding_3072=is.null&is_active=eq.true&limit=2000"
  );
  console.log(`  embedding_3072 IS NULL: ${rows.length}건`);

  // spend > 0 필터
  const embedTargets = rows.filter((r) => spendAdIds.has(r.ad_id));
  const skipTargets = rows.filter((r) => !spendAdIds.has(r.ad_id));
  console.log(
    `  임베딩 대상 (spend>0): ${embedTargets.length}건, 스킵 (spend=0): ${skipTargets.length}건`
  );

  let embedded = 0;
  let errors = 0;

  for (let i = 0; i < embedTargets.length; i++) {
    const row = embedTargets[i];
    const progress = `[${i + 1}/${embedTargets.length}]`;

    const updates = {};

    // 이미지 임베딩 (VIDEO는 thumbnail=media_url, IMAGE는 media_url)
    if (row.media_url) {
      const imgVec = await embedImage(row.media_url);
      if (imgVec) {
        updates.embedding_3072 = JSON.stringify(imgVec);
      } else {
        errors++;
      }
    }

    // 텍스트 임베딩
    if (row.ad_copy && row.ad_copy.trim().length > 3) {
      const txtVec = await embedText(row.ad_copy);
      if (txtVec) {
        updates.text_embedding_3072 = JSON.stringify(txtVec);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.embedded_at = new Date().toISOString();
      const result = await sbUpdate(
        "ad_creative_embeddings",
        "ad_id",
        row.ad_id,
        updates
      );
      if (result.ok) {
        embedded++;
        process.stdout.write(".");
      } else {
        errors++;
        console.log(`\n  ${progress} ❌ UPDATE 실패 ${row.ad_id}: ${result.status}`);
      }
    }

    await new Promise((r) => setTimeout(r, EMBED_DELAY));
  }

  console.log(
    `\n  ✅ 임베딩 완료: 성공 ${embedded}, 에러 ${errors}, 총 ${embedTargets.length}`
  );
}

// ━━━ Step 4: 최종 통계 ━━━
async function printStats() {
  console.log("\n━━━ 최종 통계 ━━━");

  const total = await sbGet(
    "/ad_creative_embeddings?select=id&limit=1&offset=0"
  );
  // count query
  const allRows = await sbGet(
    "/ad_creative_embeddings?select=ad_id,media_type,embedding_3072,text_embedding_3072,is_active"
  );

  const stats = {
    total: allRows.length,
    active: allRows.filter((r) => r.is_active).length,
    inactive: allRows.filter((r) => !r.is_active).length,
    video: allRows.filter((r) => r.media_type === "VIDEO").length,
    image: allRows.filter((r) => r.media_type === "IMAGE").length,
    has_embedding_3072: allRows.filter((r) => r.embedding_3072).length,
    has_text_3072: allRows.filter((r) => r.text_embedding_3072).length,
    missing_embedding: allRows.filter((r) => !r.embedding_3072 && r.is_active)
      .length,
  };

  console.log(`  총 소재: ${stats.total}`);
  console.log(`  활성: ${stats.active}, 비활성: ${stats.inactive}`);
  console.log(`  VIDEO: ${stats.video}, IMAGE: ${stats.image}`);
  console.log(`  embedding_3072: ${stats.has_embedding_3072}건`);
  console.log(`  text_embedding_3072: ${stats.has_text_3072}건`);
  console.log(`  임베딩 미완료 (활성): ${stats.missing_embedding}건`);
}

// ━━━ 메인 ━━━
async function main() {
  console.log("🚀 소재 재수집 + 동영상 + spend>0 임베딩 시작");
  console.log(`  모드: ${EMBED_ONLY ? "임베딩만" : "전체"}, URL새로고침: ${REFRESH_URLS ? "YES" : "NO"}`);

  if (!EMBED_ONLY) {
    await collectAllCreatives();
  }

  if (REFRESH_URLS || !EMBED_ONLY) {
    await refreshExpiredUrls();
  }

  await embedWithSpendFilter();
  await printStats();

  console.log("\n🏁 완료!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
