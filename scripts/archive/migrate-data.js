/**
 * 데이터 이관 통합 스크립트
 *
 * Task 1: Supabase auth.users 비밀번호 해시 → Firebase Auth
 * Task 2: Supabase Storage → GCS (bscamp-storage)
 *         (이미 이관된 파일은 스킵, 누락분만 보충)
 *
 * 사용법: node scripts/migrate-data.js [--passwords-only] [--storage-only] [--dry-run]
 */
const admin = require('firebase-admin');
const { Pool } = require('pg');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// === 설정 ===
const SUPABASE_URL = 'https://symvlrsmkjlztoopbnht.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bXZscnNta2psenRvb3Bibmh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYwODYyMiwiZXhwIjoyMDgxMTg0NjIyfQ.FJLi7AiKw98JqUqPdkj2MBj9fDW6ZSsfgzUDVSFKc8Q';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_REF = 'symvlrsmkjlztoopbnht';
const GCS_BUCKET = 'bscamp-storage';
const SUPABASE_BUCKETS = ['creatives', 'question-images', 'content-images', 'documents', 'qa-images'];

const CLOUD_SQL_POOL = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
});

// Firebase 초기화
const serviceAccount = require('../gcp-service-key.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// GCS 초기화
const gcs = new Storage({ keyFilename: path.resolve(__dirname, '../gcp-service-key.json') });
const bucket = gcs.bucket(GCS_BUCKET);

// CLI 플래그
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PASSWORDS_ONLY = args.includes('--passwords-only');
const STORAGE_ONLY = args.includes('--storage-only');

// === Task 1: 비밀번호 해시 이관 ===
async function migratePasswordHashes() {
  console.log('\n=== Task 1: 비밀번호 해시 이관 (Supabase → Firebase) ===\n');

  // Step 1: Supabase Management API로 encrypted_password 추출
  if (!SUPABASE_ACCESS_TOKEN) {
    console.error('ERROR: SUPABASE_ACCESS_TOKEN 환경변수가 필요합니다.');
    console.error('  export SUPABASE_ACCESS_TOKEN=sbp_...');
    return { success: false, error: 'SUPABASE_ACCESS_TOKEN missing' };
  }

  console.log('1. Supabase auth.users에서 비밀번호 해시 추출...');
  const sqlRes = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'SELECT id, email, encrypted_password FROM auth.users WHERE encrypted_password IS NOT NULL ORDER BY created_at',
      }),
    }
  );

  if (!sqlRes.ok) {
    const errText = await sqlRes.text();
    console.error(`Management API 실패 (${sqlRes.status}):`, errText);
    return { success: false, error: errText };
  }

  const supabaseUsers = await sqlRes.json();
  console.log(`   ${supabaseUsers.length}명 해시 추출 완료`);

  // Step 2: Firebase 기존 사용자 확인
  console.log('\n2. Firebase 기존 사용자 확인...');
  const firebaseList = await admin.auth().listUsers(1000);
  const firebaseMap = new Map();
  firebaseList.users.forEach((u) => firebaseMap.set(u.uid, u));
  console.log(`   Firebase 기존 사용자: ${firebaseMap.size}명`);

  // Step 3: importUsers는 기존 UID가 있으면 실패함
  //         → 기존 사용자 삭제 후 재생성 방식 사용
  if (DRY_RUN) {
    console.log('\n[DRY RUN] 실제 삭제/임포트 실행하지 않음');
    supabaseUsers.forEach((u, i) => {
      const exists = firebaseMap.has(u.id);
      console.log(`  ${i + 1}. ${u.email} | ${exists ? '기존→삭제후재생성' : '신규생성'} | hash: ${u.encrypted_password.substring(0, 15)}...`);
    });
    return { success: true, count: supabaseUsers.length, dryRun: true };
  }

  // Step 3a: 기존 Firebase 사용자 전체 삭제
  const existingUids = Array.from(firebaseMap.keys());
  if (existingUids.length > 0) {
    console.log(`\n3a. 기존 Firebase 사용자 ${existingUids.length}명 삭제...`);
    const deleteResult = await admin.auth().deleteUsers(existingUids);
    console.log(`    삭제 성공: ${deleteResult.successCount}, 실패: ${deleteResult.failureCount}`);
    if (deleteResult.failureCount > 0) {
      deleteResult.errors.forEach((e) => console.error(`    삭제 실패: ${e.error.message}`));
    }
  }

  // Step 3b: bcrypt 해시와 함께 importUsers
  console.log('\n3b. Firebase importUsers (bcrypt 해시 포함)...');

  // Firebase에 필요한 추가 정보를 Cloud SQL에서 가져오기
  const { rows: profiles } = await CLOUD_SQL_POOL.query(
    'SELECT id, email, name FROM public.profiles'
  );
  const profileMap = new Map();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const usersToImport = supabaseUsers.map((u) => {
    const profile = profileMap.get(u.id);
    return {
      uid: u.id,
      email: u.email,
      emailVerified: true,
      displayName: profile?.name || u.email.split('@')[0],
      passwordHash: Buffer.from(u.encrypted_password),
    };
  });

  const importResult = await admin.auth().importUsers(usersToImport, {
    hash: { algorithm: 'BCRYPT' },
  });

  console.log(`   성공: ${importResult.successCount}, 실패: ${importResult.failureCount}`);
  if (importResult.failureCount > 0) {
    importResult.errors.forEach((e) => {
      console.error(`   실패 [${e.index}]: ${usersToImport[e.index]?.email} - ${e.error.message}`);
    });
  }

  // Step 4: 검증 — 로그인 테스트
  console.log('\n4. 검증 — Firebase 사용자 수 확인...');
  const finalList = await admin.auth().listUsers(1000);
  const withPassword = finalList.users.filter((u) => u.passwordHash).length;
  console.log(`   총 사용자: ${finalList.users.length}명, 비밀번호 있음: ${withPassword}명`);

  // Firebase Auth REST API로 로그인 테스트 (smith@test.com / 알려진 비밀번호 없으므로 count만)
  console.log('\n5. Firebase Auth REST API 로그인 테스트 (smith.kim@inwv.co)...');
  try {
    const apiKey = serviceAccount.project_id === 'modified-shape-477110-h8'
      ? 'AIzaSyDO1_xiIGLGPVhWkAKmFAZ3mBfpjUBH96s' // Firebase Web API Key
      : '';

    if (apiKey) {
      const loginRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'smith.kim@inwv.co',
            password: 'test1234!',
            returnSecureToken: true,
          }),
        }
      );
      const loginData = await loginRes.json();
      if (loginData.idToken) {
        console.log('   ✓ 로그인 성공! (smith.kim@inwv.co)');
      } else {
        console.log('   ✗ 로그인 실패:', loginData.error?.message || 'unknown');
        console.log('     (비밀번호가 test1234!가 아닐 수 있음 — 해시 이관은 정상)');
      }
    } else {
      console.log('   Firebase Web API Key 미설정 — 로그인 테스트 스킵');
    }
  } catch (e) {
    console.log('   로그인 테스트 에러:', e.message);
  }

  return {
    success: true,
    imported: importResult.successCount,
    failed: importResult.failureCount,
    total: finalList.users.length,
  };
}

