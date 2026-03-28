/**
 * Supabase auth.users + Cloud SQL profiles → Firebase Auth 이관 스크립트
 *
 * 1) Cloud SQL profiles 기반으로 Firebase 계정 생성
 * 2) Supabase auth.users에만 있는 사용자도 추가 이관
 * 3) Supabase에만 있는 사용자는 Cloud SQL profiles에도 INSERT
 * 4) 비밀번호 해시 없이 계정 생성 → 사용자에게 비밀번호 재설정 안내 필요
 */
const admin = require('firebase-admin');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../gcp-service-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const pool = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
});

async function createFirebaseUser(email, uid, displayName, existingUsers) {
  if (existingUsers.has(email)) {
    console.log(`  스킵: ${email} (이미 존재)`);
    return { status: 'skip' };
  }

  try {
    const userRecord = await admin.auth().createUser({
      uid,
      email,
      displayName: displayName || email.split('@')[0],
      emailVerified: true,
    });
    console.log(`  생성: ${userRecord.email} (uid: ${userRecord.uid})`);
    return { status: 'success', uid };
  } catch (err) {
    if (err.code === 'auth/uid-already-exists') {
      try {
        const existing = await admin.auth().getUser(uid);
        console.log(`  스킵: ${email} (UID 이미 존재: ${existing.email})`);
        return { status: 'skip' };
      } catch {
        console.log(`  실패: ${email} - UID 충돌 확인 불가`);
        return { status: 'fail', error: err.message };
      }
    } else if (err.code === 'auth/email-already-exists') {
      console.log(`  스킵: ${email} (이메일 이미 존재)`);
      return { status: 'skip' };
    } else {
      console.log(`  실패: ${email} - ${err.message}`);
      return { status: 'fail', error: err.message };
    }
  }
}

async function migrate() {
  console.log('=== Supabase + Cloud SQL → Firebase Auth 이관 시작 ===\n');

  // 1. Cloud SQL에서 profiles 읽기
  const { rows } = await pool.query(
    'SELECT id, email, name, role, created_at FROM public.profiles ORDER BY created_at'
  );
  console.log(`Cloud SQL profiles: ${rows.length}명 로드`);
  const profileEmails = new Set(rows.map(r => r.email));

  // 2. Supabase auth.users 로드 (REST API export)
  let supabaseOnlyUsers = [];
  const supabaseFile = '/tmp/supabase-users.json';
  if (fs.existsSync(supabaseFile)) {
    const data = JSON.parse(fs.readFileSync(supabaseFile, 'utf-8'));
    const supabaseUsers = data.users || [];
    console.log(`Supabase auth.users: ${supabaseUsers.length}명 로드`);

    // profiles에 없는 사용자 찾기
    supabaseOnlyUsers = supabaseUsers.filter(u => u.email && !profileEmails.has(u.email));
    if (supabaseOnlyUsers.length > 0) {
      console.log(`\n⚠ Supabase에만 있는 사용자 ${supabaseOnlyUsers.length}명:`);
      supabaseOnlyUsers.forEach(u => {
        const meta = u.user_metadata || {};
        console.log(`  - ${u.email} | ${meta.name || 'N/A'} | ${meta.cohort || 'N/A'}`);
      });
    }
  } else {
    console.log('⚠ /tmp/supabase-users.json 없음 — Supabase 추가 사용자 병합 건너뜀');
  }

  // 3. 기존 Firebase 사용자 확인 (중복 방지)
  const existingUsers = new Set();
  try {
    const listResult = await admin.auth().listUsers(1000);
    listResult.users.forEach(u => existingUsers.add(u.email));
    console.log(`\nFirebase 기존 사용자: ${existingUsers.size}명\n`);
  } catch (err) {
    console.log('Firebase 사용자 목록 조회 실패:', err.message);
  }

  // 4. Cloud SQL profiles → Firebase 이관
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const errors = [];
  const created = [];

  console.log('--- Cloud SQL profiles 이관 ---');
  for (const row of rows) {
    const result = await createFirebaseUser(row.email, row.id, row.name, existingUsers);
    if (result.status === 'success') {
      successCount++;
      created.push({ email: row.email, uid: row.id, role: row.role });
      existingUsers.add(row.email);
    } else if (result.status === 'skip') {
      skipCount++;
    } else {
      failCount++;
      errors.push({ email: row.email, error: result.error });
    }
  }

  // 5. Supabase에만 있는 사용자 → Firebase + Cloud SQL profiles 동시 이관
  if (supabaseOnlyUsers.length > 0) {
    console.log('\n--- Supabase 전용 사용자 이관 ---');
    for (const u of supabaseOnlyUsers) {
      const meta = u.user_metadata || {};
      const displayName = meta.name || u.email.split('@')[0];
      const result = await createFirebaseUser(u.email, u.id, displayName, existingUsers);

      if (result.status === 'success') {
        successCount++;
        created.push({ email: u.email, uid: u.id, role: 'student' });
        existingUsers.add(u.email);

        // Cloud SQL profiles에도 INSERT
        try {
          await pool.query(
            `INSERT INTO public.profiles (id, email, name, role, created_at)
             VALUES ($1, $2, $3, 'student', NOW())
             ON CONFLICT (id) DO NOTHING`,
            [u.id, u.email, displayName]
          );
          console.log(`    → profiles INSERT 완료: ${u.email}`);
        } catch (dbErr) {
          console.log(`    → profiles INSERT 실패: ${u.email} - ${dbErr.message}`);
        }
      } else if (result.status === 'skip') {
        skipCount++;
      } else {
        failCount++;
        errors.push({ email: u.email, error: result.error });
      }
    }
  }

  // 6. 결과 요약
  console.log('\n=== 이관 결과 ===');
  console.log(`총 대상: ${rows.length + supabaseOnlyUsers.length}명`);
  console.log(`성공 (신규 생성): ${successCount}명`);
  console.log(`스킵 (이미 존재): ${skipCount}명`);
  console.log(`실패: ${failCount}명`);

  if (errors.length > 0) {
    console.log('\n실패 목록:');
    errors.forEach(e => console.log(`  - ${e.email}: ${e.error}`));
  }

  // 7. Firebase 최종 사용자 수 검증
  const finalList = await admin.auth().listUsers(1000);
  console.log(`\nFirebase 최종 사용자 수: ${finalList.users.length}명`);

  // 8. 비밀번호 재설정 링크 생성 (신규 생성된 사용자만)
  if (created.length > 0) {
    console.log('\n=== 비밀번호 재설정 링크 ===');
    console.log('(사용자에게 안내 필요)\n');
    const resetLinks = [];
    for (const user of created) {
      try {
        const link = await admin.auth().generatePasswordResetLink(user.email, {
          url: 'https://bscamp.app/login',
        });
        console.log(`${user.email}: ${link}`);
        resetLinks.push({ email: user.email, link });
      } catch (err) {
        console.log(`${user.email}: 링크 생성 실패 - ${err.message}`);
      }
    }
    // 링크를 파일로 저장
    if (resetLinks.length > 0) {
      fs.writeFileSync('/tmp/firebase-reset-links.json', JSON.stringify(resetLinks, null, 2));
      console.log(`\n비밀번호 재설정 링크 ${resetLinks.length}개 → /tmp/firebase-reset-links.json 저장`);
    }
  }

  await pool.end();
  console.log('\n=== 이관 완료 ===');
}

migrate().catch(err => {
  console.error('이관 스크립트 에러:', err);
  pool.end();
  process.exit(1);
});
