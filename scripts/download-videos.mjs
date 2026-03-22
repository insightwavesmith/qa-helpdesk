#!/usr/bin/env node
/**
 * 영상 mp4 다운로드 → Supabase Storage 업로드
 *
 * 흐름:
 *   1. creative_media(VIDEO) 조회 → 폴백: ad_creative_embeddings
 *   2. account_id별 그룹화
 *   3. account별 GET /act_{account_id}/ads?fields=creative{object_story_spec}
 *      → object_story_spec.video_data.video_id (story_video_id) 추출
 *   4. GET /{story_video_id}?fields=source,length → source URL 획득
 *   5. mp4 다운로드 → /tmp/videos/{ad_id}.mp4
 *   6. Supabase Storage PUT → creatives/video/{ad_id}.mp4
 *   7. creative_media PATCH (storage_url, duration_seconds, file_size)
 *   8. 임시 파일 삭제
 *
 * Usage:
 *   node scripts/download-videos.mjs
 *   node scripts/download-videos.mjs --dry-run
 *   node scripts/download-videos.mjs --limit 10
 *   node scripts/download-videos.mjs --account 123456789
 */

import { readFileSync } from "fs";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────
// CLI 옵션 파싱
// ──────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;
const ACCOUNT_IDX = process.argv.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;

// ──────────────────────────────────────────────
// .env.local 파싱 (normalize-lps.mjs 패턴)
// ──────────────────────────────────────────────
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const META_TOKEN = env.META_ACCESS_TOKEN;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!META_TOKEN) {
  console.error("META_ACCESS_TOKEN 필요");
  process.exit(1);
}

const TMP_DIR = "/tmp/videos";
const STORAGE_BUCKET = "creatives";
const META_API_BASE = "https://graph.facebook.com/v22.0";
const RATE_LIMIT_DELAY_MS = 100;
const RATE_LIMIT_RETRY_DELAY_MS = 200;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5분
const MAX_RETRIES = 2;

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatBytes(bytes) {
  if (!bytes) return "?";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ──────────────────────────────────────────────
// Supabase REST 헬퍼
// ──────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status };
}

