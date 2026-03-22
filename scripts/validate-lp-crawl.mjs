#!/usr/bin/env node
/**
 * LP 사전 검증 — landing_pages URL 상태 확인
 * Usage: node scripts/validate-lp-crawl.mjs [--dry-run] [--fix]
 *
 * --dry-run: 검증만 (DB 변경 없음) ← 기본값
 * --fix:     실패 URL을 is_active=false로 업데이트
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes("--fix");
const FIX = process.argv.includes("--fix");

// .env.local 읽기
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
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ─── Supabase REST 헬퍼 ───────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, filter, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

// ─── URL 정규화 ───────────────────────────────────────────────────────────────

function normalizeUrl(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 프로토콜이 없으면 https:// 추가
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

// URL이 '유의미하게 다른지' 판단 (도메인 기준)
function urlsDiffer(a, b) {
  try {
    const domainA = new URL(a).hostname.replace(/^www\./, "");
    const domainB = new URL(b).hostname.replace(/^www\./, "");
    return domainA !== domainB;
  } catch {
    return true;
  }
}

// ─── 단건 LP 검증 ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;

/**
 * @returns {{ status: number|'timeout'|'error', finalUrl: string, ms: number }}
 */
async function checkUrl(url) {
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      status: res.status,
      finalUrl: res.url || url,
      ms: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout =
      err.name === "AbortError" || err.message?.includes("abort");
    return {
      status: isTimeout ? "timeout" : "error",
      finalUrl: url,
      ms: Date.now() - start,
      errorMessage: isTimeout ? "timeout" : err.message,
    };
  }
}

// ─── 동시성 제한 실행 ─────────────────────────────────────────────────────────

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── 분류 헬퍼 ───────────────────────────────────────────────────────────────

function classify(lp, check) {
  const { status, finalUrl, ms } = check;

  if (status === "timeout" || status === "error") {
    return { label: "failed", icon: "❌", note: status === "timeout" ? "timeout" : "error" };
  }

  if (status === 200) {
    return { label: "ok", icon: "✅", note: `${ms}ms` };
  }

  if (status === 301 || status === 302) {
    const canonical = normalizeUrl(lp.canonical_url || lp.url);
    const differs = canonical ? urlsDiffer(finalUrl, canonical) : false;
    return {
      label: "redirect",
      icon: "🔄",
      note: differs
        ? `→ ${finalUrl} (도메인 변경)`
        : `→ ${finalUrl}`,
      flagged: differs,
    };
  }

  // 4xx, 5xx, 기타
  return { label: "failed", icon: "❌", note: `${status}` };
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\nLP 사전 검증${DRY_RUN && !FIX ? " (dry-run — DB 변경 없음)" : " (--fix 모드)"}\n`
  );

  // 1. landing_pages 조회
  const rows = await sbGet(
    "/landing_pages?page_type=eq.product&is_active=eq.true&order=domain.asc"
  );

  if (!rows || rows.length === 0) {
    console.log("검증 대상 LP 없음 (page_type=product, is_active=true).");
    return;
  }

  console.log(`검증 대상: ${rows.length}개\n`);

  // 2. 동시성 5로 검증
  const CONCURRENCY = 5;

  const checkResults = await mapConcurrent(rows, CONCURRENCY, async (lp, i) => {
    const rawUrl = lp.url || lp.canonical_url;
    const url = normalizeUrl(rawUrl);

    if (!url) {
      process.stdout.write(`[${i + 1}/${rows.length}] (URL 없음) ❌ 스킵\n`);
      return { lp, check: { status: "error", finalUrl: "", ms: 0, errorMessage: "URL 없음" } };
    }

    const check = await checkUrl(url);
    const cls = classify(lp, check);

    const domain = lp.domain || url;
    process.stdout.write(
      `[${i + 1}/${rows.length}] ${domain} ${cls.icon} ${check.status} (${check.ms}ms)${cls.flagged ? " ⚠ 도메인 변경" : ""}\n`
    );

    return { lp, check, cls };
  });

  // 3. 집계
  const okList = [];
  const redirectList = [];
  const failedList = [];

  for (const r of checkResults) {
    const { lp, check, cls } = r;
    if (!cls) continue; // URL 없음 → failed 처리
    switch (cls.label) {
      case "ok":
        okList.push({ lp, check, cls });
        break;
      case "redirect":
        redirectList.push({ lp, check, cls });
        break;
      default:
        failedList.push({ lp, check, cls });
    }
  }

  // URL 없는 건도 failed에 추가
  for (const r of checkResults) {
    if (!r.cls) failedList.push(r);
  }

  // 4. 요약 출력
  console.log("\n━━━ LP 검증 결과 ━━━");
  console.log(`전체: ${rows.length}개`);
  console.log(`✅ 정상: ${okList.length}개`);
  console.log(`🔄 리다이렉트: ${redirectList.length}개`);
  console.log(`❌ 실패: ${failedList.length}개`);

  if (redirectList.length > 0) {
    console.log("\n🔄 리다이렉트 목록:");
    for (const { lp, check, cls } of redirectList) {
      const domain = lp.domain || lp.url || "(unknown)";
      console.log(`  - ${domain} ${cls.note}${cls.flagged ? " ⚠" : ""}`);
    }
  }

  if (failedList.length > 0) {
    console.log("\n❌ 실패 목록:");
    for (const { lp, check, cls } of failedList) {
      const domain = lp.domain || lp.url || "(unknown)";
      const note = cls ? cls.note : (check?.errorMessage || "unknown");
      console.log(`  - ${domain} (${note})`);
    }
  }

  // 5. --fix: 실패 LP를 is_active=false로 업데이트
  if (FIX && failedList.length > 0) {
    console.log(`\n--fix 모드: ${failedList.length}개 실패 LP → is_active=false 업데이트`);

    let updated = 0;
    let errors = 0;

    for (const { lp } of failedList) {
      if (!lp.id) continue;
      const result = await sbPatch("landing_pages", `id=eq.${lp.id}`, {
        is_active: false,
      });
      if (result.ok) {
        updated++;
      } else {
        errors++;
        console.warn(`  PATCH 실패 (id=${lp.id}): HTTP ${result.status}`);
      }
    }

    console.log(`  업데이트 완료: ${updated}개, 실패: ${errors}개`);
  } else if (DRY_RUN && failedList.length > 0) {
    console.log(
      `\n[dry-run] ${failedList.length}개 실패 LP가 있습니다. --fix 플래그로 재실행하면 is_active=false 처리됩니다.`
    );
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
