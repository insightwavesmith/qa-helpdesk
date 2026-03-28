/**
 * 정보공유(posts) 이미지 마이그레이션 스크립트
 *
 * body_md에 IMAGE_PLACEHOLDER 패턴이 남아있는 contents를
 * Unsplash API → Supabase Storage로 일괄 교체한다.
 *
 * 실행:
 *   DRY_RUN=1 npx tsx scripts/migrate-post-images.ts   # dry-run (기본)
 *   npx tsx scripts/migrate-post-images.ts              # 실제 업데이트
 */

import { join } from "path";
import { createClient } from "@supabase/supabase-js";

try {
  const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
  const base = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  dotenv.config({ path: join(base, "../.env.local") });
} catch {}

const DRY_RUN = process.env.DRY_RUN === "1" || !process.argv.includes("--write");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!UNSPLASH_KEY) {
  console.error("Missing UNSPLASH_ACCESS_KEY — 마이그레이션 불가");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function slugifyAlt(alt: string): string {
  return (
    alt
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "image"
  );
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveImagePlaceholders(bodyMd: string, contentId: string): Promise<string> {
  const PLACEHOLDER_RE = /!\[([^\]]*)\]\(IMAGE\\?_PLACEHOLDER\)/g;
  const matches = [...bodyMd.matchAll(PLACEHOLDER_RE)];
  if (matches.length === 0) return bodyMd;

  let result = bodyMd;

  for (const match of matches) {
    const fullMatch = match[0];
    const alt = match[1] || "image";

    try {
      // Unsplash 검색
      const unsplashRes = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(alt)}&orientation=landscape&per_page=1`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
      );
      if (!unsplashRes.ok) {
        console.warn(`  [WARN] Unsplash 응답 오류 (${unsplashRes.status}) for alt="${alt}"`);
        continue;
      }

      const unsplashData = (await unsplashRes.json()) as {
        results?: { urls?: { regular?: string } }[];
      };
      const photoUrl = unsplashData.results?.[0]?.urls?.regular;
      if (!photoUrl) {
        console.warn(`  [WARN] Unsplash 검색 결과 없음 for alt="${alt}"`);
        continue;
      }

      // 이미지 다운로드
      const imageRes = await fetch(photoUrl);
      if (!imageRes.ok) {
        console.warn(`  [WARN] 이미지 다운로드 실패 (${imageRes.status}) for alt="${alt}"`);
        continue;
      }

      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      const slug = slugifyAlt(alt);
      const fileName = `posts/${contentId}/${slug}.jpg`;

      // Supabase Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from("content-images")
        .upload(fileName, imageBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadError) {
        console.warn(`  [WARN] 업로드 실패 (${alt}): ${uploadError.message}`);
        continue;
      }

      // Public URL 생성 후 치환
      const { data: urlData } = supabase.storage
        .from("content-images")
        .getPublicUrl(fileName);

      result = result.replace(fullMatch, `![${alt}](${urlData.publicUrl})`);
      console.log(`  [OK] alt="${alt}" → ${urlData.publicUrl}`);

      // Unsplash rate limit 고려: 요청 간 1초 대기
      await sleep(1000);
    } catch (err) {
      console.warn(`  [ERROR] 처리 실패 (alt="${alt}"):`, err);
    }
  }

  return result;
}

async function main() {
  if (DRY_RUN) {
    console.log("DRY-RUN 모드 (실제 업데이트 없음) — --write 플래그로 실행하면 반영됩니다\n");
  } else {
    console.log("WRITE 모드 — contents 테이블에 실제 업데이트 진행\n");
  }

  // IMAGE_PLACEHOLDER 패턴이 있는 contents 조회
  // Supabase ilike는 % 와일드카드 사용
  const { data: contents, error } = await supabase
    .from("contents")
    .select("id, title, body_md")
    .or("body_md.ilike.%IMAGE_PLACEHOLDER%,body_md.ilike.%IMAGE\\_PLACEHOLDER%");

  if (error) {
    console.error("contents 조회 실패:", error.message);
    process.exit(1);
  }

  if (!contents || contents.length === 0) {
    console.log("IMAGE_PLACEHOLDER 패턴이 있는 콘텐츠가 없습니다.");
    return;
  }

  console.log(`총 ${contents.length}건의 콘텐츠에 IMAGE_PLACEHOLDER 패턴이 있습니다.\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const content of contents) {
    console.log(`\n처리 중: [${content.id}] ${content.title}`);

    // PLACEHOLDER_RE 패턴 재확인 (ilike 오탐 방지)
    const PLACEHOLDER_RE = /!\[([^\]]*)\]\(IMAGE\\?_PLACEHOLDER\)/g;
    if (!PLACEHOLDER_RE.test(content.body_md)) {
      console.log("  → 실제 패턴 없음 (건너뜀)");
      skipCount++;
      continue;
    }

    if (DRY_RUN) {
      const matchCount = [...content.body_md.matchAll(PLACEHOLDER_RE)].length;
      console.log(`  → [DRY-RUN] IMAGE_PLACEHOLDER 패턴 ${matchCount}건 감지`);
      skipCount++;
      continue;
    }

    try {
      const resolvedBodyMd = await resolveImagePlaceholders(content.body_md, content.id);

      if (resolvedBodyMd === content.body_md) {
        console.log("  → 변경 없음 (패턴 처리 실패)");
        skipCount++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("contents")
        .update({ body_md: resolvedBodyMd, updated_at: new Date().toISOString() })
        .eq("id", content.id);

      if (updateError) {
        console.error(`  [ERROR] 업데이트 실패: ${updateError.message}`);
        errorCount++;
      } else {
        console.log("  → 업데이트 완료");
        successCount++;
      }
    } catch (err) {
      console.error(`  [ERROR] 처리 중 예외:`, err);
      errorCount++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  if (DRY_RUN) {
    console.log("DRY-RUN 완료");
    console.log(`  처리 대상: ${contents.length}건 (패턴 미확인 건너뜀: ${skipCount}건)`);
    console.log("\n실제 반영하려면: npx tsx scripts/migrate-post-images.ts --write");
  } else {
    console.log("마이그레이션 완료");
    console.log(`  성공: ${successCount}건, 건너뜀: ${skipCount}건, 오류: ${errorCount}건`);
  }
}

main().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
