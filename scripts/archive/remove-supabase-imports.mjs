/**
 * Supabase SDK 의존성 일괄 제거 스크립트
 *
 * 1. createServiceClient import: @/lib/supabase/server → @/lib/db
 * 2. createClient import: @/lib/supabase/server → @/lib/db (createServiceClient로 통합)
 * 3. SupabaseClient 타입: @supabase/supabase-js → DbClient from @/lib/db
 * 4. Database 타입 import 유지 (supabase 아닌 @/types/database에서 가져옴)
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// Step 1: createServiceClient import 치환
const serviceClientFiles = execSync(
  'grep -rl \'from "@/lib/supabase/server"\' src/',
  { encoding: "utf-8" }
).trim().split("\n").filter(Boolean);

let changed = 0;
let skipped = 0;

for (const file of serviceClientFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // createServiceClient import → @/lib/db
  content = content.replace(
    /import\s*\{\s*createServiceClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
    'import { createServiceClient } from "@/lib/db";'
  );

  // createClient import → createServiceClient from @/lib/db
  // (createClient was the cookie-based auth client, now just use createServiceClient for DB)
  content = content.replace(
    /import\s*\{\s*createClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
    'import { createServiceClient } from "@/lib/db";'
  );

  // createClient() 호출 → createServiceClient() 호출
  // 단, createClient가 Supabase 용도일 때만 (함수 내부에서)
  if (content.includes('createServiceClient') && content.includes('createClient()')) {
    content = content.replace(/\bcreateClient\(\)/g, 'createServiceClient()');
  }

  if (content !== original) {
    writeFileSync(file, content);
    changed++;
    console.log(`[OK] ${file}`);
  } else {
    skipped++;
    console.log(`[SKIP] ${file} (변경 없음)`);
  }
}

// Step 2: SupabaseClient 타입 → DbClient 타입
const supabaseTypeFiles = execSync(
  'grep -rl \'SupabaseClient\' src/ || true',
  { encoding: "utf-8" }
).trim().split("\n").filter(Boolean);

for (const file of supabaseTypeFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // import type { SupabaseClient } from "@supabase/supabase-js" → import type { DbClient } from "@/lib/db"
  content = content.replace(
    /import\s+type\s*\{\s*SupabaseClient\s*\}\s*from\s*["']@supabase\/supabase-js["'];?/g,
    'import type { DbClient } from "@/lib/db";'
  );

  // SupabaseClient<Database> → DbClient
  content = content.replace(/SupabaseClient<Database>/g, 'DbClient');

  // SupabaseClient (without generic) → DbClient
  content = content.replace(/\bSupabaseClient\b/g, 'DbClient');

  // ReturnType<DbClient["from"]> — 이건 PostgresQueryBuilder로 바꿔야 함
  // 일단 any로 처리 (이후 수동 수정)

  // import type { Database } from "@/types/database" 가 없으면 제거할 필요 없음
  // Database 타입이 더 이상 안 쓰이면 import 제거
  if (!content.includes('Database') || content.includes('DbClient')) {
    content = content.replace(
      /import\s+type\s*\{\s*Database\s*\}\s*from\s*["']@\/types\/database["'];?\n?/g,
      (match) => {
        // Database가 다른 곳에서 쓰이는지 확인
        const dbUsages = (content.match(/\bDatabase\b/g) || []).length;
        // import 문 자체에 1번, 다른 곳에 쓰이면 유지
        if (dbUsages <= 1) return '';
        return match;
      }
    );
  }

  if (content !== original) {
    writeFileSync(file, content);
    changed++;
    console.log(`[TYPE] ${file}`);
  }
}

console.log(`\n완료: ${changed}파일 변경, ${skipped}파일 스킵`);
