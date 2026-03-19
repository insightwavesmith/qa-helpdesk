#!/usr/bin/env node
/**
 * LP 크롤링 배치 트리거 — 직접 배치 + 비동기 큐 방식 모두 지원
 *
 * ══ 사용법 ══════════════════════════════════════════════════════════
 *
 * [직접 배치 모드]
 *   node scripts/trigger-lp-crawl.mjs [--batch-size N] [--repeat] [--dry-run] [--active-only]
 *
 * [큐 모드]
 *   node scripts/trigger-lp-crawl.mjs --enqueue             큐에 등록
 *   node scripts/trigger-lp-crawl.mjs --process [--batch-size N] [--repeat]  큐 처리
 *   node scripts/trigger-lp-crawl.mjs --status              큐 상태 확인
 *
 * ══ 옵션 ════════════════════════════════════════════════════════════
 *   --batch-size N  : 1회 배치 크기 (기본: 20)
 *   --repeat        : 남은 대상이 없을 때까지 반복
 *   --dry-run       : DB 조회만 하고 실제 크롤링/등록 없이 종료
 *   --active-only   : is_active=true 소재만 처리
 *   --enqueue       : 미크롤링 소재를 lp_crawl_queue에 등록
 *   --process       : 큐에서 pending 항목을 꺼내 Railway로 처리
 *   --status        : 큐 상태 출력 (pending/processing/completed/failed)
 *
 * ══ 큐 테이블 CREATE SQL (Supabase에서 수동 실행 필요) ══════════════
 *
 *   CREATE TABLE IF NOT EXISTS lp_crawl_queue (
 *     id           SERIAL PRIMARY KEY,
 *     ad_id        TEXT NOT NULL,
 *     lp_url       TEXT NOT NULL,
 *     status       TEXT NOT NULL DEFAULT 'pending'
 *                  CHECK (status IN ('pending','processing','completed','failed')),
 *     error_msg    TEXT,
 *     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     processed_at TIMESTAMPTZ
 *   );
 *
 *   CREATE INDEX IF NOT EXISTS lp_crawl_queue_status_idx ON lp_crawl_queue (status);
 *   CREATE UNIQUE INDEX IF NOT EXISTS lp_crawl_queue_ad_id_idx ON lp_crawl_queue (ad_id)
 *     WHERE status IN ('pending','processing');
 *
 * ══ 환경변수 ════════════════════════════════════════════════════════
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   CRAWLER_URL (기본: https://bscamp-crawler-production.up.railway.app)
 *   CRAWLER_SECRET (선택)
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── .env.local 파싱 ───────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(
      new URL("../.env.local", import.meta.url).pathname,
      "utf-8",
    );
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
    // .env.local 없으면 환경변수가 이미 설정된 것으로 가정
  }
}

loadEnvLocal();

// ── 설정 ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRAWLER_URL =
  process.env.CRAWLER_URL ||
  "https://bscamp-crawler-production.up.railway.app";
const CRAWLER_SECRET = process.env.CRAWLER_SECRET || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요",
  );
  process.exit(1);
}

// ── 인수 파싱 ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchSize = parseInt(
  args.find((_, i, a) => a[i - 1] === "--batch-size") || "5",
);
const repeat      = args.includes("--repeat");
const dryRun      = args.includes("--dry-run");
const filterActive = args.includes("--active-only");
// 큐 모드 옵션
const modeEnqueue = args.includes("--enqueue");
const modeProcess = args.includes("--process");
const modeStatus  = args.includes("--status");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════════════════════════════════
// 공용 헬퍼
// ═══════════════════════════════════════════════════════════════════

function buildSourceQuery(base) {
  let q = base.not("lp_url", "is", null).is("lp_screenshot_url", null);
  if (filterActive) q = q.eq("is_active", true);
  return q;
}

// ── Railway 배치 크롤링 호출 ──────────────────────────────────────
async function callCrawlerBatch(urls) {
  const res = await fetch(`${CRAWLER_URL}/crawl/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRAWLER_SECRET ? { Authorization: `Bearer ${CRAWLER_SECRET}` } : {}),
    },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(300_000), // 5분
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return await res.json();
}

// ── 크롤링 결과 → ad_creative_embeddings 업데이트 ─────────────────
async function saveResults(rows, batchResult) {
  let saved = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = batchResult.results?.[i];

    if (!result) {
      errors.push(`${row.ad_id}: 크롤링 결과 없음`);
      failed++;
      continue;
    }

    const updates = {
      lp_headline:     result.text?.headline || null,
      lp_price:        result.text?.price || null,
      screenshot_hash: result.screenshotHash || null,
      lp_crawled_at:   new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    if (result.screenshot) {
      const mainUrl = await uploadScreenshot(row.ad_id, "main", result.screenshot);
      if (mainUrl) updates.lp_screenshot_url = mainUrl;
    }
    if (result.ctaScreenshot) {
      const ctaUrl = await uploadScreenshot(row.ad_id, "cta", result.ctaScreenshot);
      if (ctaUrl) updates.lp_cta_screenshot_url = ctaUrl;
    }

    const { error: updateErr } = await supabase
      .from("ad_creative_embeddings")
      .update(updates)
      .eq("id", row.id);

    if (updateErr) {
      errors.push(`${row.ad_id} update: ${updateErr.message}`);
      failed++;
    } else {
      saved++;
    }
  }

  return { saved, failed, errors };
}

// ── Supabase Storage 업로드 ───────────────────────────────────────
async function uploadScreenshot(adId, type, base64Data) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const path = `lp-screenshots/${adId}/${type}.png`;

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, { contentType: "image/png", upsert: true });

    if (error) {
      console.warn(`  [스토리지] 업로드 실패 ${adId}/${type}: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from("creatives").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn(`  [스토리지] 에러 ${adId}/${type}: ${err.message}`);
    return null;
  }
}

// ── Railway 헬스 체크 ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${CRAWLER_URL}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 직접 배치 모드
// ═══════════════════════════════════════════════════════════════════

async function getDirectPendingCount() {
  const q = supabase
    .from("ad_creative_embeddings")
    .select("id", { count: "exact", head: true });
  const { count, error } = await buildSourceQuery(q);
  if (error) throw new Error(`DB count 조회 실패: ${error.message}`);
  return count ?? 0;
}

async function fetchDirectBatch(limit) {
  const q = supabase
    .from("ad_creative_embeddings")
    .select("id, ad_id, lp_url");
  const { data, error } = await buildSourceQuery(q).limit(limit);
  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data ?? [];
}

async function runDirectBatch() {
  const pendingTotal = await getDirectPendingCount();
  console.log(`미완료 LP: ${pendingTotal}건`);

  if (pendingTotal === 0) {
    console.log("크롤링 대상 없음 — 모두 완료된 상태입니다.");
    return;
  }

  if (dryRun) {
    console.log("[dry-run] 실제 크롤링 없이 종료.");
    return;
  }

  console.log(`\nRailway 헬스 체크 중...`);
  const health = await checkHealth();
  if (!health) {
    console.error("Railway 서비스 응답 없음 — 크롤러가 실행 중인지 확인하세요.");
    process.exit(1);
  }
  console.log(`Railway 정상 — ${JSON.stringify(health)}\n`);

  let totalCrawled = 0;
  let totalSaved = 0;
  let totalFailed = 0;
  let round = 0;

  do {
    round++;
    const remaining = await getDirectPendingCount();

    if (remaining === 0) {
      console.log(`\n모든 LP 크롤링 완료!`);
      break;
    }

    console.log(`\n━━━ Round ${round} (남은 건수: ${remaining}) ━━━`);
    const rows = await fetchDirectBatch(batchSize);

    if (rows.length === 0) {
      console.log("조회된 대상 없음 — 종료.");
      break;
    }

    const urls = rows.map((r) => r.lp_url);
    console.log(`크롤링 중: ${urls.length}건...`);
    urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

    const t0 = Date.now();

    let batchResult;
    try {
      batchResult = await callCrawlerBatch(urls);
    } catch (err) {
      console.error(`  크롤러 호출 실패: ${err.message.slice(0, 300)}`);
      if (!repeat) process.exit(1);
      console.log("10초 후 재시도...");
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    totalCrawled += rows.length;

    const { saved, failed, errors } = await saveResults(rows, batchResult);
    totalSaved += saved;
    totalFailed += failed;

    console.log(`완료: ${saved}건 저장, ${failed}건 실패 (${elapsed}초)`);
    if (errors.length > 0) errors.forEach((e) => console.warn(`  오류: ${e}`));
    if (batchResult.errors?.length > 0) {
      batchResult.errors.forEach((e) => console.warn(`  크롤러 오류: ${e}`));
    }

    if (!repeat) break;

    if (remaining - rows.length > 0) {
      console.log("3초 대기 중...");
      await new Promise((r) => setTimeout(r, 3_000));
    }
  } while (repeat);

  console.log(`\n━━━ 최종 결과 ━━━`);
  console.log(`총 처리: ${totalCrawled}건`);
  console.log(`저장 성공: ${totalSaved}건`);
  console.log(`저장 실패: ${totalFailed}건`);
  console.log(`라운드: ${round}회`);
}

// ═══════════════════════════════════════════════════════════════════
// 큐 모드 — --enqueue
// ═══════════════════════════════════════════════════════════════════

async function runEnqueue() {
  console.log(`\n[큐 등록] lp_screenshot_url 없는 소재를 lp_crawl_queue에 등록`);

  // 1. 소스 데이터 조회 (전체, 페이지네이션)
  let allRows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const q = supabase
      .from("ad_creative_embeddings")
      .select("ad_id, lp_url")
      .range(offset, offset + PAGE - 1);
    const { data, error } = await buildSourceQuery(q);
    if (error) throw new Error(`소스 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`소스 소재: ${allRows.length}건`);

  if (allRows.length === 0) {
    console.log("등록할 소재 없음.");
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] ${allRows.length}건 등록 대상 확인 — 실제 등록 없이 종료.`);
    return;
  }

  // 2. 이미 큐에 있는 ad_id 조회 (pending/processing 상태만)
  const { data: existingRows, error: existErr } = await supabase
    .from("lp_crawl_queue")
    .select("ad_id")
    .in("status", ["pending", "processing"]);

  if (existErr) throw new Error(`큐 조회 실패: ${existErr.message}`);
  const existingSet = new Set((existingRows ?? []).map((r) => r.ad_id));

  // 3. 신규 항목만 필터
  const newRows = allRows.filter((r) => !existingSet.has(r.ad_id));
  console.log(`신규 등록 대상: ${newRows.length}건 (이미 큐에 있음: ${existingSet.size}건)`);

  if (newRows.length === 0) {
    console.log("모두 이미 큐에 등록되어 있습니다.");
    return;
  }

  // 4. 배치 INSERT (500건씩)
  const INSERT_CHUNK = 500;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < newRows.length; i += INSERT_CHUNK) {
    const chunk = newRows.slice(i, i + INSERT_CHUNK).map((r) => ({
      ad_id:  r.ad_id,
      lp_url: r.lp_url,
      status: "pending",
    }));

    const { error: insertErr } = await supabase
      .from("lp_crawl_queue")
      .insert(chunk);

    if (insertErr) {
      console.warn(`  INSERT 실패 (offset ${i}): ${insertErr.message}`);
      failed += chunk.length;
    } else {
      inserted += chunk.length;
      process.stdout.write(`  등록 중... ${inserted}/${newRows.length}\r`);
    }
  }

  console.log(`\n\n등록 완료: ${inserted}건 성공, ${failed}건 실패`);
}

// ═══════════════════════════════════════════════════════════════════
// 큐 모드 — --process
// ═══════════════════════════════════════════════════════════════════

async function getQueuePendingCount() {
  const { count, error } = await supabase
    .from("lp_crawl_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(`큐 count 조회 실패: ${error.message}`);
  return count ?? 0;
}

async function fetchQueueBatch(limit) {
  // pending → processing 으로 먼저 선점 후 처리 (중복 방지)
  const { data, error } = await supabase
    .from("lp_crawl_queue")
    .select("id, ad_id, lp_url")
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`큐 조회 실패: ${error.message}`);
  return data ?? [];
}

async function markQueueProcessing(ids) {
  const { error } = await supabase
    .from("lp_crawl_queue")
    .update({ status: "processing" })
    .in("id", ids);
  if (error) throw new Error(`status 업데이트 실패: ${error.message}`);
}

async function markQueueCompleted(ids) {
  const { error } = await supabase
    .from("lp_crawl_queue")
    .update({ status: "completed", processed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) console.warn(`  completed 마킹 실패: ${error.message}`);
}

async function markQueueFailed(id, errorMsg) {
  const { error } = await supabase
    .from("lp_crawl_queue")
    .update({
      status:       "failed",
      error_msg:    String(errorMsg).slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) console.warn(`  failed 마킹 실패: ${error.message}`);
}

async function runProcess() {
  console.log(`\n[큐 처리] lp_crawl_queue pending 항목을 Railway로 처리`);

  const pendingTotal = await getQueuePendingCount();
  console.log(`큐 pending: ${pendingTotal}건`);

  if (pendingTotal === 0) {
    console.log("처리할 큐 항목 없음.");
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] ${pendingTotal}건 처리 대상 확인 — 실제 처리 없이 종료.`);
    return;
  }

  console.log(`\nRailway 헬스 체크 중...`);
  const health = await checkHealth();
  if (!health) {
    console.error("Railway 서비스 응답 없음 — 크롤러가 실행 중인지 확인하세요.");
    process.exit(1);
  }
  console.log(`Railway 정상 — ${JSON.stringify(health)}\n`);

  let totalProcessed = 0;
  let totalSaved = 0;
  let totalFailed = 0;
  let round = 0;

  do {
    round++;
    const remaining = await getQueuePendingCount();

    if (remaining === 0) {
      console.log(`\n큐 모두 처리 완료!`);
      break;
    }

    console.log(`\n━━━ Round ${round} (큐 남은 건수: ${remaining}) ━━━`);
    const queueRows = await fetchQueueBatch(batchSize);

    if (queueRows.length === 0) {
      console.log("조회된 큐 항목 없음 — 종료.");
      break;
    }

    // 선점: pending → processing
    const queueIds = queueRows.map((r) => r.id);
    await markQueueProcessing(queueIds);

    // ad_creative_embeddings에서 실제 row id 조회 (saveResults에 필요)
    const adIds = queueRows.map((r) => r.ad_id);
    const { data: sourceRows, error: srcErr } = await supabase
      .from("ad_creative_embeddings")
      .select("id, ad_id, lp_url")
      .in("ad_id", adIds);

    if (srcErr) {
      console.error(`  소스 row 조회 실패: ${srcErr.message}`);
      // 전부 failed 처리
      for (const qr of queueRows) await markQueueFailed(qr.id, srcErr.message);
      if (!repeat) process.exit(1);
      continue;
    }

    const sourceMap = new Map((sourceRows ?? []).map((r) => [r.ad_id, r]));

    const urls = queueRows.map((r) => r.lp_url);
    console.log(`크롤링 중: ${urls.length}건...`);
    urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

    const t0 = Date.now();

    let batchResult;
    try {
      batchResult = await callCrawlerBatch(urls);
      // 크롤러 브라우저 안정화 대기
      await new Promise((r) => setTimeout(r, 2_000));
    } catch (err) {
      console.error(`  크롤러 호출 실패: ${err.message.slice(0, 300)}`);
      // 전부 failed → pending으로 리셋 (재시도 가능)
      for (const qr of queueRows) {
        await supabase
          .from("lp_crawl_queue")
          .update({ status: "pending", error_msg: String(err.message).slice(0, 500) })
          .eq("id", qr.id);
      }
      if (!repeat) process.exit(1);
      console.log("15초 후 재시도...");
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    totalProcessed += queueRows.length;

    // 결과 처리: 큐 row 기준으로 순회
    const completedIds = [];
    let saved = 0;
    let failed = 0;

    for (let i = 0; i < queueRows.length; i++) {
      const qr = queueRows[i];
      const result = batchResult.results?.[i];
      const sourceRow = sourceMap.get(qr.ad_id);

      if (!result || !sourceRow) {
        await markQueueFailed(qr.id, result ? "소스 row 없음" : "크롤링 결과 없음");
        failed++;
        continue;
      }

      // ad_creative_embeddings 업데이트
      const updates = {
        lp_headline:     result.text?.headline || null,
        lp_price:        result.text?.price || null,
        screenshot_hash: result.screenshotHash || null,
        lp_crawled_at:   new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      };

      if (result.screenshot) {
        const mainUrl = await uploadScreenshot(qr.ad_id, "main", result.screenshot);
        if (mainUrl) updates.lp_screenshot_url = mainUrl;
      }
      if (result.ctaScreenshot) {
        const ctaUrl = await uploadScreenshot(qr.ad_id, "cta", result.ctaScreenshot);
        if (ctaUrl) updates.lp_cta_screenshot_url = ctaUrl;
      }

      const { error: updateErr } = await supabase
        .from("ad_creative_embeddings")
        .update(updates)
        .eq("id", sourceRow.id);

      if (updateErr) {
        await markQueueFailed(qr.id, updateErr.message);
        failed++;
        console.warn(`  오류: ${qr.ad_id} update: ${updateErr.message}`);
      } else {
        completedIds.push(qr.id);
        saved++;
      }
    }

    // 성공 항목 일괄 completed
    if (completedIds.length > 0) await markQueueCompleted(completedIds);

    totalSaved += saved;
    totalFailed += failed;

    console.log(`완료: ${saved}건 저장, ${failed}건 실패 (${elapsed}초)`);
    if (batchResult.errors?.length > 0) {
      batchResult.errors.forEach((e) => console.warn(`  크롤러 오류: ${e}`));
    }

    if (!repeat) break;

    if (remaining - queueRows.length > 0) {
      console.log("5초 대기 중...");
      await new Promise((r) => setTimeout(r, 5_000));
    }
  } while (repeat);

  console.log(`\n━━━ 최종 결과 ━━━`);
  console.log(`총 처리: ${totalProcessed}건`);
  console.log(`저장 성공: ${totalSaved}건`);
  console.log(`저장 실패: ${totalFailed}건`);
  console.log(`라운드: ${round}회`);
}

// ═══════════════════════════════════════════════════════════════════
// 큐 모드 — --status
// ═══════════════════════════════════════════════════════════════════

async function runStatus() {
  console.log(`\n[큐 상태] lp_crawl_queue\n`);

  // 상태별 건수
  const statuses = ["pending", "processing", "completed", "failed"];
  const counts = {};

  for (const s of statuses) {
    const { count, error } = await supabase
      .from("lp_crawl_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    if (error) {
      counts[s] = `조회 실패: ${error.message}`;
    } else {
      counts[s] = count ?? 0;
    }
  }

  const total = statuses.reduce((acc, s) => acc + (typeof counts[s] === "number" ? counts[s] : 0), 0);

  console.log(`┌─────────────────────────────┐`);
  console.log(`│      lp_crawl_queue 현황     │`);
  console.log(`├──────────────┬──────────────┤`);
  console.log(`│ 전체         │ ${String(total).padStart(12)} │`);
  console.log(`├──────────────┼──────────────┤`);
  for (const s of statuses) {
    const label = s.padEnd(12);
    const val = String(counts[s]).padStart(12);
    console.log(`│ ${label} │ ${val} │`);
  }
  console.log(`└──────────────┴──────────────┘`);

  // 직접 배치 모드 현황도 함께 출력
  const pendingDirect = await getDirectPendingCount();
  console.log(`\n[직접 배치] 미크롤링 소재 (ad_creative_embeddings): ${pendingDirect}건`);

  // 최근 failed 5건 출력
  if (typeof counts["failed"] === "number" && counts["failed"] > 0) {
    const { data: failedRows } = await supabase
      .from("lp_crawl_queue")
      .select("id, ad_id, lp_url, error_msg, processed_at")
      .eq("status", "failed")
      .order("processed_at", { ascending: false })
      .limit(5);

    if (failedRows && failedRows.length > 0) {
      console.log(`\n최근 실패 항목 (최대 5건):`);
      for (const r of failedRows) {
        console.log(`  [${r.id}] ${r.ad_id} — ${r.error_msg || "에러 없음"}`);
        console.log(`        ${r.lp_url}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 엔트리포인트
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const mode = modeEnqueue
    ? "큐 등록 (--enqueue)"
    : modeProcess
    ? "큐 처리 (--process)"
    : modeStatus
    ? "상태 확인 (--status)"
    : "직접 배치";

  console.log(`\nLP 크롤링 배치 트리거`);
  console.log(`모드: ${mode}`);
  console.log(`크롤러: ${CRAWLER_URL}`);
  if (!modeStatus) {
    console.log(`배치 크기: ${batchSize}건 / 반복: ${repeat} / dry-run: ${dryRun} / active-only: ${filterActive}`);
  }
  console.log(`시작: ${new Date().toLocaleString("ko-KR")}`);

  if (modeEnqueue) {
    await runEnqueue();
  } else if (modeProcess) {
    await runProcess();
  } else if (modeStatus) {
    await runStatus();
  } else {
    await runDirectBatch();
  }

  console.log(`\n종료: ${new Date().toLocaleString("ko-KR")}`);
}

main().catch((e) => {
  console.error("치명적 에러:", e.message);
  process.exit(1);
});
