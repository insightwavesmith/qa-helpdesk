#!/usr/bin/env node
/**
 * Supabase Storage → GCS 파일 복사 스크립트
 *
 * Supabase Storage의 모든 공개 파일을 GCS(bscamp-storage)로 복사한다.
 * DB에 저장된 Supabase URL을 기반으로 실제 파일만 복사한다.
 *
 * 사전 조건:
 *   1. gcloud CLI 설치 + 인증 완료 (gcloud auth login)
 *   2. gsutil 사용 가능 (gcloud components install gsutil)
 *   3. GCS 버킷 bscamp-storage 생성 완료
 *   4. 환경변수: SUPABASE_DB_URL (PostgreSQL 연결 문자열)
 *
 * 사용법:
 *   # 드라이런 (복사 없이 URL 목록만 출력)
 *   node scripts/copy-supabase-to-gcs.mjs --dry-run
 *
 *   # 실제 복사 실행
 *   node scripts/copy-supabase-to-gcs.mjs
 *
 *   # 특정 버킷만 복사
 *   node scripts/copy-supabase-to-gcs.mjs --bucket content-images
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ─── 설정 ───────────────────────────────────────────────────────────────────

const SUPABASE_PROJECT_ID = "symvlrsmkjlztoopbnht";
const SUPABASE_STORAGE_PREFIX = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public`;
const GCS_BUCKET = "bscamp-storage";
const GCS_PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;
const TEMP_DIR = "/tmp/supabase-to-gcs";

// Supabase Storage 버킷 목록 (코드에서 사용하는 전체 목록)
const KNOWN_BUCKETS = [
  "question-images",
  "qa-images",
  "content-images",
  "review-images",
  "documents",
  "email-attachments",
  "creatives",
];

// DB에서 Supabase URL을 추출하는 쿼리들
const URL_EXTRACTION_QUERIES = [
  // TEXT 컬럼 — 직접 URL 추출
  {
    name: "contents.thumbnail_url",
    sql: `SELECT DISTINCT thumbnail_url AS url FROM contents WHERE thumbnail_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "contents.body_md",
    sql: `SELECT DISTINCT unnest(regexp_matches(body_md, 'https://${SUPABASE_PROJECT_ID}\\.supabase\\.co/storage/v1/object/public/[^)\"\\s]+', 'g')) AS url FROM contents WHERE body_md LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "contents.email_html",
    sql: `SELECT DISTINCT unnest(regexp_matches(email_html, 'https://${SUPABASE_PROJECT_ID}\\.supabase\\.co/storage/v1/object/public/[^"''\\s>]+', 'g')) AS url FROM contents WHERE email_html LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "contents.video_url",
    sql: `SELECT DISTINCT video_url AS url FROM contents WHERE video_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "knowledge_chunks.image_url",
    sql: `SELECT DISTINCT image_url AS url FROM knowledge_chunks WHERE image_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "profiles.business_cert_url",
    sql: `SELECT DISTINCT business_cert_url AS url FROM profiles WHERE business_cert_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "creative_media.storage_url",
    sql: `SELECT DISTINCT storage_url AS url FROM creative_media WHERE storage_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "creative_media.media_url",
    sql: `SELECT DISTINCT media_url AS url FROM creative_media WHERE media_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "creative_media.thumbnail_url",
    sql: `SELECT DISTINCT thumbnail_url AS url FROM creative_media WHERE thumbnail_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "creative_media.saliency_url",
    sql: `SELECT DISTINCT saliency_url AS url FROM creative_media WHERE saliency_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "lp_snapshots.screenshot_url",
    sql: `SELECT DISTINCT screenshot_url AS url FROM lp_snapshots WHERE screenshot_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "lp_snapshots.cta_screenshot_url",
    sql: `SELECT DISTINCT cta_screenshot_url AS url FROM lp_snapshots WHERE cta_screenshot_url LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  // JSONB 컬럼 — 배열 내 URL 추출
  {
    name: "answers.image_urls",
    sql: `SELECT DISTINCT jsonb_array_elements_text(image_urls) AS url FROM answers WHERE image_urls IS NOT NULL AND image_urls::text LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "questions.image_urls",
    sql: `SELECT DISTINCT jsonb_array_elements_text(image_urls) AS url FROM questions WHERE image_urls IS NOT NULL AND image_urls::text LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  {
    name: "contents.images",
    sql: `SELECT DISTINCT jsonb_array_elements_text(images) AS url FROM contents WHERE images IS NOT NULL AND images::text LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
  // TEXT[] 컬럼
  {
    name: "reviews.image_urls",
    sql: `SELECT DISTINCT unnest(image_urls) AS url FROM reviews WHERE image_urls::text LIKE '%${SUPABASE_PROJECT_ID}.supabase.co/storage%'`,
  },
];

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

/**
 * Supabase URL에서 GCS 경로 추출
 * Input:  https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/path/file.jpg
 * Output: content-images/path/file.jpg
 */
function extractGcsPath(supabaseUrl) {
  const prefix = "/storage/v1/object/public/";
  const idx = supabaseUrl.indexOf(prefix);
  if (idx === -1) return null;
  return supabaseUrl.slice(idx + prefix.length);
}

/**
 * psql로 쿼리 실행하여 URL 목록 반환
 */