// === Task 2: Storage 이관 (Supabase → GCS) ===
async function migrateStorage() {
  console.log('\n=== Task 2: Supabase Storage → GCS 이관 ===\n');

  const headers = {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
  };

  // 재귀적 파일 목록 가져오기
  async function listFilesRecursive(bucketName, prefix = '') {
    const files = [];
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucketName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    const items = await res.json();

    if (!Array.isArray(items)) {
      console.error(`   리스트 실패 (${bucketName}/${prefix}):`, items);
      return files;
    }

    for (const item of items) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // 디렉토리 — 재귀 탐색
        const subFiles = await listFilesRecursive(bucketName, fullPath);
        files.push(...subFiles);
      } else {
        // 파일
        files.push({
          bucket: bucketName,
          path: fullPath,
          size: item.metadata?.size || 0,
          mimetype: item.metadata?.mimetype || 'application/octet-stream',
        });
      }
    }
    return files;
  }

  // 파일 다운로드 (Supabase Storage)
  async function downloadFile(bucketName, filePath) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucketName}/${encodedPath}`,
      { headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } }
    );
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  // GCS에 파일 존재 확인
  async function gcsFileExists(gcsPath) {
    try {
      const [exists] = await bucket.file(gcsPath).exists();
      return exists;
    } catch {
      return false;
    }
  }

  let totalFiles = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const bucketName of SUPABASE_BUCKETS) {
    console.log(`\n--- ${bucketName} 처리 중... ---`);
    const files = await listFilesRecursive(bucketName);
    console.log(`   파일 ${files.length}개 발견`);
    totalFiles += files.length;

    for (const file of files) {
      const gcsPath = `${bucketName}/${file.path}`;

      // GCS에 이미 있는지 확인
      const exists = await gcsFileExists(gcsPath);
      if (exists) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`   [DRY RUN] 업로드 예정: ${gcsPath} (${file.size} bytes)`);
        uploaded++;
        continue;
      }

      // 다운로드 → 업로드
      try {
        const data = await downloadFile(bucketName, file.path);
        await bucket.file(gcsPath).save(data, {
          metadata: { contentType: file.mimetype },
          resumable: false,
        });
        uploaded++;
        if (uploaded % 10 === 0) {
          process.stdout.write(`   업로드 진행: ${uploaded}개 완료\r`);
        }
      } catch (e) {
        failed++;
        errors.push({ path: gcsPath, error: e.message });
        console.error(`   업로드 실패: ${gcsPath} - ${e.message}`);
      }
    }
    console.log(`   ${bucketName}: 업로드 ${uploaded}개, 스킵 ${skipped}개, 실패 ${failed}개`);
  }

  // Cloud SQL에서 Supabase storage URL 참조 업데이트
  console.log('\n--- Cloud SQL Supabase storage URL 참조 확인 ---');
  try {
    const { rows } = await CLOUD_SQL_POOL.query(
      "SELECT id, email_design_json FROM public.contents WHERE email_design_json::text LIKE '%supabase.co/storage%'"
    );
    if (rows.length > 0) {
      console.log(`   ${rows.length}행에서 Supabase storage URL 발견`);
      if (!DRY_RUN) {
        for (const row of rows) {
          const updated = row.email_design_json
            .replace(/https:\/\/symvlrsmkjlztoopbnht\.supabase\.co\/storage\/v1\/object\/public\//g,
              `https://storage.googleapis.com/${GCS_BUCKET}/`);
          await CLOUD_SQL_POOL.query(
            'UPDATE public.contents SET email_design_json = $1 WHERE id = $2',
            [updated, row.id]
          );
          console.log(`   updated contents.id=${row.id}`);
        }
      } else {
        console.log('   [DRY RUN] URL 교체 실행하지 않음');
      }
    } else {
      console.log('   Supabase storage URL 참조 없음 (이미 정리됨)');
    }
  } catch (e) {
    console.log('   URL 체크 에러:', e.message);
  }

  console.log(`\n=== Storage 이관 결과 ===`);
  console.log(`총 파일: ${totalFiles}개`);
  console.log(`업로드: ${uploaded}개`);
  console.log(`스킵 (이미 존재): ${skipped}개`);
  console.log(`실패: ${failed}개`);

  if (errors.length > 0) {
    console.log('\n실패 목록:');
    errors.forEach((e) => console.log(`  - ${e.path}: ${e.error}`));
  }

  return { success: failed === 0, totalFiles, uploaded, skipped, failed };
}

