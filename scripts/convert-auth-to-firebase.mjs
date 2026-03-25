#!/usr/bin/env node
/**
 * Bulk convert Supabase Auth → Firebase Auth across all source files.
 *
 * Patterns:
 * 1. Server files (actions, API routes, server components):
 *    - Remove `createClient` import (keep `createServiceClient`)
 *    - Add `getCurrentUser` import from `@/lib/firebase/auth`
 *    - Replace `const supabase = await createClient();\n  const { data: { user } } = await supabase.auth.getUser();`
 *      with `const user = await getCurrentUser();`
 *    - Replace `user.id` with `user.uid` (auth user context only)
 *
 * 2. Browser files (pages, components):
 *    - Replace `createClient` from `@/lib/supabase/client` with Firebase imports
 *    - Convert signInWithPassword, signUp, signOut, resetPasswordForEmail
 *
 * 3. Special files: proxy.ts, page.tsx (root)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
let changedCount = 0;
let skippedCount = 0;

function readFile(relPath) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

function writeFile(relPath, content) {
  writeFileSync(resolve(ROOT, relPath), content, 'utf-8');
}

// ─── Server-side conversion (actions + API routes + server components) ────────

function convertServerFile(relPath) {
  let content = readFile(relPath);
  if (!content) { console.log(`  SKIP (missing): ${relPath}`); skippedCount++; return; }
  if (!content.includes('supabase.auth.getUser()')) {
    if (content.includes('getCurrentUser')) {
      console.log(`  SKIP (already converted): ${relPath}`);
      skippedCount++;
      return;
    }
    console.log(`  SKIP (no auth): ${relPath}`);
    skippedCount++;
    return;
  }

  const original = content;

  // 1. Add getCurrentUser import if not present
  if (!content.includes('getCurrentUser')) {
    // Find the first import line and add after it
    const importMatch = content.match(/^(import .+\n)+/m);
    if (importMatch) {
      const lastImport = importMatch[0];
      content = content.replace(lastImport, lastImport + 'import { getCurrentUser } from "@/lib/firebase/auth";\n');
    }
  }

  // 2. Remove `createClient` from supabase/server import (keep createServiceClient)
  // Pattern: import { createClient, createServiceClient } from "@/lib/supabase/server";
  content = content.replace(
    /import\s*\{\s*createClient\s*,\s*createServiceClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?/g,
    'import { createServiceClient } from "@/lib/supabase/server";'
  );
  // Pattern: import { createClient } from "@/lib/supabase/server"; (alone)
  content = content.replace(
    /import\s*\{\s*createClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["'];?\n?/g,
    ''
  );

  // 3. Replace the auth pattern (multi-line):
  // const supabase = await createClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // → const user = await getCurrentUser();
  content = content.replace(
    /const supabase = await createClient\(\);\s*\n\s*const \{\s*data:\s*\{\s*user\s*\}\s*,?\s*\}\s*=\s*await supabase\.auth\.getUser\(\);/g,
    'const user = await getCurrentUser();'
  );

  // Also handle: const { data: { user } } = await supabase.auth.getUser();
  // where supabase was already created
  content = content.replace(
    /const \{\s*data:\s*\{\s*user\s*\}\s*,?\s*\}\s*=\s*await supabase\.auth\.getUser\(\);/g,
    'const user = await getCurrentUser();'
  );

  // Handle variants with extra whitespace/formatting:
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser();
  content = content.replace(
    /const\s*\{\s*\n\s*data:\s*\{\s*user\s*\}\s*,?\s*\n\s*\}\s*=\s*await supabase\.auth\.getUser\(\);/g,
    'const user = await getCurrentUser();'
  );

  // Remove leftover `const supabase = await createClient();` lines that are no longer needed
  // Only remove if there's no other usage of `supabase.` in the function
  // This is tricky, so let's leave them for now and let tsc catch unused vars

  // 4. Replace user.id with user.uid (only in auth context)
  // Be careful: don't replace user_id, userId, or other patterns
  content = content.replace(/\buser\.id\b/g, 'user.uid');

  // 5. Clean up unused `const supabase = await createClient();` lines
  // If supabase is only used for auth.getUser() (which we already replaced),
  // the remaining `const supabase = await createClient();` is unused
  // Remove only standalone lines
  content = content.replace(/^\s*const supabase = await createClient\(\);\s*\n/gm, '');

  if (content !== original) {
    writeFile(relPath, content);
    console.log(`  CONVERTED: ${relPath}`);
    changedCount++;
  } else {
    console.log(`  NO CHANGE: ${relPath}`);
    skippedCount++;
  }
}

// ─── Root page.tsx ────────────────────────────────────────────────────────────

function convertRootPage() {
  const relPath = 'src/app/page.tsx';
  let content = readFile(relPath);
  if (!content || !content.includes('supabase.auth.getUser()')) return;

  content = `import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/auth";

// 루트 페이지: 로그인 상태에 따라 리다이렉트
export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
`;
  writeFile(relPath, content);
  console.log(`  CONVERTED: ${relPath}`);
  changedCount++;
}

// ─── proxy.ts ────────────────────────────────────────────────────────────────

function convertProxy() {
  const relPath = 'src/proxy.ts';
  let content = readFile(relPath);
  if (!content || content.includes('firebase/middleware')) return;

  content = content.replace(
    '@/lib/supabase/middleware',
    '@/lib/firebase/middleware'
  );
  writeFile(relPath, content);
  console.log(`  CONVERTED: ${relPath}`);
  changedCount++;
}

// ─── auth-utils.ts ───────────────────────────────────────────────────────────

function convertAuthUtils() {
  const relPath = 'src/lib/auth-utils.ts';
  let content = readFile(relPath);
  if (!content || content.includes('getCurrentUser')) return;

  content = `"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * admin 전용: 회원 삭제, role 변경, 이메일 발송
 */
