/**
 * Supabase → Firebase Auth 사용자 마이그레이션 스크립트
 *
 * 전략:
 *   1. Supabase Admin API로 전체 사용자 목록 조회
 *   2. Firebase Auth에 동일 UID로 사용자 생성 (profiles.id 참조 유지, DB 변경 불필요)
 *   3. bcrypt 해시 추출 불가 → 비밀번호 없이 임포트
 *   4. 임포트 후 각 사용자에게 비밀번호 재설정 링크 생성
 *   5. 결과를 JSON으로 stdout 출력
 *
 * 실행:
 *   npx tsx scripts/migrate-auth-to-firebase.ts --dry-run   # 시뮬레이션 (Firebase 변경 없음)
 *   npx tsx scripts/migrate-auth-to-firebase.ts             # 실제 마이그레이션
 *
 * 환경변수 (.env.local):
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase 서비스 롤 키
 *   GOOGLE_APPLICATION_CREDENTIALS (선택) — 서비스 계정 키 경로 (기본값: ./gcp-service-key.json)
 */

import { join } from "path";
import * as fs from "fs";

// dotenv 로드 (.env.local)
try {
  const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
  const base = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  dotenv.config({ path: join(base, "../.env.local") });
} catch {
  // dotenv 미설치 환경에서는 process.env 직접 사용
}

// ────────────────────────────────────────────────────────────
// 설정
// ────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Firebase 서비스 계정 키 경로 결정
// 우선순위: GOOGLE_APPLICATION_CREDENTIALS → FIREBASE_SERVICE_ACCOUNT_KEY → ./gcp-service-key.json
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
  join(typeof __dirname !== "undefined" ? __dirname : process.cwd(), "../gcp-service-key.json");

// Firebase importUsers 배치 크기 (최대 1000, 안전하게 100으로 제한)
const IMPORT_BATCH_SIZE = 100;

// ────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────

interface SupabaseUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  role: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: Array<{
    id: string;
    provider: string;
    identity_data?: { email?: string; sub?: string };
  }> | null;
}

interface SupabaseAdminUsersResponse {
  users: SupabaseUser[];
  aud: string;
  nextPage?: number;
  lastPage?: number;
  total?: number;
}

interface MigrationResult {
  uid: string;
  email: string;
  status: "imported" | "skipped_existing" | "failed_import" | "failed_reset_link";
  resetLink?: string;
  error?: string;
}

interface MigrationSummary {
  dryRun: boolean;
  totalFetched: number;
  imported: number;
  skippedExisting: number;
  failedImport: number;
  failedResetLink: number;
  results: MigrationResult[];
}

// ────────────────────────────────────────────────────────────
// 유틸리티
// ────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

