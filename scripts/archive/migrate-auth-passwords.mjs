#!/usr/bin/env node
/**
 * Firebase Auth 비밀번호 설정 스크립트
 *
 * 상황:
 *   - Firebase에 35명이 비밀번호 없이 등록됨 → 로그인 불가
 *   - Supabase DB(auth.users)는 IPv6 전용 + IP 차단으로 직접 접근 불가
 *   - encrypted_password는 Supabase REST API에서 보안상 노출 안 됨
 *
 * 전략:
 *   1) 테스트 계정(smith.kim@inwv.co) → updateUser로 직접 비밀번호 설정 (test1234!)
 *   2) 나머지 유저 → 비밀번호 재설정 링크 생성 후 파일 저장
 *
 * 실행:
 *   node scripts/migrate-auth-passwords.mjs [--dry-run]
 */

import admin from 'firebase-admin';
import pg from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');

// Firebase 서비스 계정 키
const serviceAccountPath = join(__dirname, '..', 'gcp-service-key.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

// Cloud SQL 연결 (profiles + uid 조회용)
const cloudSqlPool = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
  connectionTimeoutMillis: 15_000,
});

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}
function logError(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

// Firebase listUsers 전체 조회
async function listAllFirebaseUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  if (DRY_RUN) log('*** DRY RUN 모드 — Firebase 변경 없음 ***');

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const auth = admin.auth();

  // Step 1: Firebase 현재 유저 조회
  log('Step 1: Firebase 현재 유저 조회...');
  const fbUsers = await listAllFirebaseUsers(auth);
  log(`  Firebase 유저: ${fbUsers.length}명`);

  const fbEmailToUser = new Map(fbUsers.map(u => [u.email, u]));
  const fbUidToUser = new Map(fbUsers.map(u => [u.uid, u]));

  // Step 2: Cloud SQL profiles 조회
  log('\nStep 2: Cloud SQL profiles 조회...');
  const { rows: profiles } = await cloudSqlPool.query(
    'SELECT id, email, name FROM public.profiles ORDER BY created_at'
  );
  log(`  profiles: ${profiles.length}명`);

  // Step 3: 비밀번호 없는 유저 식별
  log('\nStep 3: 비밀번호 없는 유저 확인...');
  const noPasswordUsers = fbUsers.filter(u => !u.passwordHash);
  log(`  비밀번호 없는 유저: ${noPasswordUsers.length}명`);

  // 테스트 계정
  const TEST_EMAIL = 'smith.kim@inwv.co';
  const TEST_PASSWORD = 'test1234!';
  const testUser = fbEmailToUser.get(TEST_EMAIL);

  if (!testUser) {
    logError(`테스트 계정 ${TEST_EMAIL}이 Firebase에 없습니다.`);
  } else {
    log(`  테스트 계정 uid: ${testUser.uid}, 비밀번호: ${testUser.passwordHash ? 'O' : 'X'}`);
  }

  if (DRY_RUN) {
    log('\n[DRY RUN] 실행 계획:');
    log(`  1) ${TEST_EMAIL} → updateUser(password: "${TEST_PASSWORD}")`);
    log(`  2) 나머지 ${noPasswordUsers.length - (testUser ? 1 : 0)}명 → 비밀번호 재설정 링크 생성`);
    log('\nDRY RUN 완료.');
    return;
  }

  // Step 4: 테스트 계정 비밀번호 설정
  log(`\nStep 4: ${TEST_EMAIL} 비밀번호 설정...`);
  if (testUser) {
    try {
      await auth.updateUser(testUser.uid, {
        password: TEST_PASSWORD,
        emailVerified: true,
      });
      log(`  ✓ ${TEST_EMAIL} 비밀번호 설정 완료 (uid: ${testUser.uid})`);
    } catch (err) {
      logError(`  ${TEST_EMAIL} 비밀번호 설정 실패: ${err.message}`);
    }
  }

  // Step 5: 비밀번호 없는 나머지 유저들 재설정 링크 생성
  log(`\nStep 5: 비밀번호 재설정 링크 생성...`);
  const resetLinks = [];
  let linkSuccess = 0;
  let linkFail = 0;

  for (const u of noPasswordUsers) {
    if (u.email === TEST_EMAIL) continue; // 테스트 계정은 이미 처리

    try {
      const link = await auth.generatePasswordResetLink(u.email, {
        url: 'https://bscamp.app/login',
      });
      resetLinks.push({ email: u.email, uid: u.uid, link });
      linkSuccess++;
    } catch (err) {
      logError(`  ${u.email} 링크 생성 실패: ${err.message}`);
      linkFail++;
    }
  }

  log(`  링크 생성 성공: ${linkSuccess}명, 실패: ${linkFail}명`);

  // 파일 저장
  const outPath = '/tmp/firebase-reset-links.json';
  writeFileSync(outPath, JSON.stringify(resetLinks, null, 2));
  log(`  링크 파일 저장: ${outPath} (${resetLinks.length}개)`);

  // Step 6: 검증
  log('\nStep 6: 검증...');
  const updatedUser = await auth.getUserByEmail(TEST_EMAIL);
  const hasPassword = updatedUser.passwordHash ? '있음' : '없음';
  log(`  ${TEST_EMAIL}: 비밀번호 ${hasPassword}`);

  const finalUsers = await listAllFirebaseUsers(auth);
  const finalNoPw = finalUsers.filter(u => !u.passwordHash).length;
  log(`  전체 ${finalUsers.length}명 중 비밀번호 없음: ${finalNoPw}명`);

  // Step 7: 요약
  log('\n=== 완료 ===');
  log(`Firebase 유저: ${finalUsers.length}명`);
  log(`${TEST_EMAIL}: 비밀번호 ${hasPassword}`);
  log(`비밀번호 재설정 링크: ${resetLinks.length}개 → ${outPath}`);
  if (finalNoPw > 0) {
    log(`⚠ 비밀번호 없는 ${finalNoPw}명은 비밀번호 재설정 링크로 로그인 후 설정 필요`);
  }

  // Step 8: Supabase DB 접속 불가 이유 기록
  log('\n=== Supabase encrypted_password 이관 불가 사유 ===');
  log('  - Supabase DB는 IPv6 전용 (2406:da1c:f42:ae09:...)');
  log('  - Pooler(aws-0-ap-northeast-2.pooler.supabase.com)는 IP 제한으로 "Tenant or user not found"');
  log('  - Supabase Admin REST API는 보안상 encrypted_password 필드 노출 불가');
  log('  - 결론: 모든 유저가 비밀번호 재설정 링크 통해 직접 비밀번호 설정 필요');
  log('         (또는 Supabase 대시보드에서 .csv export 후 별도 이관)');
}

main()
  .catch(err => {
    console.error('에러:', err);
    process.exit(1);
  })
  .finally(async () => {
    try { await cloudSqlPool.end(); } catch {}
    process.exit(0);
  });
