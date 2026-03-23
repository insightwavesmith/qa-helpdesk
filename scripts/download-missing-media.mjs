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

import { sbGet, sbPatch, env, SB_URL, SB_KEY } from "./lib/db-helpers.mjs";

// ── CLI 인자 ──────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MP4_ONLY = args.includes("--mp4-only");
const IMAGE_ONLY = args.includes("--image-only");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500;
const accountIdx = args.indexOf("--account-id");
const ACCOUNT_FILTER = accountIdx >= 0 ? args[accountIdx + 1] : null;

// ── 환경변수 ──
const META_TOKEN = env.META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;

if (!META_TOKEN) {
  console.error("META_ACCESS_TOKEN 필요");
  process.exit(1);
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
const META_API_BASE = "https://graph.facebook.com/v22.0";

async function metaGet(path) {
  const url = `${META_API_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API (code ${data.error.code}): ${data.error.message}`);
  return data;
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
      // creative_id → ad_id, account_id 매핑
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

      // ── 배치 prefetch: account별 ads → story_video_id 매핑 ──
      const accountIds = [...new Set(filtered.map((m) => creativeMap.get(m.creative_id)?.account_id).filter(Boolean))];
      const adStoryVideoMap = new Map(); // ad_id → story_video_id

      console.log(`  story_video_id 배치 매핑 조회 중 (${accountIds.length}개 계정)...`);
      for (const accountId of accountIds) {
        try {
          let after = null;
          while (true) {
            const paging = after ? `&after=${after}` : "";
            const data = await metaGet(
              `/act_${accountId}/ads?fields=id,creative{object_story_spec}&limit=100${paging}`
            );
            const ads = data?.data || [];
            for (const ad of ads) {
              const storyVid = ad?.creative?.object_story_spec?.video_data?.video_id;
              if (ad.id && storyVid) {
                adStoryVideoMap.set(ad.id, storyVid);
              }
            }
            after = data?.paging?.cursors?.after;
            if (!after || ads.length === 0) break;
          }
        } catch (e) {
          console.log(`  ⚠ 계정 ${accountId} ads 매핑 실패: ${e.message.slice(0, 60)}`);
        }
      }
      console.log(`  story_video_id 매핑: ${adStoryVideoMap.size}건`);

      if (DRY_RUN) {
        for (const m of filtered.slice(0, 10)) {
          const c = creativeMap.get(m.creative_id);
          const svid = adStoryVideoMap.get(c?.ad_id);
          console.log(`  [DRY] ad_id=${c?.ad_id}, story_video=${svid || "없음"}`);
        }
      } else {
        for (const m of filtered) {
          const c = creativeMap.get(m.creative_id);
          if (!c) { errors++; continue; }

          try {
            // story_video_id 조회 (배치 매핑 → 개별 fallback)
            let storyVideoId = adStoryVideoMap.get(c.ad_id);

            if (!storyVideoId) {
              try {
                const adData = await metaGet(`/${c.ad_id}?fields=creative{object_story_spec}`);
                storyVideoId = adData?.creative?.object_story_spec?.video_data?.video_id;
                if (storyVideoId) adStoryVideoMap.set(c.ad_id, storyVideoId);
              } catch (_) {}
            }

            if (!storyVideoId) {
              console.log(`  - ${c.ad_id}: story_video_id 없음 (비디오 아님)`);
              continue;
            }

            // story_video_id로 source URL 조회 (권한 OK)
            const vData = await metaGet(`/${storyVideoId}?fields=source,length`);
            if (!vData?.source) {
              console.log(`  ✗ ${c.ad_id}: video ${storyVideoId} source 없음`);
              errors++;
              continue;
            }

            // mp4 다운로드
            const mp4Res = await fetch(vData.source, { signal: AbortSignal.timeout(120000) });
            if (!mp4Res.ok) {
              console.log(`  ✗ ${c.ad_id}: mp4 다운로드 HTTP ${mp4Res.status}`);
              errors++;
              continue;
            }
            const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());

            // Storage 업로드
            const mp4Path = `creatives/${c.account_id}/media/${c.ad_id}.mp4`;
            const storageUrl = await uploadToStorage(mp4Path, mp4Buffer, "video/mp4");

            // DB 업데이트
            await sbPatch("creative_media", `id=eq.${m.id}`, { storage_url: storageUrl });
            mp4Downloaded++;
            const duration = vData.length ? ` ${Math.round(vData.length)}s` : "";
            console.log(`  ✓ ${c.ad_id}: mp4 ${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB${duration}`);
          } catch (e) {
            console.log(`  ✗ ${c.ad_id}: ${e.message.slice(0, 80)}`);
            errors++;
          }

          await new Promise((r) => setTimeout(r, 200));
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