function logSection(title: string) {
  process.stderr.write(`\n${"─".repeat(60)}\n${title}\n${"─".repeat(60)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────
// Supabase 사용자 조회 (페이지네이션 포함)
// ────────────────────────────────────────────────────────────

async function fetchAllSupabaseUsers(): Promise<SupabaseUser[]> {
  const allUsers: SupabaseUser[] = [];
  let page = 1;
  const perPage = 200; // Supabase Admin API 최대값

  log("Supabase에서 사용자 목록을 가져오는 중...");

  while (true) {
    const url = `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase Admin API 오류 (HTTP ${res.status}): ${body}`);
    }

    const data = (await res.json()) as SupabaseAdminUsersResponse;
    const users = data.users ?? [];

    if (users.length === 0) break;

    allUsers.push(...users);
    log(`  페이지 ${page}: ${users.length}명 (누적 ${allUsers.length}명)`);

    // 마지막 페이지 판단: 응답 사용자 수가 per_page 미만이면 종료
    if (users.length < perPage) break;

    page++;
    // API 부하 방지
    await sleep(200);
  }

  log(`  총 ${allUsers.length}명 조회 완료`);
  return allUsers;
}

// ────────────────────────────────────────────────────────────
// Firebase Admin 초기화 (스탠드얼론 — 프로젝트 getFirebaseAuth() 불사용)
// ────────────────────────────────────────────────────────────

function initFirebaseAdmin() {
  // firebase-admin는 동적으로 로드 (tsx CJS/ESM 호환)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require("firebase-admin") as typeof import("firebase-admin");

  // 이미 초기화된 앱이 있으면 재사용
  if (admin.apps.length > 0) {
    return admin.auth();
  }

  // 서비스 계정 키 파일 존재 확인
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `서비스 계정 키 파일을 찾을 수 없습니다: ${SERVICE_ACCOUNT_PATH}\n` +
        "GOOGLE_APPLICATION_CREDENTIALS 환경변수를 설정하거나 gcp-service-key.json 파일을 프로젝트 루트에 위치시키세요."
    );
  }

  const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8");
  const serviceAccount = JSON.parse(raw) as import("firebase-admin/app").ServiceAccount;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  log(`Firebase Admin SDK 초기화 완료 (프로젝트: ${(serviceAccount as Record<string, unknown>).projectId ?? "unknown"})`);

  return admin.auth();
}

// ────────────────────────────────────────────────────────────
// Firebase importUsers 배치 실행
// ────────────────────────────────────────────────────────────

async function importUsersToFirebase(
  auth: import("firebase-admin/auth").Auth,
  users: SupabaseUser[]
): Promise<{ imported: string[]; skipped: string[]; failed: Array<{ uid: string; email: string; error: string }> }> {
  const imported: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ uid: string; email: string; error: string }> = [];

  // 배치 단위로 처리
  for (let i = 0; i < users.length; i += IMPORT_BATCH_SIZE) {
    const batch = users.slice(i, i + IMPORT_BATCH_SIZE);
    const batchNum = Math.floor(i / IMPORT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / IMPORT_BATCH_SIZE);

    log(`  배치 ${batchNum}/${totalBatches} 처리 중 (${batch.length}명)...`);

    if (DRY_RUN) {
      // dry-run: 실제 임포트 없이 로깅만
      for (const user of batch) {
        log(`    [DRY-RUN] ${user.email} (uid: ${user.id})`);
        imported.push(user.id);
      }
      continue;
    }

    // firebase-admin UserImportRecord 형태로 변환
    const records = batch.map((user) => ({
      uid: user.id,
      email: user.email,
      emailVerified: user.email_confirmed_at != null,
      // 비밀번호 없이 임포트 (bcrypt 해시 추출 불가)
      // 사용자는 비밀번호 재설정 링크로 최초 로그인 필요
      metadata: {
        creationTime: user.created_at,
        lastSignInTime: user.last_sign_in_at ?? undefined,
      },
      disabled: false,
    }));

    try {
      const result = await auth.importUsers(records);

      // 성공/실패 분류
      const failedUids = new Set(result.errors.map((e) => e.index));

      for (let j = 0; j < records.length; j++) {
        const record = records[j];
        const user = batch[j];

        if (failedUids.has(j)) {
          const importError = result.errors.find((e) => e.index === j);
          const errMsg = importError?.error?.message ?? "알 수 없는 오류";

          // 이미 존재하는 사용자는 skipped 처리 (에러 메시지로 감지)
          if (
            errMsg.includes("already exists") ||
            errMsg.includes("DUPLICATE_LOCAL_ID") ||
            errMsg.includes("uid-already-exists")
          ) {
            log(`    [SKIP] 이미 존재: ${record.email} (uid: ${record.uid})`);
            skipped.push(record.uid);
          } else {
            log(`    [FAIL] 임포트 실패: ${record.email} — ${errMsg}`);
            failed.push({ uid: record.uid, email: user.email, error: errMsg });
          }
        } else {
          log(`    [OK] ${record.email} (uid: ${record.uid})`);
          imported.push(record.uid);
        }
      }
    } catch (err) {
      // 배치 전체 실패 (네트워크 오류 등)
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`    [ERROR] 배치 ${batchNum} 전체 실패: ${errMsg}`);
      for (const user of batch) {
        failed.push({ uid: user.id, email: user.email, error: errMsg });
      }
    }

    // 배치 간 잠시 대기 (Firebase API rate limit 예방)
    if (i + IMPORT_BATCH_SIZE < users.length) {
      await sleep(500);
    }
  }

  return { imported, skipped, failed };
}

// ────────────────────────────────────────────────────────────
// 비밀번호 재설정 링크 생성
// ────────────────────────────────────────────────────────────

async function generateResetLinks(
  auth: import("firebase-admin/auth").Auth,
  users: SupabaseUser[]
): Promise<Map<string, string>> {
  const resetLinks = new Map<string, string>(); // email → resetLink

  log(`  ${users.length}명의 비밀번호 재설정 링크 생성 중...`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    if (DRY_RUN) {
      resetLinks.set(user.email, "https://example.com/reset?oobCode=DRY_RUN_PLACEHOLDER");
      continue;
    }

    try {
      const link = await auth.generatePasswordResetLink(user.email);
      resetLinks.set(user.email, link);

      if ((i + 1) % 10 === 0 || i === users.length - 1) {
        log(`    진행: ${i + 1}/${users.length}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // USER_NOT_FOUND: 임포트가 실패한 사용자 (스킵 처리)
      if (errMsg.includes("USER_NOT_FOUND") || errMsg.includes("user-not-found")) {
        log(`    [WARN] 사용자 없음 (재설정 링크 건너뜀): ${user.email}`);
      } else {
        log(`    [WARN] 재설정 링크 생성 실패 (${user.email}): ${errMsg}`);
      }

      // 실패 시 빈 링크로 마킹 (결과 JSON에서 구분 가능)
      resetLinks.set(user.email, "");
    }

    // Firebase rate limit 예방 (generatePasswordResetLink는 개별 호출)
    if (!DRY_RUN && i < users.length - 1) {
      await sleep(100);
    }
  }

  return resetLinks;
}

