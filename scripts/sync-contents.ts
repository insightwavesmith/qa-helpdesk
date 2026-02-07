/**
 * 콘텐츠 동기화 스크립트
 * knowledge 디렉토리의 .md 파일을 contents 테이블에 upsert합니다.
 *
 * 실행: npx tsx scripts/sync-contents.ts
 */

import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, basename, dirname } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local if dotenv is available
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
  dotenv.config({ path: join(import.meta.dirname, "../.env.local") });
} catch {
  // dotenv not available, relying on process.env
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KNOWLEDGE_BASE =
  "/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/claude/brand-school/marketing/knowledge";

/**
 * Determine category from directory path
 */
function getCategory(relativePath: string): string {
  const dir = dirname(relativePath);
  if (dir.startsWith("blueprint")) return "blueprint";
  if (dir.startsWith("blogs")) return "trend";
  return "general";
}

/**
 * Extract title from markdown content (first # heading or filename)
 */
function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) return match[1].trim();
  return basename(filePath, ".md");
}

/**
 * Recursively collect .md files
 */
async function collectMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectMdFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory read failure
  }
  return results;
}

async function main() {
  console.log(`Scanning: ${KNOWLEDGE_BASE}`);

  const dirExists = await stat(KNOWLEDGE_BASE).catch(() => null);
  if (!dirExists) {
    console.error(`Knowledge base directory not found: ${KNOWLEDGE_BASE}`);
    process.exit(1);
  }

  const files = await collectMdFiles(KNOWLEDGE_BASE);
  console.log(`Found ${files.length} markdown files`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(KNOWLEDGE_BASE, filePath);
    const hash = createHash("sha256").update(content).digest("hex");
    const category = getCategory(relativePath);
    const title = extractTitle(content, filePath);

    // Check if already exists with same hash
    const { data: existing } = await supabase
      .from("contents")
      .select("id, source_hash")
      .eq("source_ref", relativePath)
      .single();

    if (existing && existing.source_hash === hash) {
      skipped++;
      continue;
    }

    const record = {
      title,
      body_md: content,
      category,
      status: "ready",
      source_type: "file",
      source_ref: relativePath,
      source_hash: hash,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("contents")
        .update(record)
        .eq("id", existing.id);

      if (error) {
        console.error(`  ERROR updating ${relativePath}: ${error.message}`);
      } else {
        updated++;
        console.log(`  UPDATED: ${relativePath}`);
      }
    } else {
      // Insert new
      const { error } = await supabase.from("contents").insert(record);

      if (error) {
        console.error(`  ERROR inserting ${relativePath}: ${error.message}`);
      } else {
        created++;
        console.log(`  CREATED: ${relativePath}`);
      }
    }
  }

  console.log(
    `\nDone: ${created} created, ${updated} updated, ${skipped} skipped`
  );
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