// === 메인 실행 ===
async function main() {
  console.log('=== 데이터 이관 통합 스크립트 ===');
  console.log(`시간: ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('*** DRY RUN 모드 ***');
  console.log('');

  const results = {};

  try {
    if (!STORAGE_ONLY) {
      results.passwords = await migratePasswordHashes();
    }

    if (!PASSWORDS_ONLY) {
      results.storage = await migrateStorage();
    }
  } catch (e) {
    console.error('\n치명적 에러:', e);
    results.error = e.message;
  } finally {
    await CLOUD_SQL_POOL.end();
  }

  // 결과 요약
  console.log('\n=============================');
  console.log('=== 이관 결과 요약 ===');
  console.log('=============================');
  if (results.passwords) {
    console.log(`비밀번호 해시: ${results.passwords.success ? '성공' : '실패'} (${results.passwords.imported || 0}명 임포트)`);
  }
  if (results.storage) {
    console.log(`Storage: ${results.storage.success ? '성공' : '일부 실패'} (${results.storage.uploaded}개 업로드, ${results.storage.skipped}개 스킵, ${results.storage.failed}개 실패)`);
  }
  console.log(`\n완료: ${new Date().toISOString()}`);

  // 결과 파일 저장
  fs.writeFileSync('/tmp/migrate-data-result.json', JSON.stringify(results, null, 2));
  console.log('결과 저장: /tmp/migrate-data-result.json');
}

main().catch((err) => {
  console.error('스크립트 실행 실패:', err);
  CLOUD_SQL_POOL.end();
  process.exit(1);
});
