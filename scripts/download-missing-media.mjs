#!/usr/bin/env node
/**
 * 미수집 소재 다운로드 스크립트
 *
 * 1) creative_media에서 storage_url 없는 이미지 → 원본 다운로드 + Storage 업로드
 * 2) VIDEO에서 썸네일만 있는 건 → Meta API video source URL로 mp4 다운로드
 *
 * Usage:
 *   node scripts/download-missing-media.mjs
 *   node scripts/download-missing-media.mjs --account-id 1577307499783821
 *   node scripts/download-missing-media.mjs --dry-run
 *   node scripts/download-missing-media.mjs --limit 50
 *   node scripts/download-missing-media.mjs --mp4-only   # VIDEO mp4만
 *   node scripts/download-missing-media.mjs --image-only  # 이미지만
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 인자 ──────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MP4_ONLY = args.includes("--mp4-only");
const IMAGE_ONLY = args.includes("--image-only");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500;
const accountIdx = args.indexOf("--account-id");
const ACCOUNT_FILTER = accountIdx >= 0 ? args[accountIdx + 1] : null;

// ── .env.local ────────────────────────────────────
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
  console.error("SUPABASE_URL, SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!META_TOKEN) {
  console.error("META_ACCESS_TOKEN 필요");
  process.exit(1);
}

const AUTH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// ── Supabase REST 헬퍼 ────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, { headers: AUTH });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, filters, data) {
  const url = `${SB_URL}/rest/v1/${table}?${filters}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...AUTH, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`sbPatch ${res.status}: ${await res.text()}`);
}

async function uploadToStorage(storagePath, buffer, contentType) {
  const url = `${SB_URL}/storage/v1/object/creatives/${storagePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Storage 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  return `${SB_URL}/storage/v1/object/public/creatives/${storagePath}`;
}

// ── Meta API ──────────────────────────────────────
async function fetchVideoSource(videoId) {
  const url = `https://graph.facebook.com/v21.0/${videoId}?fields=source&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta video ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.source || null;
}

// ── 메인 ──────────────────────────────────────────
async function main() {
  console.log(`\n=== 미수집 소재 다운로드 시작 ===`);
  console.log(`  account_filter: ${ACCOUNT_FILTER || "전체"}`);
  console.log(`  mode: ${MP4_ONLY ? "mp4만" : IMAGE_ONLY ? "이미지만" : "전체"}`);
  console.log(`  limit: ${LIMIT}, dry_run: ${DRY_RUN}\n`);

  let imageDownloaded = 0;
  let mp4Downloaded = 0;
  let errors = 0;

  // ─── PART A: storage_url NULL인 이미지/비디오 썸네일 다운로드 ───
  if (!MP4_ONLY) {
    console.log("── PART A: storage_url 없는 미디어 다운로드 ──");

    // creative_media에서 storage_url IS NULL인 건 조회
    // creative와 JOIN해서 account_id 가져와야 하지만 REST API에서 서브쿼리 불가
    // → 모든 NULL 건 가져온 후 creative_id로 creatives 매핑
    let mediaQuery = `/creative_media?storage_url=is.null&select=id,creative_id,media_type,media_url&limit=${LIMIT}`;
    const nullMedia = await sbGet(mediaQuery);
    console.log(`  storage_url NULL 미디어: ${nullMedia.length}건`);

    if (nullMedia.length > 0) {
      // creative_id → account_id 매핑
      const creativeIds = [...new Set(nullMedia.map((r) => r.creative_id))];
      const creatives = await sbGet(
        `/creatives?id=in.(${creativeIds.join(",")})&select=id,ad_id,account_id`
      );
      const creativeMap = new Map(creatives.map((c) => [c.id, c]));

      // account_id 필터 적용
      let filtered = nullMedia;
      if (ACCOUNT_FILTER) {
        filtered = nullMedia.filter((m) => {
          const c = creativeMap.get(m.creative_id);
          return c && c.account_id === ACCOUNT_FILTER;
        });
        console.log(`  계정 필터 후: ${filtered.length}건`);
      }

      if (DRY_RUN) {
        for (const m of filtered.slice(0, 10)) {
          console.log(`  [DRY] ${m.media_type}: ${m.media_url?.slice(0, 80)}`);
        }
      } else {
        for (const m of filtered) {
          if (!m.media_url) { errors++; continue; }
          const c = creativeMap.get(m.creative_id);
          if (!c) { errors++; continue; }

          try {
            const imgRes = await fetch(m.media_url, { signal: AbortSignal.timeout(30000) });
            if (!imgRes.ok) {
              console.log(`  ✗ ${c.ad_id}: HTTP ${imgRes.status}`);
              errors++;
              continue;
            }
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const ext = m.media_type === "VIDEO" ? "jpg" : "jpg";
            const storagePath = `creatives/${c.account_id}/media/${c.ad_id}.${ext}`;
            const storageUrl = await uploadToStorage(storagePath, buffer, "image/jpeg");

            // DB 업데이트
            await sbPatch("creative_media", `id=eq.${m.id}`, { storage_url: storageUrl });
            imageDownloaded++;
            console.log(`  ✓ ${c.ad_id} (${m.media_type}): ${(buffer.length / 1024).toFixed(0)}KB`);
          } catch (e) {
            console.log(`  ✗ ${c.ad_id}: ${e.message.slice(0, 60)}`);
            errors++;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
  }

  // ─── PART B: VIDEO에서 실제 mp4 없는 건 → Meta API video source 다운로드 ───
  if (!IMAGE_ONLY) {
    console.log("\n── PART B: VIDEO mp4 미다운로드분 ──");

    // VIDEO인데 storage_url에 .mp4가 없는 건 (썸네일만 있거나 NULL)
    // storage_url에 thumb/ 가 있거나 .mp4가 아닌 건
    let videoQuery = `/creative_media?media_type=eq.VIDEO&select=id,creative_id,media_url,storage_url&limit=${LIMIT}`;
    const allVideo = await sbGet(videoQuery);

    // mp4가 아닌 건 필터
    const needMp4 = allVideo.filter((r) => {
      const su = r.storage_url || "";
      return !su.includes(".mp4");
    });
    console.log(`  전체 VIDEO: ${allVideo.length}건, mp4 없는 건: ${needMp4.length}건`);

    if (needMp4.length > 0) {
      // creative_id → ad_id, account_id, video_id 매핑
      const creativeIds = [...new Set(needMp4.map((r) => r.creative_id))];
      const creatives = await sbGet(
        `/creatives?id=in.(${creativeIds.join(",")})&select=id,ad_id,account_id`
      );
      const creativeMap = new Map(creatives.map((c) => [c.id, c]));

      // account_id 필터
      let filtered = needMp4;
      if (ACCOUNT_FILTER) {
        filtered = needMp4.filter((m) => {
          const c = creativeMap.get(m.creative_id);
          return c && c.account_id === ACCOUNT_FILTER;
        });
        console.log(`  계정 필터 후: ${filtered.length}건`);
      }

      if (DRY_RUN) {
        for (const m of filtered.slice(0, 10)) {
          const c = creativeMap.get(m.creative_id);
          console.log(`  [DRY] ad_id=${c?.ad_id}, storage=${m.storage_url?.slice(0, 60)}`);
        }
      } else {
        for (const m of filtered) {
          const c = creativeMap.get(m.creative_id);
          if (!c) { errors++; continue; }

          try {
            // Meta API: 1) ad → creative_id → 2) creative → video_id
            const adData = await fetch(
              `https://graph.facebook.com/v21.0/${c.ad_id}?fields=creative&access_token=${META_TOKEN}`
            ).then((r) => r.json());

            const metaCreativeId = adData?.creative?.id;
            if (!metaCreativeId) {
              console.log(`  ✗ ${c.ad_id}: creative 없음 (삭제된 광고?)`);
              errors++;
              continue;
            }

            // creative에서 video_id + object_story_spec 조회
            const creativeData = await fetch(
              `https://graph.facebook.com/v21.0/${metaCreativeId}?fields=video_id,object_type,object_story_spec&access_token=${META_TOKEN}`
            ).then((r) => r.json());

            let videoId = creativeData?.video_id || null;

            // SHARE 타입: object_story_spec.video_data에서 video_id 추출
            if (!videoId && creativeData?.object_story_spec?.video_data?.video_id) {
              videoId = creativeData.object_story_spec.video_data.video_id;
            }

            if (!videoId) {
              // 실제 비디오가 아닌 링크/이미지 광고 (DB에 VIDEO로 잘못 기록된 경우)
              console.log(`  - ${c.ad_id}: 비디오 아님 (${creativeData?.object_type || 'unknown'})`);
              continue; // 에러로 카운트하지 않음
            }

            // video source URL
            const sourceUrl = await fetchVideoSource(videoId);
            if (!sourceUrl) {
              console.log(`  ✗ ${c.ad_id}: source URL 없음`);
              errors++;
              continue;
            }

            // mp4 다운로드
            const mp4Res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
            if (!mp4Res.ok) {
              console.log(`  ✗ ${c.ad_id}: mp4 다운로드 HTTP ${mp4Res.status}`);
              errors++;
              continue;
            }
            const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());

            // Storage 업로드
            const mp4Path = `creatives/${c.account_id}/media/${c.ad_id}.mp4`;
            const storageUrl = await uploadToStorage(mp4Path, mp4Buffer, "video/mp4");

            // DB 업데이트 (storage_url을 mp4 경로로 업데이트)
            await sbPatch("creative_media", `id=eq.${m.id}`, { storage_url: storageUrl });
            mp4Downloaded++;
            console.log(`  ✓ ${c.ad_id}: mp4 ${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB`);
          } catch (e) {
            console.log(`  ✗ ${c.ad_id}: ${e.message.slice(0, 80)}`);
            errors++;
          }

          // Meta rate limit 방지
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  console.log(`\n=== 미수집 소재 다운로드 완료 ===`);
  console.log(`  이미지 다운로드: ${imageDownloaded}`);
  console.log(`  mp4 다운로드: ${mp4Downloaded}`);
  console.log(`  에러: ${errors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
