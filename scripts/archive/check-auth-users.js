const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
});

async function check() {
  try {
    // 1. auth 스키마 존재 확인
    const schemaResult = await pool.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth'"
    );
    console.log('auth 스키마 존재:', schemaResult.rows.length > 0);

    if (schemaResult.rows.length === 0) {
      console.log('auth 스키마가 없습니다. Supabase 프로젝트에서 직접 export 필요.');
      await pool.end();
      return;
    }

    // 2. auth.users 수 확인
    const countResult = await pool.query('SELECT count(*) FROM auth.users');
    console.log('auth.users 총 수:', countResult.rows[0].count);

    // 3. 사용자 목록 출력
    const usersResult = await pool.query(
      'SELECT id, email, encrypted_password IS NOT NULL as has_password, raw_user_meta_data, created_at FROM auth.users ORDER BY created_at'
    );
    console.log('\n사용자 목록:');
    usersResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.email} | 비밀번호: ${row.has_password ? 'O' : 'X'} | 생성: ${row.created_at}`);
    });
  } catch (err) {
    console.error('에러:', err.message);
  } finally {
    await pool.end();
  }
}

check();