// ──────────────────────────────────────────────
// Meta Graph API 헬퍼 (rate limit + 재시도)
// ──────────────────────────────────────────────
async function metaGet(path, retries = MAX_RETRIES) {
  await sleep(RATE_LIMIT_DELAY_MS);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `${META_API_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${META_TOKEN}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        const code = data.error.code;
        // Rate limit 에러 코드: 17(app rate limit), 4(app request limit), 32(page rate limit), 613(custom tier rate limit)
        if ([17, 4, 32, 613].includes(code) && attempt < retries) {
          console.warn(`\n  [Rate Limit] ${data.error.message} — ${RATE_LIMIT_RETRY_DELAY_MS}ms 후 재시도`);
          await sleep(RATE_LIMIT_RETRY_DELAY_MS);
          continue;
        }
        throw new Error(`Meta API 에러 (code ${code}): ${data.error.message}`);
      }

      return data;
    } catch (err) {
      if (attempt < retries) {
        await sleep(RATE_LIMIT_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

// ──────────────────────────────────────────────
// mp4 다운로드 → /tmp/videos/{ad_id}.mp4
// ──────────────────────────────────────────────
async function downloadVideo(sourceUrl, destPath) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    await writeFile(destPath, Buffer.from(arrayBuffer));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ──────────────────────────────────────────────
// Supabase Storage PUT
// ──────────────────────────────────────────────
async function uploadToStorage(localPath, storagePath) {
  const fileBuffer = readFileSync(localPath);
  const res = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage 업로드 실패 (${res.status}): ${text}`);
  }
  return `${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

// ──────────────────────────────────────────────
// main
// ──────────────────────────────────────────────
async function main() {
  console.log(
    `영상 다운로드 → Storage 업로드 시작` +
      (DRY_RUN ? " (dry-run)" : "") +
      (FILTER_ACCOUNT ? ` [account: ${FILTER_ACCOUNT}]` : "") +
      (LIMIT ? ` [limit: ${LIMIT}]` : "")
  );

  // /tmp/videos 디렉토리 생성
  await mkdir(TMP_DIR, { recursive: true });

  // ────────────────────────────────────────────
  // 1. DB 조회: creative_media (VIDEO)
  // ────────────────────────────────────────────
  let rows = [];
  let useCreativeMedia = true;

  console.log("\n  creative_media에서 VIDEO 조회 중...");
  try {
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const batch = await sbGet(
        `/creative_media?select=id,creative_id,media_url,storage_url,thumbnail_url,creatives!inner(ad_id,account_id)` +
          `&media_type=eq.VIDEO&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
      );
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.log(`  creative_media: ${rows.length}건`);
  } catch (err) {
    console.warn(`  creative_media 조회 실패: ${err.message}`);
    rows = [];
  }

  // ────────────────────────────────────────────
  // 1b. 폴백: creative_media 비어있으면 ad_creative_embeddings 조회
  // ────────────────────────────────────────────
  if (rows.length === 0) {
    console.log("  creative_media 비어있음 — ad_creative_embeddings 폴백 조회...");
    useCreativeMedia = false;
    const PAGE_SIZE = 1000;
    let offset = 0;
    const fallbackRows = [];
    while (true) {
      const batch = await sbGet(
        `/ad_creative_embeddings?select=ad_id,account_id,media_url&media_type=eq.VIDEO` +
          `&order=ad_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
      );
      fallbackRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    // 폴백 행을 creative_media 형식으로 정규화
    rows = fallbackRows.map((r) => ({
      id: null,
      creative_id: null,
      media_url: r.media_url,
      storage_url: null,
      thumbnail_url: null,
      creatives: { ad_id: r.ad_id, account_id: r.account_id },
    }));
    console.log(`  ad_creative_embeddings 폴백: ${rows.length}건`);
  }

  // ────────────────────────────────────────────
  // 2. account_id 필터
  // ────────────────────────────────────────────
  if (FILTER_ACCOUNT) {
    rows = rows.filter((r) => String(r.creatives?.account_id) === String(FILTER_ACCOUNT));
    console.log(`  account 필터 후: ${rows.length}건`);
  }

  // storage_url이 이미 있는 건 스킵
  const pending = rows.filter((r) => !r.storage_url);
  console.log(`  처리 대상 (storage_url 없음): ${pending.length}건 / 전체: ${rows.length}건`);

  // limit 적용
  const toProcess = LIMIT && LIMIT > 0 ? pending.slice(0, LIMIT) : pending;
  const total = toProcess.length;
  console.log(`\n처리 예정: ${total}건\n`);

  if (total === 0) {
    console.log("처리할 영상이 없습니다.");
    return;
  }

  // ────────────────────────────────────────────
  // 3. account_id별 그룹화 → 배치 prefetch
  // ────────────────────────────────────────────
  const accountGroups = new Map(); // account_id → [rows]
  for (const row of toProcess) {
    const acct = row.creatives?.account_id;
    if (!acct) continue;
    if (!accountGroups.has(acct)) accountGroups.set(acct, []);
    accountGroups.get(acct).push(row);
  }
  console.log(`  계정 수: ${accountGroups.size}개\n`);

  // ad_id → story_video_id (object_story_spec.video_data.video_id)
  // 이 video_id는 직접 /{id}?fields=source 조회 가능 (권한 OK)
  const adStoryVideoMap = new Map(); // ad_id → story_video_id

  for (const [accountId, _rows] of accountGroups) {
    console.log(`\n── 계정 ${accountId} (${_rows.length}건) ──`);

    // 3a. GET /act_{account_id}/ads → ad_id↔story_video_id 매핑
    // creative{object_story_spec}에서 video_data.video_id 추출
    console.log(`  ads → story_video_id 매핑 조회 중...`);
    try {
      let after = null;
      let adCount = 0;
      let mapped = 0;
      while (true) {
        const paging = after ? `&after=${after}` : "";
        const data = await metaGet(
          `/act_${accountId}/ads?fields=id,creative{object_story_spec}&limit=100${paging}`
        );
        const ads = data?.data || [];
        for (const ad of ads) {
          const oss = ad?.creative?.object_story_spec;
          const storyVid = oss?.video_data?.video_id;
          if (ad.id && storyVid) {
            adStoryVideoMap.set(ad.id, storyVid);
            mapped++;
          }
        }
        adCount += ads.length;
        after = data?.paging?.cursors?.after;
        if (!after || ads.length === 0) break;
      }
      console.log(`  ads: ${adCount}건 조회, story_video 매핑: ${mapped}건 (누적 ${adStoryVideoMap.size}건)`);
    } catch (err) {
      console.warn(`  ⚠ ads 매핑 조회 실패: ${err.message}`);
    }
  }

  console.log(`\n━━━ Prefetch 완료: story_video 매핑 ${adStoryVideoMap.size}건 ━━━\n`);

  // ────────────────────────────────────────────
  // 통계
  // ────────────────────────────────────────────
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const adId = row.creatives?.ad_id;
    const creativeId = row.creative_id;
    const prefix = `[${i + 1}/${total}]`;

    if (!adId) {
      console.log(`${prefix} ⚠ ad_id 없음 — 스킵`);
      skipCount++;
      continue;
    }

    // ──────────────────────────────────────────
    // 4. story_video_id로 source URL 조회
    // ──────────────────────────────────────────
    let storyVideoId = adStoryVideoMap.get(adId);

    // 배치 매핑에 없으면 개별 ad 조회 fallback
    if (!storyVideoId) {
      try {
        const adData = await metaGet(`/${adId}?fields=creative{object_story_spec}`);
        storyVideoId = adData?.creative?.object_story_spec?.video_data?.video_id;
        if (storyVideoId) adStoryVideoMap.set(adId, storyVideoId);
      } catch (_) {
        // 개별 조회도 실패
      }
    }

    if (!storyVideoId) {
      console.log(`${prefix} ⚠ ${adId} — story_video_id 없음 — 스킵`);
      skipCount++;
      continue;
    }

    // story_video_id로 직접 source URL 조회 (권한 OK)
    let sourceUrl = null;
    let videoLength = null;
    try {
      const vData = await metaGet(`/${storyVideoId}?fields=source,length`);
      if (vData?.source) {
        sourceUrl = vData.source;
        videoLength = vData.length ?? null;
      }
    } catch (_) {
      // 조회 실패
    }

    if (!sourceUrl) {
      console.log(`${prefix} ⚠ ${adId} — video ${storyVideoId} source 없음 — 스킵`);
      skipCount++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `${prefix} [dry-run] ${adId} — story_video=${storyVideoId}` +
          `, length=${videoLength ?? "?"}s`
      );
      successCount++;
      continue;
    }

    // ──────────────────────────────────────────
    // 5. mp4 다운로드
    // ──────────────────────────────────────────
    const localPath = `${TMP_DIR}/${adId}.mp4`;
    process.stdout.write(`${prefix} ⬇ ${adId} ...`);

    try {
      await downloadVideo(sourceUrl, localPath);
      const fileStat = await stat(localPath);
      const fileSize = fileStat.size;
      process.stdout.write(` ${formatBytes(fileSize)}`);

      // ──────────────────────────────────────────
      // 6. Supabase Storage 업로드 ({account_id}/video/{ad_id}.mp4)
      // ──────────────────────────────────────────
      const accountId = row.creatives?.account_id;
      process.stdout.write(` ... ⬆ Storage`);
      const storagePath = `${accountId}/video/${adId}.mp4`;
      const publicUrl = await uploadToStorage(localPath, storagePath);

      // ──────────────────────────────────────────
      // 7. DB 업데이트
      // ──────────────────────────────────────────
      if (useCreativeMedia && creativeId) {
        const patchBody = {
          storage_url: publicUrl,
          file_size: fileSize,
          ...(videoLength !== null ? { duration_seconds: Math.round(videoLength) } : {}),
        };
        const patchResult = await sbPatch(
          "creative_media",
          `creative_id=eq.${creativeId}`,
          patchBody
        );
        if (!patchResult.ok) {
          console.warn(`\n  ⚠ DB 업데이트 실패 (${patchResult.status}): ${patchResult.body}`);
        }
      } else {
        process.stdout.write(`\n  [폴백] DB 업데이트 생략 → ${publicUrl}`);
      }

      // ──────────────────────────────────────────
      // 8. 임시 파일 삭제
      // ──────────────────────────────────────────
      await unlink(localPath).catch(() => {});

      process.stdout.write(` ... ✅\n`);
      successCount++;
    } catch (err) {
      process.stdout.write(` ... ✗\n`);
      console.error(`  오류: ${err.message}`);
      await unlink(localPath).catch(() => {});
      errorCount++;
    }
  }

  // ────────────────────────────────────────────
  // 최종 결과
  // ────────────────────────────────────────────
  console.log("\n━━━ 완료 ━━━");
  console.log(`성공: ${successCount}건, 스킵: ${skipCount}건, 실패: ${errorCount}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
