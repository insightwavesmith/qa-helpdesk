/**
 * Supabase SDK 의존성 일괄 제거 스크립트 v2
 *
 * 처리 대상:
 * 1. createServiceClient import: @/lib/supabase/server → @/lib/db
 * 2. createClient (server) → getCurrentUser() + createServiceClient()
 * 3. SupabaseClient 타입 → DbClient from @/lib/db
 * 4. supabase.auth.getUser() → getCurrentUser() 패턴 전환
 * 5. user.id → user.uid (Firebase AuthUser 인터페이스)
 *
 * 제외:
 * - src/lib/supabase/ 내부 파일 (삭제 대상이므로)
 * - 브라우저 클라이언트 파일 (수동 전환 필요)
 * - .storage 사용 파일 (GCS 전환은 별도)
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Step 1: 서버사이드 supabase/server import 대상 파일 수집 ──
let serverFiles;
try {
  serverFiles = execSync(
    'grep -rl \'from "@/lib/supabase/server"\' src/ --include="*.ts" --include="*.tsx"',
    { encoding: "utf-8" }
  ).trim().split("\n").filter(Boolean);
} catch {
  serverFiles = [];
}

// supabase 내부 파일 제외
serverFiles = serverFiles.filter(f => !f.includes("src/lib/supabase/"));

let changed = 0;
let skipped = 0;

console.log(`\n=== Step 1: Server import 치환 (${serverFiles.length}파일) ===\n`);

for (const file of serverFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  const hasCreateClient = /import\s*\{[^}]*createClient[^}]*\}\s*from\s*["']@\/lib\/supabase\/server["']/.test(content);
  const hasCreateServiceClient = /import\s*\{[^}]*createServiceClient[^}]*\}\s*from\s*["']@\/lib\/supabase\/server["']/.test(content);
  const hasAuthGetUser = content.includes(".auth.getUser()");

  // ── Pattern A: createServiceClient만 import ──
  if (hasCreateServiceClient && !hasCreateClient) {
    content = content.replace(
      /import\s*\{\s*createServiceClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
      'import { createServiceClient } from "@/lib/db";'
    );
  }

  // ── Pattern B: createClient + createServiceClient 둘 다 import ──
  if (hasCreateClient && hasCreateServiceClient) {
    // import 문을 두 줄로 분리
    content = content.replace(
      /import\s*\{\s*createClient\s*,\s*createServiceClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
      'import { createServiceClient } from "@/lib/db";\nimport { getCurrentUser } from "@/lib/firebase/auth";'
    );
    // 역순도 처리
    content = content.replace(
      /import\s*\{\s*createServiceClient\s*,\s*createClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
      'import { createServiceClient } from "@/lib/db";\nimport { getCurrentUser } from "@/lib/firebase/auth";'
    );
  }

  // ── Pattern C: createClient만 import (auth용) ──
  if (hasCreateClient && !hasCreateServiceClient) {
    content = content.replace(
      /import\s*\{\s*createClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
      'import { getCurrentUser } from "@/lib/firebase/auth";\nimport { createServiceClient } from "@/lib/db";'
    );
  }

  // ── auth.getUser() 패턴 변환 ──
  if (hasAuthGetUser) {
    // Pattern: const supabase = await createClient();
    //          const { data: { user } } = await supabase.auth.getUser();
    // → const user = await getCurrentUser();

    // Multi-line destructure pattern:
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser();
    content = content.replace(
      /const\s+supabase\s*=\s*await\s+createClient\(\);\s*\n\s*const\s*\{\s*\n?\s*data:\s*\{\s*user\s*\}\s*,?\s*\n?\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\);?/g,
      "const user = await getCurrentUser();"
    );

    // Single-line destructure pattern:
    // const { data: { user } } = await supabase.auth.getUser();
    content = content.replace(
      /const\s+supabase\s*=\s*await\s+createClient\(\);\s*\n\s*const\s*\{\s*data:\s*\{\s*user\s*\}\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\);?/g,
      "const user = await getCurrentUser();"
    );

    // If supabase was used for both auth and DB queries:
    // Replace remaining supabase.from(...) with svc.from(...)
    // But only if 'supabase' is no longer defined (was replaced above)
    if (content.includes("const user = await getCurrentUser()")) {
      // Check if supabase variable is still used for DB queries
      const hasSupabaseDbUsage = /\bsupabase\s*\.\s*from\b/.test(content) || /\bsupabase\s*\.\s*rpc\b/.test(content);

      if (hasSupabaseDbUsage) {
        // Add svc = createServiceClient() if not already present
        if (!content.includes("createServiceClient()")) {
          content = content.replace(
            "const user = await getCurrentUser();",
            "const user = await getCurrentUser();\n  const svc = createServiceClient();"
          );
        }
        // Replace supabase.from → svc.from (only when supabase was createClient)
        content = content.replace(/\bsupabase\s*\.\s*from\b/g, "svc.from");
        content = content.replace(/\bsupabase\s*\.\s*rpc\b/g, "svc.rpc");
      }
    }
  }

  // ── user.id → user.uid (Firebase AuthUser) ──
  // Only in auth context, and only for clear patterns
  if (content.includes("getCurrentUser") && content.includes("user.id")) {
    // Safe patterns: .eq("...", user.id) — clearly auth user ID
    content = content.replace(/\buser\.id\b(?=\s*[,)\]}])/g, "user!.uid");
  }

  // ── Remove unused Database type import ──
  if (content.includes('from "@/lib/db"') && !content.includes("Database")) {
    content = content.replace(
      /import\s+type\s*\{\s*Database\s*\}\s*from\s*["']@\/types\/database["'];?\n?/g,
      ""
    );
  }

  if (content !== original) {
    if (!DRY_RUN) {
      writeFileSync(file, content);
    }
    changed++;
    console.log(`[OK] ${file}`);
  } else {
    skipped++;
    console.log(`[SKIP] ${file}`);
  }
}

// ── Step 2: SupabaseClient 타입 → DbClient ──
console.log(`\n=== Step 2: SupabaseClient → DbClient ===\n`);

let typeFiles;
try {
  typeFiles = execSync(
    'grep -rl "SupabaseClient" src/ --include="*.ts" --include="*.tsx"',
    { encoding: "utf-8" }
  ).trim().split("\n").filter(Boolean);
} catch {
  typeFiles = [];
}

typeFiles = typeFiles.filter(f => !f.includes("src/lib/supabase/"));

for (const file of typeFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // import type { SupabaseClient } from "@supabase/supabase-js" → import type { DbClient } from "@/lib/db"
  content = content.replace(
    /import\s+type\s*\{\s*SupabaseClient\s*\}\s*from\s*["']@supabase\/supabase-js["'];?/g,
    'import type { DbClient } from "@/lib/db";'
  );

  // SupabaseClient<Database> → DbClient
  content = content.replace(/SupabaseClient<Database>/g, "DbClient");

  // SupabaseClient (standalone) → DbClient
  content = content.replace(/\bSupabaseClient\b/g, "DbClient");

  // Remove unused Database import if SupabaseClient was the only user
  const dbTypeUsages = (content.match(/\bDatabase\b/g) || []).length;
  if (dbTypeUsages === 1 && content.includes('from "@/types/database"')) {
    content = content.replace(
      /import\s+type\s*\{\s*Database\s*\}\s*from\s*["']@\/types\/database["'];?\n?/g,
      ""
    );
  }

  if (content !== original) {
    if (!DRY_RUN) {
      writeFileSync(file, content);
    }
    changed++;
    console.log(`[TYPE] ${file}`);
  }
}

// ── Step 3: @supabase/supabase-js 직접 import (ext API 등) ──
console.log(`\n=== Step 3: @supabase/supabase-js 직접 import ===\n`);

let directFiles;
try {
  directFiles = execSync(
    'grep -rl "from \\"@supabase/" src/ --include="*.ts" --include="*.tsx"',
    { encoding: "utf-8" }
  ).trim().split("\n").filter(Boolean);
} catch {
  directFiles = [];
}

directFiles = directFiles.filter(f => !f.includes("src/lib/supabase/"));

for (const file of directFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // import { createClient } from "@supabase/supabase-js" → import { createServiceClient } from "@/lib/db"
  content = content.replace(
    /import\s*\{\s*createClient\s*\}\s*from\s*["']@supabase\/supabase-js["'];?/g,
    'import { createServiceClient } from "@/lib/db";'
  );

  // import type { EmailOtpType } from "@supabase/supabase-js" → remove (callback route)
  content = content.replace(
    /import\s+type\s*\{\s*EmailOtpType\s*\}\s*from\s*["']@supabase\/supabase-js["'];?\n?/g,
    ""
  );

  if (content !== original) {
    if (!DRY_RUN) {
      writeFileSync(file, content);
    }
    changed++;
    console.log(`[SDK] ${file}`);
  }
}

// ── Step 4: Browser client import 알림 ──
console.log(`\n=== Step 4: Browser client (수동 전환 필요) ===\n`);

let browserFiles;
try {
  browserFiles = execSync(
    'grep -rl \'from "@/lib/supabase/client"\' src/ --include="*.ts" --include="*.tsx"',
    { encoding: "utf-8" }
  ).trim().split("\n").filter(Boolean);
} catch {
  browserFiles = [];
}

for (const file of browserFiles) {
  console.log(`[MANUAL] ${file} — 브라우저 auth, Firebase client SDK로 수동 전환 필요`);
}

console.log(`\n═══════════════════════════════════════`);
console.log(`완료: ${changed}파일 변경, ${skipped}파일 스킵`);
console.log(`수동 전환 필요: ${browserFiles.length}파일 (브라우저 auth)`);
console.log(`═══════════════════════════════════════\n`);