function queryUrls(dbUrl, sql) {
  try {
    const result = execSync(
      `psql "${dbUrl}" -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: 30_000 },
    );
    return result
      .trim()
      .split("\n")
      .filter((line) => line.includes("supabase.co"));
  } catch {
    return [];
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const bucketFilter = args.includes("--bucket")
    ? args[args.indexOf("--bucket") + 1]
    : null;

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(`
사용법: SUPABASE_DB_URL="postgresql://..." node scripts/copy-supabase-to-gcs.mjs [--dry-run] [--bucket <name>]

환경변수:
  SUPABASE_DB_URL  PostgreSQL 연결 문자열
                   예: postgresql://postgres:password@db.symvlrsmkjlztoopbnht.supabase.co:5432/postgres

옵션:
  --dry-run        복사 없이 URL 목록만 출력
  --bucket <name>  특정 버킷만 처리 (예: content-images)
`);
    process.exit(1);
  }

  // gsutil 사용 가능 여부 확인
  if (!dryRun) {
    try {
      execSync("gsutil version", { stdio: "ignore" });
    } catch {
      console.error("gsutil이 설치되지 않았습니다. gcloud CLI를 먼저 설치하세요.");
      console.error("  brew install google-cloud-sdk");
      console.error("  gcloud auth login");
      process.exit(1);
    }
  }

  log("=== Supabase Storage → GCS 파일 복사 시작 ===");
  if (dryRun) log("*** DRY RUN 모드 — 실제 복사 없음 ***");
  if (bucketFilter) log(`*** 버킷 필터: ${bucketFilter} ***`);

  // Step 1: DB에서 모든 Supabase URL 수집
  log("Step 1: DB에서 Supabase Storage URL 수집 중...");
  const allUrls = new Set();

  for (const query of URL_EXTRACTION_QUERIES) {
    const urls = queryUrls(dbUrl, query.sql);
    if (urls.length > 0) {
      log(`  ${query.name}: ${urls.length}개 URL 발견`);
      urls.forEach((u) => allUrls.add(u));
    }
  }

  log(`총 ${allUrls.size}개 고유 Supabase URL 발견`);

  if (allUrls.size === 0) {
    log("마이그레이션할 파일 없음. 완료.");
    process.exit(0);
  }

  // Step 2: 버킷별로 분류
  const byBucket = {};
  for (const url of allUrls) {
    const gcsPath = extractGcsPath(url);
    if (!gcsPath) {
      logError(`경로 추출 실패: ${url}`);
      continue;
    }
    const bucket = gcsPath.split("/")[0];
    if (bucketFilter && bucket !== bucketFilter) continue;
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push({ supabaseUrl: url, gcsPath });
  }

  log("\n=== 버킷별 파일 수 ===");
  for (const [bucket, files] of Object.entries(byBucket)) {
    log(`  ${bucket}: ${files.length}개`);
  }

  // DRY RUN: URL 목록만 파일로 저장
  if (dryRun) {
    const reportPath = join(process.cwd(), "scripts/supabase-urls-report.txt");
    const lines = [];
    for (const [bucket, files] of Object.entries(byBucket)) {
      lines.push(`\n── ${bucket} (${files.length}개) ──`);
      for (const f of files) {
        lines.push(`  ${f.supabaseUrl}`);
        lines.push(`  → gs://${GCS_BUCKET}/${f.gcsPath}`);
      }
    }
    writeFileSync(reportPath, lines.join("\n") + "\n");
    log(`\nDRY RUN 리포트: ${reportPath}`);
    process.exit(0);
  }

  // Step 3: 파일 복사 실행
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

  let success = 0;
  let failed = 0;
  const errors = [];

  for (const [bucket, files] of Object.entries(byBucket)) {
    log(`\n── ${bucket} (${files.length}개) 복사 중... ──`);

    for (const file of files) {
      const tempFile = join(TEMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const gcsTarget = `gs://${GCS_BUCKET}/${file.gcsPath}`;

      try {
        // 1) Supabase에서 다운로드 (공개 URL)
        execSync(
          `curl -sS -f -L -o "${tempFile}" "${file.supabaseUrl}"`,
          { timeout: 60_000 },
        );

        // 2) GCS에 업로드
        execSync(
          `gsutil -q cp "${tempFile}" "${gcsTarget}"`,
          { timeout: 60_000 },
        );

        success++;

        // 100개마다 진행률 표시
        if ((success + failed) % 100 === 0) {
          log(`  진행: ${success + failed}/${files.length} (성공: ${success}, 실패: ${failed})`);
        }
      } catch (err) {
        failed++;
        const msg = `${file.supabaseUrl} → ${err.message?.split("\n")[0] || "unknown"}`;
        errors.push(msg);
        logError(msg);
      } finally {
        // 임시 파일 정리
        try {
          if (existsSync(tempFile)) unlinkSync(tempFile);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  // Step 4: 결과 리포트
  log("\n=== 복사 완료 ===");
  log(`성공: ${success}개`);
  log(`실패: ${failed}개`);

  if (errors.length > 0) {
    const errorLog = join(process.cwd(), "scripts/copy-errors.log");
    writeFileSync(errorLog, errors.join("\n") + "\n");
    log(`실패 목록: ${errorLog}`);
  }

  // Step 5: GCS에서 접근 가능 여부 검증 (샘플 5개)
  log("\n=== 검증 (샘플) ===");
  const sampleUrls = [...allUrls].slice(0, 5);
  for (const url of sampleUrls) {
    const gcsPath = extractGcsPath(url);
    if (!gcsPath) continue;
    const gcsUrl = `${GCS_PUBLIC_BASE}/${gcsPath}`;
    try {
      execSync(`curl -sS -f -o /dev/null -w "%{http_code}" "${gcsUrl}"`, {
        timeout: 10_000,
      });
      log(`  OK: ${gcsUrl}`);
    } catch {
      logError(`  FAIL: ${gcsUrl}`);
    }
  }

  log("\n완료. DB URL 변환은 migrate-supabase-urls.sql을 실행하세요.");
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
