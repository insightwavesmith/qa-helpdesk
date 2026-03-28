const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp',
});

async function check() {
  try {
    // 1. 모든 스키마 확인
    const schemas = await pool.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') ORDER BY schema_name"
    );
    console.log('사용 가능 스키마:', schemas.rows.map(r => r.schema_name).join(', '));

    // 2. public 스키마 테이블 목록
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('\npublic 테이블:', tables.rows.map(r => r.table_name).join(', '));

    // 3. profiles 테이블 확인
    const profileCount = await pool.query('SELECT count(*) FROM public.profiles');
    console.log('\nprofiles 수:', profileCount.rows[0].count);

    // 4. profiles 데이터 샘플
    const profiles = await pool.query(
      'SELECT id, email, role, name, created_at FROM public.profiles ORDER BY created_at LIMIT 10'
    );
    console.log('\nprofiles 샘플:');
    profiles.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.email} | role: ${row.role} | name: ${row.name} | id: ${row.id}`);
    });

    // 5. profiles 전체 이메일 목록
    const allProfiles = await pool.query(
      'SELECT id, email, role, name FROM public.profiles ORDER BY created_at'
    );
    console.log(`\n전체 profiles (${allProfiles.rows.length}명):`);
    allProfiles.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.email} | ${row.role} | ${row.name || '(이름없음)'}`);
    });
  } catch (err) {
    console.error('에러:', err.message);
  } finally {
    await pool.end();
  }
}

check();