// ────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────

async function main() {
  // ── 사전 검증 ───────────────────────────────────────────
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log("오류: SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
    log("  .env.local 파일을 확인하세요.");
    process.exit(1);
  }

  logSection(DRY_RUN ? "Supabase → Firebase Auth 마이그레이션 (DRY-RUN)" : "Supabase → Firebase Auth 마이그레이션");

  if (DRY_RUN) {
    log("[DRY-RUN 모드] Firebase에 실제 변경이 이루어지지 않습니다.");
    log("실제 마이그레이션: npx tsx scripts/migrate-auth-to-firebase.ts");
  } else {
    log("[LIVE 모드] Firebase Auth에 사용자를 실제로 생성합니다.");
    log("중단하려면 Ctrl+C를 누르세요.\n");
    // 3초 대기 (실수로 실행한 경우 중단 기회 제공)
    await sleep(3000);
  }

  // ── Step 1: Supabase 사용자 조회 ───────────────────────
  logSection("Step 1: Supabase 사용자 조회");
  const supabaseUsers = await fetchAllSupabaseUsers();

  if (supabaseUsers.length === 0) {
    log("조회된 사용자가 없습니다. 종료합니다.");
    process.exit(0);
  }

  // 이메일 없는 사용자 필터링 (전화번호 전용 계정 등)
  const validUsers = supabaseUsers.filter((u) => u.email && u.email.trim().length > 0);
  const skippedNoEmail = supabaseUsers.length - validUsers.length;

  if (skippedNoEmail > 0) {
    log(`  이메일 없는 사용자 ${skippedNoEmail}명 제외 (전화번호 전용 등)`);
  }
  log(`  마이그레이션 대상: ${validUsers.length}명`);

  // ── Step 2: Firebase Admin 초기화 ──────────────────────
  logSection("Step 2: Firebase Admin SDK 초기화");
  const auth = initFirebaseAdmin();

  // ── Step 3: Firebase importUsers ───────────────────────
  logSection("Step 3: Firebase Auth에 사용자 임포트");
  const importResult = await importUsersToFirebase(auth, validUsers);

  log(`\n  임포트 완료:`);
  log(`    성공:        ${importResult.imported.length}명`);
  log(`    이미 존재:   ${importResult.skipped.length}명`);
  log(`    실패:        ${importResult.failed.length}명`);

  // ── Step 4: 비밀번호 재설정 링크 생성 ──────────────────
  // 실패한 사용자(임포트 완전 실패)는 링크 생성 제외
  const failedUidSet = new Set(importResult.failed.map((f) => f.uid));
  const usersForResetLink = validUsers.filter((u) => !failedUidSet.has(u.id));

  logSection(`Step 4: 비밀번호 재설정 링크 생성 (${usersForResetLink.length}명)`);
  const resetLinks = await generateResetLinks(auth, usersForResetLink);

  // ── Step 5: 결과 집계 ──────────────────────────────────
  logSection("Step 5: 결과 집계");

  const results: MigrationResult[] = [];

  for (const user of validUsers) {
    const isSkippedExisting = importResult.skipped.includes(user.id);
    const isImported = importResult.imported.includes(user.id);
    const failedEntry = importResult.failed.find((f) => f.uid === user.id);
    const resetLink = resetLinks.get(user.email);

    if (isImported || isSkippedExisting) {
      const hasResetLink = resetLink && resetLink.length > 0;
      results.push({
        uid: user.id,
        email: user.email,
        status: hasResetLink
          ? isSkippedExisting
            ? "skipped_existing"
            : "imported"
          : "failed_reset_link",
        resetLink: resetLink || undefined,
      });
    } else if (failedEntry) {
      results.push({
        uid: user.id,
        email: user.email,
        status: "failed_import",
        error: failedEntry.error,
      });
    }
  }

  const summary: MigrationSummary = {
    dryRun: DRY_RUN,
    totalFetched: supabaseUsers.length,
    imported: results.filter((r) => r.status === "imported").length,
    skippedExisting: results.filter((r) => r.status === "skipped_existing").length,
    failedImport: results.filter((r) => r.status === "failed_import").length,
    failedResetLink: results.filter((r) => r.status === "failed_reset_link").length,
    results,
  };

  log(`\n  최종 요약:`);
  log(`    전체 조회:      ${summary.totalFetched}명`);
  log(`    신규 임포트:    ${summary.imported}명`);
  log(`    이미 존재:      ${summary.skippedExisting}명`);
  log(`    임포트 실패:    ${summary.failedImport}명`);
  log(`    재설정 링크 실패: ${summary.failedResetLink}명`);

  if (summary.failedImport > 0) {
    log(`\n  [주의] 임포트 실패 목록:`);
    for (const r of results.filter((r) => r.status === "failed_import")) {
      log(`    - ${r.email}: ${r.error}`);
    }
  }

  if (DRY_RUN) {
    log(`\n  실제 마이그레이션 실행:`);
    log(`    npx tsx scripts/migrate-auth-to-firebase.ts`);
  } else {
    log(`\n  다음 단계:`);
    log(`    1. stdout으로 출력된 JSON을 파일로 저장:`);
    log(`       npx tsx scripts/migrate-auth-to-firebase.ts > scripts/output/firebase-migration.json`);
    log(`    2. resetLink가 있는 사용자에게 이메일 발송 (Mailjet/Nodemailer 등 사용)`);
    log(`    3. 이메일 내 링크 클릭 → 비밀번호 설정 → 로그인 가능`);
  }

  // ── Step 6: JSON 결과 stdout 출력 ─────────────────────
  // log()는 stderr 출력이므로, stdout에는 JSON 결과만 깨끗하게 출력됨
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  log(`\n마이그레이션 실패: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    log(err.stack);
  }
  process.exit(1);
});
