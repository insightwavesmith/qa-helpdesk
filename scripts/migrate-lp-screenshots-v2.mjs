#!/usr/bin/env node
/**
 * LP 스크린샷 마이그레이션 v2
 *
 * 기존: ad_creative_embeddings.lp_screenshot_url
 *       → Storage: lp-screenshots/{adId}/main.png
 *
 * 신규: lp_snapshots 테이블
 *       → Storage: creatives/lp/{account_id}/{lp_id}/mobile_full.jpg (ADR-001)
 *
 * 흐름:
 *   1. ad_creative_embeddings WHERE lp_screenshot_url IS NOT NULL 조회
 *   2. ad_id → creatives.lp_id → landing_pages.account_id 매핑
 *   3. Storage: 기존 경로 다운로드 → 신규 경로 업로드 (기존 유지)
 *   4. lp_snapshots INSERT (lp_id + viewport 기준, 중복 스킵)
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage: node scripts/migrate-lp-screenshots-v2.mjs [--dry-run] [--limit N]
 */

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error(
    "환경변수가 필요합니다: SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// CLI 인자 파싱
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 100;

const supabase = createClient(SB_URL, SB_KEY);

// ─── REST API 헬퍼 ────────────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `LP 스크린샷 마이그레이션 v2${DRY_RUN ? " (dry-run)" : ""} — limit: ${LIMIT}`
  );

  // 1. lp_screenshot_url이 있는 ad_creative_embeddings 조회
  let rows;
  try {
    rows = await sbGet(
      `/ad_creative_embeddings?select=id,ad_id,lp_screenshot_url,lp_url&lp_screenshot_url=not.is.null&limit=${LIMIT}`
    );
  } catch (err) {
    console.error("ad_creative_embeddings 조회 실패:", err.message);
    process.exit(1);
  }

  console.log(`\n조회된 레코드: ${rows.length}건`);

  if (rows.length === 0) {
    console.log("마이그레이션 대상 없음. 종료.");
    return;
  }

  // 2. 매핑 정보 조회: ad_id → creatives.lp_id
  const adIds = [...new Set(rows.map((r) => r.ad_id).filter(Boolean))];
  console.log(`고유 ad_id: ${adIds.length}개`);

  // creatives 테이블에서 ad_id → lp_id 매핑
  let creativeRows = [];
  for (let i = 0; i < adIds.length; i += 100) {
    const batch = adIds.slice(i, i + 100);
    const batchQuery = batch.map((id) => `ad_id.eq.${id}`).join(",");
    try {
      const data = await sbGet(
        `/creatives?select=ad_id,lp_id,account_id&or=(${batchQuery})`
      );
      creativeRows = creativeRows.concat(data);
    } catch (err) {
      console.warn(`creatives 배치 조회 오류 (${i}~${i + 100}):`, err.message);
    }
  }

  // ad_id → { lp_id, account_id } 맵
  const adToCreative = new Map();
  for (const c of creativeRows) {
    if (c.ad_id && c.lp_id && c.account_id) {
      adToCreative.set(c.ad_id, { lp_id: c.lp_id, account_id: c.account_id });
    }
  }
  console.log(`creatives 매핑: ${adToCreative.size}개 (ad_id → lp_id)`);

  // 3. 기존 lp_snapshots 조회 (중복 스킵용)
  const lpIds = [...new Set(
    [...adToCreative.values()].map((v) => v.lp_id).filter(Boolean)
  )];
  const existingSnapshots = new Set();
  if (lpIds.length > 0) {
    for (let i = 0; i < lpIds.length; i += 100) {
      const batch = lpIds.slice(i, i + 100);
      const batchQuery = batch.map((id) => `lp_id.eq.${id}`).join(",");
      try {
        const snaps = await sbGet(
          `/lp_snapshots?select=lp_id,viewport&or=(${batchQuery})`
        );
        for (const s of snaps) {
          existingSnapshots.add(`${s.lp_id}:${s.viewport}`);
        }
      } catch (err) {
        console.warn(`lp_snapshots 조회 오류:`, err.message);
      }
    }
  }
  console.log(`기존 lp_snapshots: ${existingSnapshots.size}건`);

  // 4. 마이그레이션 실행
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let noMappingCount = 0;

  for (const row of rows) {
    const creative = adToCreative.get(row.ad_id);
    if (!creative || !creative.lp_id || !creative.account_id) {
      console.log(`  [스킵] ad_id=${row.ad_id}: creatives 매핑 없음`);
      noMappingCount++;
      continue;
    }

    const { lp_id, account_id } = creative;
    const snapshotKey = `${lp_id}:mobile`;

    if (existingSnapshots.has(snapshotKey)) {
      console.log(`  [스킵] lp_id=${lp_id}: 이미 lp_snapshots 존재`);
      skipCount++;
      continue;
    }

    console.log(`  [처리] ad_id=${row.ad_id} → lp_id=${lp_id} (${account_id})`);

    if (DRY_RUN) {
      console.log(
        `    [dry-run] Storage 복사: lp-screenshots/${row.ad_id}/main.png → creatives/lp/${account_id}/${lp_id}/mobile_full.jpg`
      );
      successCount++;
      continue;
    }

    // 기존 Storage에서 다운로드
    const oldPath = `lp-screenshots/${row.ad_id}/main.png`;
    let fileBuffer = null;

    try {
      const { data: fileData, error: dlError } = await supabase.storage
        .from("creatives")
        .download(oldPath);

      if (dlError) {
        // 기존 버킷 이름이 다를 수 있으므로 lp-screenshots 버킷도 시도
        const { data: fileData2, error: dlError2 } = await supabase.storage
          .from("lp-screenshots")
          .download(`${row.ad_id}/main.png`);

        if (dlError2) {
          console.warn(
            `    [오류] Storage 다운로드 실패: ${oldPath} — ${dlError.message}`
          );
          errorCount++;
          continue;
        }
        fileBuffer = Buffer.from(await fileData2.arrayBuffer());
      } else {
        fileBuffer = Buffer.from(await fileData.arrayBuffer());
      }
    } catch (err) {
      console.warn(`    [오류] Storage 다운로드 예외:`, err.message);
      errorCount++;
      continue;
    }

    // 신규 경로로 업로드 (ADR-001)
    const newPath = `lp/${account_id}/${lp_id}/mobile_full.jpg`;
    try {
      const { error: upError } = await supabase.storage
        .from("creatives")
        .upload(newPath, fileBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (upError) {
        console.warn(
          `    [오류] Storage 업로드 실패: ${newPath} — ${upError.message}`
        );
        errorCount++;
        continue;
      }
    } catch (err) {
      console.warn(`    [오류] Storage 업로드 예외:`, err.message);
      errorCount++;
      continue;
    }

    // lp_snapshots INSERT
    try {
      const { error: insertError } = await supabase
        .from("lp_snapshots")
        .upsert(
          {
            lp_id,
            viewport: "mobile",
            screenshot_url: newPath,
            cta_screenshot_url: null,
            screenshot_hash: null,
            cta_screenshot_hash: null,
            section_screenshots: {},
            crawled_at: new Date().toISOString(),
            crawler_version: "v1-migrated",
          },
          { onConflict: "lp_id,viewport" }
        );

      if (insertError) {
        console.warn(
          `    [오류] lp_snapshots insert 실패: ${insertError.message}`
        );
        errorCount++;
        continue;
      }
    } catch (err) {
      console.warn(`    [오류] lp_snapshots insert 예외:`, err.message);
      errorCount++;
      continue;
    }

    console.log(`    [완료] ${newPath}`);
    existingSnapshots.add(snapshotKey);
    successCount++;
  }

  // 5. 결과 요약
  console.log(`\n━━━ 마이그레이션 결과 ━━━`);
  console.log(`총 대상: ${rows.length}건`);
  console.log(`성공: ${successCount}건`);
  console.log(`스킵 (이미 존재): ${skipCount}건`);
  console.log(`스킵 (매핑 없음): ${noMappingCount}건`);
  console.log(`오류: ${errorCount}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