export async function requireAdmin(): Promise<SupabaseClient<Database>> {
  const user = await getCurrentUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (profile?.role !== "admin") throw new Error("권한이 없습니다.");
  return svc;
}

/**
 * staff(admin + assistant): 회원 목록 조회, 콘텐츠 관리, 큐레이션, 이메일 미리보기, 프로텍터 조회
 */
export async function requireStaff(): Promise<SupabaseClient<Database>> {
  const user = await getCurrentUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    throw new Error("권한이 없습니다.");
  }
  return svc;
}
`;
  writeFile(relPath, content);
  console.log(`  CONVERTED: ${relPath}`);
  changedCount++;
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('🔄 Converting Supabase Auth → Firebase Auth...\n');

// Special files first
console.log('── Special files ──');
convertAuthUtils();
convertProxy();
convertRootPage();

// Server Actions
console.log('\n── Server Actions ──');
const actions = [
  'src/actions/onboarding.ts',
  'src/actions/reviews.ts',
  'src/actions/questions.ts',
  'src/actions/posts.ts',
  'src/actions/qa-reports.ts',
  'src/actions/answers.ts',
  'src/actions/invites.ts',
];
for (const f of actions) convertServerFile(f);

// API Routes
console.log('\n── API Routes ──');
const apiRoutes = [
  'src/app/api/upload/route.ts',
  'src/app/api/qa-chatbot/route.ts',
  'src/app/api/sales-summary/route.ts',
  'src/app/api/agent-dashboard/route.ts',
  'src/app/api/creative/[id]/route.ts',
  'src/app/api/creative/search/route.ts',
  'src/app/api/competitor/download/route.ts',
  'src/app/api/competitor/download-zip/route.ts',
  'src/app/api/competitor/insights/route.ts',
  'src/app/api/competitor/analysis-status/route.ts',
  'src/app/api/competitor/monitors/route.ts',
  'src/app/api/competitor/monitors/[id]/route.ts',
  'src/app/api/competitor/monitors/[id]/alerts/route.ts',
  'src/app/api/admin/_shared.ts',
  'src/app/api/admin/reembed/route.ts',
  'src/app/api/admin/embed/route.ts',
  'src/app/api/admin/backfill/route.ts',
  'src/app/api/admin/knowledge/stats/route.ts',
  'src/app/api/admin/protractor/collect/route.ts',
  'src/app/api/protractor/_shared.ts',
  'src/app/api/protractor/save-secret/route.ts',
];
for (const f of apiRoutes) convertServerFile(f);

// Server Component pages
console.log('\n── Server Component Pages ──');
const serverPages = [
  'src/app/(main)/layout.tsx',
  'src/app/(main)/dashboard/page.tsx',
  'src/app/(main)/dashboard/student-home.tsx',
  'src/app/(main)/questions/page.tsx',
  'src/app/(main)/questions/new/page.tsx',
  'src/app/(main)/questions/[id]/page.tsx',
  'src/app/(main)/questions/[id]/edit/page.tsx',
  'src/app/(main)/posts/page.tsx',
  'src/app/(main)/posts/new/page.tsx',
  'src/app/(main)/posts/[id]/page.tsx',
  'src/app/(main)/reviews/page.tsx',
  'src/app/(main)/reviews/new/page.tsx',
  'src/app/(main)/reviews/[id]/page.tsx',
  'src/app/(main)/protractor/page.tsx',
  'src/app/(main)/protractor/layout.tsx',
  'src/app/(main)/protractor/creatives/page.tsx',
  'src/app/(main)/protractor/competitor/page.tsx',
  'src/app/(main)/settings/page.tsx',
  'src/app/(main)/admin/layout.tsx',
  'src/app/(main)/admin/email/[id]/page.tsx',
  'src/app/(main)/admin/protractor/benchmarks/page.tsx',
  'src/app/(main)/admin/terminal/page.tsx',
];
for (const f of serverPages) convertServerFile(f);

console.log(`\n✅ Done: ${changedCount} files converted, ${skippedCount} skipped`);
console.log('\n⚠️  Browser pages (login, signup, signOut etc.) require manual conversion');
console.log('⚠️  Special cases: ext/_shared.ts, ext/auth/route.ts, auth/callback/route.ts');
