#!/usr/bin/env node
/**
 * 동영상 원본 다운로드 스크립트
 *
 * ad_creative_embeddings에서 media_type=VIDEO인 소재의 원본 영상을 다운로드.
 * Meta Graph API GET /{ad_id}?fields=creative{video_id} → GET /{video_id}?fields=source
 *
 * Usage:
 *   node scripts/download-videos.mjs                    # 전체 VIDEO 다운로드
 *   node scripts/download-videos.mjs --limit 50         # 50건만
 *   node scripts/download-videos.mjs --status            # 현황만 출력
 *   node scripts/download-videos.mjs --dry-run           # 실제 다운로드 안 함
 *   node scripts/download-videos.mjs --concurrency 3     # 동시 3건 (기본 3)
 *
 * 환경변수 (.env.local):
 *   META_ACCESS_TOKEN       — Meta Graph API 토큰
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync, createWriteStream, statSync } from "fs";
import { mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, "..", "data", "videos");

// ── .env.local 파싱 ───────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // 환경변수가 이미 설정된 것으로 가정
  }
}

loadEnvLocal();

// ── 설정 ─────────────────────────────────────────────────────────
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_API = "https://graph.facebook.com/v21.0";

if (!SB_URL || !SB_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!META_TOKEN) {
  console.error("환경변수 누락: META_ACCESS_TOKEN");
  process.exit(1);
}

// ── 인수 파싱 ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;
const concurrencyIdx = args.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 3;
const DRY_RUN = args.includes("--dry-run");
const STATUS_ONLY = args.includes("--status");
const DELAY_MS = 300; // Meta API rate limit 대기

// ── Supabase REST 헬퍼 ────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Meta Graph API 호출 (재시도 포함) ──────────────────────────────
async function metaFetch(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        const wait = Math.min(60_000, 5_000 * (i + 1));
        console.log(`    ⏳ Rate limit — ${wait / 1000}초 대기`);
        await sleep(wait);
        continue;
      }
      const data = await res.json();
      if (data.error) {
        // 토큰 만료/권한 에러는 재시도 무의미
        if (data.error.code === 190 || data.error.code === 100) {
          return { error: data.error };
        }
        if (i < retries) {
          await sleep(2000);
          continue;
        }
        return { error: data.error };
      }
      return data;
    } catch (e) {
      if (i < retries) {
        await sleep(2000);
        continue;
      }
      return { error: { message: e.message } };
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Step 1: video_id 조회 (ad_id → object_story_spec.video_data.video_id) ──
// creative.video_id는 권한 제한으로 source 접근 불가.
// object_story_spec.video_data.video_id는 페이지 게시물 영상이라 source 접근 가능.
async function getVideoId(adId) {
  const url = `${META_API}/${adId}?fields=creative%7Bvideo_id,object_story_spec%7D&access_token=${META_TOKEN}`;
  const data = await metaFetch(url);
  if (data?.error) return { error: data.error.message };

  // 우선순위: object_story_spec.video_data.video_id > creative.video_id
  const storyVideoId = data?.creative?.object_story_spec?.video_data?.video_id;
  const creativeVideoId = data?.creative?.video_id;
  const videoId = storyVideoId || creativeVideoId;

  if (!videoId) return { error: "video_id 없음" };
  return { videoId, isStorySpec: !!storyVideoId };
}

// ── Step 2: video source URL 조회 (video_id → source) ──────────────
async function getVideoSource(videoId) {
  const url = `${META_API}/${videoId}?fields=source,length&access_token=${META_TOKEN}`;
  const data = await metaFetch(url);
  if (data?.error) return { error: data.error.message };
  if (!data.source) return { error: "source URL 없음" };
  return { source: data.source, length: data.length };
}

// ── Step 3: 동영상 다운로드 ────────────────────────────────────────
async function downloadVideo(sourceUrl, filePath) {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);

  const body = res.body;
  if (!body) throw new Error("응답 body 없음");

  const stream = Readable.fromWeb(body);
  const ws = createWriteStream(filePath);
  await pipeline(stream, ws);

  const stat = statSync(filePath);
  return stat.size;
}

// ── 메인 ──────────────────────────────────────────────────────────
async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });

  console.log("동영상 원본 다운로드 스크립트");
  console.log(`  저장 경로: ${VIDEO_DIR}`);
  console.log(`  동시 처리: ${CONCURRENCY}건`);
  console.log(`  제한: ${LIMIT}건`);
  if (DRY_RUN) console.log("  ⚠ DRY RUN — 실제 다운로드 안 함");
  console.log("");

  // VIDEO 소재 조회
  const rows = await sbGet(
    `/ad_creative_embeddings?select=ad_id,media_url,account_id&media_type=eq.VIDEO&is_active=eq.true&order=ad_id.asc&limit=${LIMIT}`
  );
  console.log(`VIDEO 소재: ${rows.length}건`);

  // 이미 다운받은 파일 확인
  let alreadyDone = 0;
  const pending = [];
  for (const row of rows) {
    const filePath = resolve(VIDEO_DIR, `${row.ad_id}.mp4`);
    if (existsSync(filePath) && statSync(filePath).size > 1000) {
      alreadyDone++;
    } else {
      pending.push(row);
    }
  }

  console.log(`  이미 다운로드: ${alreadyDone}건`);
  console.log(`  남은 작업: ${pending.length}건`);

  if (STATUS_ONLY) {
    console.log("\n[STATUS] 종료");
    return;
  }

  if (pending.length === 0) {
    console.log("\n모두 완료!");
    return;
  }

  // 배치 처리
  let downloaded = 0;
  let noVideoId = 0;
  let noSource = 0;
  let downloadFailed = 0;
  let idx = 0;

  async function processOne(row) {
    const i = ++idx;
    const adId = row.ad_id;
    const filePath = resolve(VIDEO_DIR, `${adId}.mp4`);
    const label = `[${i}/${pending.length}] ${adId}`;

    // Step 1: video_id 조회
    const { videoId, error: vidErr } = await getVideoId(adId);
    if (vidErr) {
      console.log(`  ${label} ✗ video_id: ${vidErr}`);
      noVideoId++;
      return;
    }

    // Step 2: source URL 조회
    await sleep(DELAY_MS);
    const { source, error: srcErr } = await getVideoSource(videoId);
    if (srcErr) {
      console.log(`  ${label} ✗ source: ${srcErr}`);
      noSource++;
      return;
    }

    if (DRY_RUN) {
      console.log(`  ${label} ✓ video_id=${videoId} source=OK (dry-run 스킵)`);
      downloaded++;
      return;
    }

    // Step 3: 다운로드
    try {
      const size = await downloadVideo(source, filePath);
      const sizeMB = (size / 1024 / 1024).toFixed(1);
      console.log(`  ${label} ✓ ${sizeMB}MB (video_id=${videoId})`);
      downloaded++;
    } catch (e) {
      console.log(`  ${label} ✗ 다운로드 실패: ${e.message?.slice(0, 100)}`);
      downloadFailed++;
    }

    await sleep(DELAY_MS);
  }

  // concurrency 제한 처리
  const queue = [...pending];
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) await processOne(item);
        }
      })()
    );
  }
  await Promise.all(workers);

  // 결과 출력
  console.log(`\n━━━ 최종 결과 ━━━`);
  console.log(`전체 VIDEO: ${rows.length}건`);
  console.log(`이미 다운로드: ${alreadyDone}건`);
  console.log(`신규 다운로드: ${downloaded}건`);
  console.log(`video_id 없음: ${noVideoId}건`);
  console.log(`source URL 없음: ${noSource}건`);
  console.log(`다운로드 실패: ${downloadFailed}건`);
  console.log(`합계: ${alreadyDone + downloaded}/${rows.length}건`);
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(1);
});
