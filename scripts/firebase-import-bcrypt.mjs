#!/usr/bin/env node
/**
 * Firebase Auth bcrypt 해시 임포트
 * Supabase CSV에서 email + encrypted_password 읽어서 Firebase에 임포트
 *
 * 실행: node scripts/firebase-import-bcrypt.mjs
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// Firebase 초기화
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'gcp-service-key.json'), 'utf-8')
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const auth = admin.auth();

// Cloud SQL 연결 (profiles uid 매핑용)
const pool = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
  connectionTimeoutMillis: 15000,
});

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  // 1. CSV 읽기
  log('Step 1: CSV 파일 읽기...');
  const csvPath = '/Users/smith/Downloads/Supabase Snippet User Authentication Credentials.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n').slice(1); // 헤더 제거
  const csvUsers = lines.map(line => {
    line = line.replace(/\r$/, ''); // CRLF → LF (CSV \r 제거)
    const firstComma = line.indexOf(',');
    return {
      email: line.slice(0, firstComma).trim(),
      hash: line.slice(firstComma + 1).trim(),
    };
  });
  log(`  CSV 유저: ${csvUsers.length}명`);

  // 2. Cloud SQL profiles 조회 (uid 매핑)
  log('Step 2: Cloud SQL profiles 조회...');
  const { rows: profiles } = await pool.query('SELECT id, email FROM public.profiles ORDER BY created_at');
  log(`  profiles: ${profiles.length}명`);
  const emailToUid = new Map(profiles.map(p => [p.email, p.id]));

  // 3. Firebase 기존 유저 전부 삭제
  log('Step 3: Firebase 기존 유저 삭제...');
  const existingUsers = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    existingUsers.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  log(`  기존 Firebase 유저: ${existingUsers.length}명`);

  if (existingUsers.length > 0) {
    const uids = existingUsers.map(u => u.uid);
    // deleteUsers는 최대 1000명
    const result = await auth.deleteUsers(uids);
    log(`  삭제 완료: ${result.successCount}명 성공, ${result.failureCount}명 실패`);
    if (result.failureCount > 0) {
      result.errors.forEach(e => console.error(`    삭제 실패: ${e.error.message}`));
    }
  }

  // 4. importUsers로 재생성 (bcrypt 해시 포함)
  log('Step 4: importUsers (bcrypt 해시 포함)...');
  const usersToImport = csvUsers.map(({ email, hash }) => {
    const uid = emailToUid.get(email);
    const user = {
      email,
      emailVerified: true,
      passwordHash: Buffer.from(hash),
      passwordSalt: Buffer.alloc(0),
    };
    if (uid) user.uid = uid;
    return user;
  });

  // importUsers는 최대 1000명씩
  const importResult = await auth.importUsers(usersToImport, {
    hash: { algorithm: 'BCRYPT' },
  });
  log(`  임포트 완료: ${importResult.successCount}명 성공, ${importResult.failureCount}명 실패`);
  if (importResult.failureCount > 0) {
    importResult.errors.forEach(e => {
      console.error(`    실패 [${e.index}]: ${e.error.message}`);
    });
  }

  // 5. 검증
  log('Step 5: 검증...');
  try {
    const testUser = await auth.getUserByEmail('smith.kim@inwv.co');
    log(`  smith.kim@inwv.co: uid=${testUser.uid}, passwordHash=${testUser.passwordHash ? 'O' : 'X'}`);
  } catch (err) {
    console.error(`  검증 실패: ${err.message}`);
  }

  // 최종 유저 수 확인
  const finalUsers = [];
  let pt2;
  do {
    const r = await auth.listUsers(1000, pt2);
    finalUsers.push(...r.users);
    pt2 = r.pageToken;
  } while (pt2);
  const withHash = finalUsers.filter(u => u.passwordHash).length;
  log(`\n=== 결과 ===`);
  log(`Firebase 전체: ${finalUsers.length}명`);
  log(`비밀번호 있음: ${withHash}명`);
  log(`비밀번호 없음: ${finalUsers.length - withHash}명`);
}

main()
  .catch(err => { console.error('에러:', err); process.exit(1); })
  .finally(async () => { await pool.end(); process.exit(0); });
