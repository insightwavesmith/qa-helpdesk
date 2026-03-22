#!/usr/bin/env node
/**
 * LP Storage 경로 마이그레이션: 플랫 → 계정 종속 구조
 *
 * 기존: creatives/lp/{lp_id}/{viewport}_{section}.jpg
 * 신규: creatives/lp/{account_id}/{lp_id}/{viewport}_{section}.jpg
 *
 * ADR-001 준수: lp/{account_id}/{lp_id}/...
 *
 * Usage:
 *   node scripts/migrate-lp-storage-paths.mjs
 *   node scripts/migrate-lp-storage-paths.mjs --dry-run
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ── .env.local 파싱 ───────────────────────────────
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const BUCKET = "creatives";
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;

// ── 헬퍼 ─────────────────────────────────────────
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
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

async function storageMove(sourceKey, destKey) {
  const res = await fetch(`${SB_URL}/storage/v1/object/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: BUCKET,
      sourceKey,
      destinationKey: destKey,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`move 실패 (${res.status}): ${text}`);
  }
}

function replaceUrlKey(url, oldKey, newKey) {
  if (!url) return null;
  return url.replace(PUBLIC_PREFIX + oldKey, PUBLIC_PREFIX + newKey);
}

// ── main ─────────────────────────────────────────
async function main() {
  console.log(`LP Storage 경로 마이그레이션${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`기존: lp/{lp_id}/...\n신규: lp/{account_id}/{lp_id}/...\n`);

  // 1. lp_id → account_id 매핑
  const lpList = await sbGet("/landing_pages?select=id,account_id");
  const lpAccountMap = new Map();
  for (const lp of lpList) {
    if (lp.account_id) lpAccountMap.set(lp.id, lp.account_id);
  }
  console.log(`LP → account_id 매핑: ${lpAccountMap.size}건\n`);

  // 2. 기존 스냅샷 조회
  const PAGE_SIZE = 1000;
  let offset = 0;
  const snapshots = [];
  while (true) {
    const batch = await sbGet(
      `/lp_snapshots?select=id,lp_id,viewport,screenshot_url,cta_screenshot_url,section_screenshots` +
        `&screenshot_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    snapshots.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`대상 스냅샷: ${snapshots.length}건\n`);

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const prefix = `[${i + 1}/${snapshots.length}]`;
    const accountId = lpAccountMap.get(snap.lp_id);

    if (!accountId) {
      console.log(`${prefix} ⚠ lp ${snap.lp_id} — account_id 없음 — 스킵`);
      skipped++;
      continue;
    }

    // 현재 screenshot_url에서 key 추출
    const currentKey = snap.screenshot_url.replace(PUBLIC_PREFIX, "");

    // 이미 새 경로인지 확인 (lp/{account_id}/{lp_id}/... 패턴)
    if (currentKey.startsWith(`lp/${accountId}/${snap.lp_id}/`)) {
      console.log(`${prefix} ✓ ${snap.lp_id} ${snap.viewport} — 이미 올바른 경로`);
      skipped++;
      continue;
    }

    // 이동할 파일 목록 수집: screenshot_url, cta_screenshot_url, section_screenshots 내 URL들
    const oldPrefix = `lp/${snap.lp_id}/`;
    const newPrefix = `lp/${accountId}/${snap.lp_id}/`;
    const filesToMove = [];

    // screenshot_url (full)
    if (snap.screenshot_url) {
      const key = snap.screenshot_url.replace(PUBLIC_PREFIX, "");
      if (key.startsWith(oldPrefix)) {
        filesToMove.push({ oldKey: key, newKey: key.replace(oldPrefix, newPrefix) });
      }
    }

    // cta_screenshot_url
    if (snap.cta_screenshot_url) {
      const key = snap.cta_screenshot_url.replace(PUBLIC_PREFIX, "");
      if (key.startsWith(oldPrefix)) {
        filesToMove.push({ oldKey: key, newKey: key.replace(oldPrefix, newPrefix) });
      }
    }

    // section_screenshots (hero, detail, review, cta)
    const sections = snap.section_screenshots || {};
    for (const [secName, secUrl] of Object.entries(sections)) {
      if (secUrl) {
        const key = secUrl.replace(PUBLIC_PREFIX, "");
        if (key.startsWith(oldPrefix)) {
          // 중복 방지 (cta는 이미 위에서 처리될 수 있음)
          if (!filesToMove.some((f) => f.oldKey === key)) {
            filesToMove.push({ oldKey: key, newKey: key.replace(oldPrefix, newPrefix) });
          }
        }
      }
    }

    if (DRY_RUN) {
      console.log(`${prefix} [dry-run] ${snap.lp_id} ${snap.viewport} — ${filesToMove.length}파일`);
      for (const f of filesToMove) {
        console.log(`    ${f.oldKey} → ${f.newKey}`);
      }
      moved++;
      continue;
    }

    // Storage 파일 이동
    let moveOk = true;
    for (const f of filesToMove) {
      try {
        await storageMove(f.oldKey, f.newKey);
      } catch (err) {
        console.error(`${prefix} ✗ ${f.oldKey} — ${err.message}`);
        moveOk = false;
      }
    }

    if (!moveOk) {
      errors++;
      continue;
    }

    // DB 업데이트
    const updatedScreenshotUrl = replaceUrlKey(snap.screenshot_url, oldPrefix, newPrefix);
    const updatedCtaUrl = replaceUrlKey(snap.cta_screenshot_url, oldPrefix, newPrefix);
    const updatedSections = {};
    for (const [secName, secUrl] of Object.entries(sections)) {
      updatedSections[secName] = secUrl
        ? secUrl.replace(PUBLIC_PREFIX + oldPrefix, PUBLIC_PREFIX + newPrefix)
        : null;
    }

    const patchBody = {
      screenshot_url: updatedScreenshotUrl,
      ...(snap.cta_screenshot_url ? { cta_screenshot_url: updatedCtaUrl } : {}),
      section_screenshots: updatedSections,
    };

    const result = await sbPatch("lp_snapshots", `id=eq.${snap.id}`, patchBody);
    if (result.ok) {
      console.log(`${prefix} ✅ ${snap.lp_id} ${snap.viewport} — ${filesToMove.length}파일 이동`);
      moved++;
    } else {
      console.error(`${prefix} ⚠ DB 업데이트 실패: ${result.body}`);
      errors++;
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`이동: ${moved}건, 스킵: ${skipped}건, 실패: ${errors}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
