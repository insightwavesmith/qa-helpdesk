import "dotenv/config";
import pg from 'pg';
const { Client } = pg;

const DB_HOST = process.env.SUPABASE_DB_HOST;
const DB_POOLER_HOST = process.env.SUPABASE_DB_POOLER_HOST;
const DB_USER = process.env.SUPABASE_DB_USER || 'postgres';
const DB_POOLER_USER = process.env.SUPABASE_DB_POOLER_USER || DB_USER;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

if (!DB_HOST) throw new Error("SUPABASE_DB_HOST 환경변수가 필요합니다.");
if (!DB_PASSWORD) throw new Error("SUPABASE_DB_PASSWORD 환경변수가 필요합니다.");

// Direct connection (not pooler)
const client = new Client({
  host: DB_HOST,
  port: 5432,
  database: 'postgres',
  user: DB_USER,
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected');
} catch (err) {
  console.error('Connection failed:', err.message);

  if (!DB_POOLER_HOST) {
    console.error('SUPABASE_DB_POOLER_HOST 미설정 → pooler 시도 불가');
  } else {
    // Try session mode pooler
    const client2 = new Client({
      host: DB_POOLER_HOST,
      port: 5432,
      database: 'postgres',
      user: DB_POOLER_USER,
      password: DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client2.connect();
      console.log('Connected via session pooler');
    } catch (err2) {
      console.error('Session pooler also failed:', err2.message);
    } finally {
      await client2.end();
    }
  }
} finally {
  await client.end().catch(() => {});
}
