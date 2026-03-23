#!/usr/bin/env node
/**
 * 벤치마크 소재 수집 스크립트
 *
 * ad_insights_classified에서 성과 상위 광고의 소재를 Meta API로 가져와서
 * creatives + creative_media에 source='benchmark'로 저장.
 * LP URL도 landing_pages에 저장.
 *
 * Usage:
 *   node scripts/collect-benchmark-creatives.mjs
 *   node scripts/collect-benchmark-creatives.mjs --account-id 1577307499783821
 *   node scripts/collect-benchmark-creatives.mjs --dry-run
 *   node scripts/collect-benchmark-creatives.mjs --limit 10
 */

import { sbGet, sbUpsert, env, SB_URL, SB_KEY, closePool } from "./lib/db-helpers.mjs";

// ── CLI 인자 ──────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 200;
const accountIdx = args.indexOf("--account-id");
const ACCOUNT_FILTER = accountIdx >= 0 ? args[accountIdx + 1] : null;

// ── 환경변수 ──
const META_TOKEN = env.META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;

if (!META_TOKEN) {
  console.error("META_ACCESS_TOKEN 필요");
  process.exit(1);
}

async function uploadToStorage(bucket, storagePath, buffer, contentType) {
  const url = `${SB_URL}/storage/v1/object/${bucket}/${storagePath}`;
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
  return `${SB_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

// ── Meta API 헬퍼 ─────────────────────────────────
const META_BASE = "https://graph.facebook.com/v22.0";

async function metaGet(path, params = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", META_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── LP URL 정규화 ─────────────────────────────────
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    const keysToRemove = [];
    u.searchParams.forEach((_, key) => {
      if (
        key.startsWith("utm_") || key === "fbclid" || key === "gclid" ||
        key === "ref" || key === "source" || key.startsWith("cafe_mkt")
      ) keysToRemove.push(key);
    });
    for (const k of keysToRemove) u.searchParams.delete(k);
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url;
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ── 메인 ──────────────────────────────────────────
async function main() {
  console.log(`\n=== 벤치마크 소재 수집 시작 ===`);
  console.log(`  account_filter: ${ACCOUNT_FILTER || "전체"}`);
  console.log(`  limit: ${LIMIT}, dry_run: ${DRY_RUN}\n`);

  // 1. ad_insights_classified에서 벤치마크 기준 초과 광고 조회
  //    훅: video_p3s_rate > 25.81%
  //    클릭: ctr > 3.48%
  //    참여: engagement_per_10k > 27.0
  //    quality_ranking: ABOVE_AVERAGE 또는 UNKNOWN
  let queryPath = `/ad_insights_classified?select=ad_id,account_id,ad_name,creative_type,roas,ctr,video_p3s_rate,engagement_per_10k,quality_ranking,engagement_ranking&quality_ranking=in.(ABOVE_AVERAGE,UNKNOWN)&or=(video_p3s_rate.gt.25.81,ctr.gt.3.48,engagement_per_10k.gt.27.0)&order=ctr.desc&limit=${LIMIT}`;
  if (ACCOUNT_FILTER) {
    queryPath += `&account_id=eq.${ACCOUNT_FILTER}`;
  }

  const insights = await sbGet(queryPath);
  console.log(`  ad_insights_classified: ${insights.length}건 조회됨 (벤치마크 기준 초과)`);

  if (insights.length === 0) {
    console.log("  대상 없음. 종료.");
    return;
  }

  // 2. 이미 creatives에 있는 ad_id 확인 (중복 방지)
  const adIds = insights.map((r) => r.ad_id);
  const existingCreatives = await sbGet(
    `/creatives?ad_id=in.(${adIds.join(",")})&select=ad_id`
  );
  const existingAdIds = new Set(existingCreatives.map((r) => r.ad_id));
  console.log(`  이미 존재하는 creatives ad_id: ${existingAdIds.size}건`);

  // 2-1. creative_media에 이미 있는 ad_id도 스킵 (creatives → creative_media 조인)
  const existingMedia = await sbGet(
    `/creative_media?select=creatives!inner(ad_id)&creatives.ad_id=in.(${adIds.join(",")})`
  );
  const existingMediaAdIds = new Set(existingMedia.map((r) => r.creatives?.ad_id).filter(Boolean));
  console.log(`  이미 존재하는 creative_media ad_id: ${existingMediaAdIds.size}건`);

  // 2-2. landing_pages에 이미 있는 URL 조회 (LP 중복 수집 방지)
  const existingLps = await sbGet(
    `/landing_pages?select=canonical_url&account_id=in.(${[...new Set(insights.map((r) => r.account_id))].join(",")})`
  );
  const existingLpUrls = new Set(existingLps.map((r) => r.canonical_url));
  console.log(`  이미 존재하는 LP URL: ${existingLpUrls.size}건`);

  const newInsights = insights.filter(
    (r) => !existingAdIds.has(r.ad_id) && !existingMediaAdIds.has(r.ad_id)
  );

  // 벤치마크 분류 태그 부여
  for (const r of newInsights) {
    const tags = [];
    if (r.video_p3s_rate > 25.81) tags.push("hook");
    if (r.ctr > 3.48) tags.push("click");
    if (r.engagement_per_10k > 27.0) tags.push("engage");
    if (tags.length === 3) tags.push("allstar");
    r._benchmarkTags = tags;
  }

  const allstarCount = newInsights.filter((r) => r._benchmarkTags.includes("allstar")).length;
  console.log(`  신규 수집 대상: ${newInsights.length}건 (올스타: ${allstarCount}건)\n`);

  if (newInsights.length === 0) {
    console.log("  모든 벤치마크 소재가 이미 수집됨. 종료.");
    return;
  }

  if (DRY_RUN) {
    console.log("[DRY-RUN] 대상 ad_id:");
    for (const r of newInsights.slice(0, 10)) {
      console.log(`  ${r.ad_id} (${r.ad_name}) ROAS=${r.roas} CTR=${r.ctr}`);
    }
    return;
  }

  // 3. 계정별로 그룹핑
  const byAccount = {};
  for (const r of newInsights) {
    if (!byAccount[r.account_id]) byAccount[r.account_id] = [];
    byAccount[r.account_id].push(r);
  }

  let totalCreated = 0;
  let totalMediaDownloaded = 0;
  let totalLpCreated = 0;
  let totalErrors = 0;

  for (const [accountId, accountInsights] of Object.entries(byAccount)) {
    console.log(`\n--- 계정 ${accountId}: ${accountInsights.length}건 ---`);

    for (const insight of accountInsights) {
      const adId = insight.ad_id;
      try {
        // 4. Meta API에서 광고 크리에이티브 정보 조회
        const adData = await metaGet(`/${adId}`, {
          fields: "name,creative{id,object_type,video_id,image_hash,image_url,thumbnail_url,object_story_spec}",
        });

        const creative = adData.creative;
        if (!creative) {
          console.log(`  ${adId}: creative 없음 → 스킵`);
          totalErrors++;
          continue;
        }

        // 이미지 URL 추출
        let mediaUrl = creative.image_url || creative.thumbnail_url || null;
        // story_video_id: object_story_spec.video_data.video_id (권한 OK)
        const oss = creative.object_story_spec;
        const storyVideoId = oss?.video_data?.video_id || null;
        const creativeType = storyVideoId ? "VIDEO" : "IMAGE";

        // LP URL 추출 (object_story_spec에서)
        let lpUrl = null;
        if (oss) {
          if (oss.link_data?.link) lpUrl = oss.link_data.link;
          else if (oss.video_data?.call_to_action?.value?.link) lpUrl = oss.video_data.call_to_action.value.link;
        }

        // 5. creatives 테이블에 INSERT
        const creativeRow = {
          ad_id: adId,
          account_id: accountId,
          creative_type: creativeType,
          source: "benchmark",
          brand_name: insight.ad_name || null,
          is_active: false, // 벤치마크는 비활성
          lp_url: lpUrl,
        };

        await sbUpsert("creatives", [creativeRow], "ad_id");
        const [createdRow] = await sbGet(`/creatives?ad_id=eq.${adId}&select=id&limit=1`);
        const creativeId = createdRow?.id;
        const tagStr = insight._benchmarkTags?.join(",") || "";
        console.log(`  ✓ ${adId}: creative 생성 (${creativeType}, id=${creativeId?.slice(0, 8)}, tags=${tagStr})`);
        totalCreated++;

        // 6. 미디어 다운로드 + creative_media INSERT
        if (mediaUrl || storyVideoId) {
          // 이미지/썸네일 다운로드
          let storageUrl = null;
          if (mediaUrl) {
            try {
              const imgRes = await fetch(mediaUrl);
              if (imgRes.ok) {
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                const storagePath = `creatives/${accountId}/media/${adId}.jpg`;
                storageUrl = await uploadToStorage("creatives", storagePath, buffer, "image/jpeg");
                console.log(`    → 이미지 Storage 저장`);
              }
            } catch (e) {
              console.log(`    → 이미지 다운로드 실패: ${e.message.slice(0, 60)}`);
            }
          }

          // VIDEO인 경우 story_video_id로 mp4 다운로드
          if (storyVideoId) {
            try {
              const videoData = await metaGet(`/${storyVideoId}`, { fields: "source,length" });
              if (videoData.source) {
                const mp4Res = await fetch(videoData.source, { signal: AbortSignal.timeout(120000) });
                if (mp4Res.ok) {
                  const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());
                  const mp4Path = `creatives/${accountId}/media/${adId}.mp4`;
                  storageUrl = await uploadToStorage("creatives", mp4Path, mp4Buffer, "video/mp4");
                  const duration = videoData.length ? ` ${Math.round(videoData.length)}s` : "";
                  console.log(`    → mp4 Storage 저장 (${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB${duration})`);
                  totalMediaDownloaded++;
                }
              }
            } catch (e) {
              console.log(`    → mp4 다운로드 실패: ${e.message.slice(0, 60)}`);
            }
          }

          // creative_media UPSERT
          const mediaRow = {
            creative_id: creativeId,
            media_type: creativeType,
            media_url: mediaUrl,
            storage_url: storageUrl,
            ad_copy: insight.ad_name || null,
          };
          try {
            await sbUpsert("creative_media", [mediaRow], "creative_id");
          } catch (e) {
            console.log(`    → creative_media upsert 실패: ${e.message.slice(0, 60)}`);
          }
        }

        // 7. LP URL → landing_pages에 저장 (기존 URL 스킵)
        if (lpUrl) {
          const canonicalUrl = normalizeUrl(lpUrl);
          if (existingLpUrls.has(canonicalUrl)) {
            console.log(`    → LP 이미 존재, 스킵: ${canonicalUrl.slice(0, 60)}`);
          } else {
            const domain = extractDomain(lpUrl);
            try {
              await sbUpsert(
                "landing_pages",
                [{
                  account_id: accountId,
                  canonical_url: canonicalUrl,
                  original_urls: [lpUrl],
                  domain: domain,
                  page_type: "product",
                  is_active: true,
                }],
                "canonical_url"
              );
              existingLpUrls.add(canonicalUrl); // 같은 배치 내 중복 방지
              console.log(`    → LP 저장: ${canonicalUrl.slice(0, 60)}`);
              totalLpCreated++;
            } catch (e) {
              console.log(`    → LP 저장 실패: ${e.message.slice(0, 60)}`);
            }
          }
        }

        // rate limit 방지
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.error(`  ✗ ${adId}: ${e.message.slice(0, 100)}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n=== 벤치마크 소재 수집 완료 ===`);
  console.log(`  creatives 생성: ${totalCreated}`);
  console.log(`  mp4 다운로드: ${totalMediaDownloaded}`);
  console.log(`  LP 저장: ${totalLpCreated}`);
  console.log(`  에러: ${totalErrors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
}).finally(() => closePool());
