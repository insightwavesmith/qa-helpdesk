import pg from 'pg';
const { Client } = pg;

// Direct connection (not pooler)
const client = new Client({
  host: 'db.symvlrsmkjlztoopbnht.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD || 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected');
} catch (err) {
  console.error('Connection failed:', err.message);
  
  // Try session mode pooler
  const client2 = new Client({
    host: 'aws-0-ap-northeast-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.symvlrsmkjlztoopbnht',
    password: process.env.SUPABASE_DB_PASSWORD || 'postgres',
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
} finally {
  await client.end().catch(() => {});
}
