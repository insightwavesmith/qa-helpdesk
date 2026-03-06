/**
 * knowledge_chunks(lecture) → contents 테이블 마이그레이션 스크립트
 *
 * - knowledge_chunks에서 source_type='lecture' 조회
 * - week + lecture_name 기준 그룹핑
 * - 그룹별 chunk_index 순 정렬 → body_md 생성
 * - contents 테이블에 source_ref 기준 upsert
 *
 * 실행:
 *   npx tsx scripts/migrate-lectures-to-contents.ts         # dry-run
 *   npx tsx scripts/migrate-lectures-to-contents.ts --write  # 실제 쓰기
 */

import { join } from "path";
import { createClient } from "@supabase/supabase-js";

try {
  const dotenv = require("dotenv") as { config: (opts: { path: string }) => void };
  // import.meta.dirname이 없는 환경(tsx CJS 모드) 대비: __dirname 또는 절대경로 사용
  const base = typeof __dirname !== "undefined" ? __dirname : (import.meta.dirname ?? process.cwd());
  dotenv.config({ path: join(base, "../.env.local") });
} catch {}

const DRY_RUN = !process.argv.includes("--write");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Chunk {
  id: string;
  week: string;
  lecture_name: string;
  chunk_index: number;
  content: string;
  topic_tags: string[] | null;
  metadata: Record<string, unknown> | null;
}

interface GroupKey {
  week: string;
  lecture_name: string;
}

function makeSourceRef(week: string, lecture_name: string): string {
  // week='lecture'는 가이드 문서 (잘못 분류된 week값)
  if (week === "lecture") {
    return `lecture/guide/${lecture_name}`;
  }
  return `lecture/${week}/${lecture_name}`;
}

function makeTitle(week: string, lecture_name: string): string {
  // week="lecture" 또는 week="0" (숫자 문자열) → 가이드 문서: lecture_name만 사용
  if (week === "lecture" || week === "0") {
    return lecture_name;
  }
  return `${week} ${lecture_name}`; // "1주차 1강(1)"
}

function makeCategory(week: string): string {
  if (week === "lecture" || week === "0") return "guide";
  return "lecture";
}

async function main() {
  if (DRY_RUN) {
    console.log("🔍 DRY-RUN 모드 (실제 쓰기 없음) — --write 플래그로 실행하면 반영됩니다\n");
  } else {
    console.log("✍️  WRITE 모드 — contents 테이블에 실제 upsert 진행\n");
  }

  // 1. knowledge_chunks에서 모든 lecture 청크 조회
  console.log("📚 knowledge_chunks에서 lecture 청크 조회 중...");
  const { data: chunks, error: chunksErr } = await supabase
    .from("knowledge_chunks")
    .select("id, week, lecture_name, chunk_index, content, topic_tags, metadata")
    .eq("source_type", "lecture")
    .order("week")
    .order("lecture_name")
    .order("chunk_index");

  if (chunksErr) {
    console.error("knowledge_chunks 조회 실패:", chunksErr.message);
    process.exit(1);
  }

  console.log(`  → 총 ${chunks.length}건 청크 조회 완료\n`);

  // 2. week + lecture_name 기준 그룹핑
  const groupMap = new Map<string, Chunk[]>();
  for (const chunk of chunks as Chunk[]) {
    const key = `${chunk.week}|||${chunk.lecture_name}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(chunk);
  }

  const groups: { key: GroupKey; chunks: Chunk[] }[] = [];
  for (const [key, groupChunks] of groupMap.entries()) {
    const [week, lecture_name] = key.split("|||");
    // chunk_index 순 정렬 (이미 쿼리에서 정렬했지만 보장)
    groupChunks.sort((a, b) => a.chunk_index - b.chunk_index);
    groups.push({ key: { week, lecture_name }, chunks: groupChunks });
  }

  console.log(`📦 총 ${groups.length}개 그룹 (week+lecture_name 조합):\n`);

  // 3. 기존 contents(lecture)의 null source_ref 항목 조회 (가이드 문서용 매핑)
  const { data: existingLectures } = await supabase
    .from("contents")
    .select("id, title, source_ref, source_type")
    .eq("source_type", "lecture");

  const existingByRef = new Map<string, string>(); // source_ref → id
  const existingNullRefById = new Map<string, string>(); // title → id (source_ref=null인 것)

  for (const row of existingLectures || []) {
    if (row.source_ref) {
      existingByRef.set(row.source_ref, row.id);
    } else {
      existingNullRefById.set(row.title, row.id);
    }
  }

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const { key, chunks: groupChunks } of groups) {
    const { week, lecture_name } = key;
    const sourceRef = makeSourceRef(week, lecture_name);
    const title = makeTitle(week, lecture_name);
    const category = makeCategory(week);

    // chunk content 합본 (청크 구분자 포함)
    const bodyMd = groupChunks
      .map((c) => c.content?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    // topic_tags 수집 (중복 제거)
    const allTags = groupChunks
      .flatMap((c) => c.topic_tags ?? [])
      .filter(Boolean);
    const uniqueTags = [...new Set(allTags)];

    const action = existingByRef.has(sourceRef)
      ? "UPDATE"
      : existingNullRefById.has(title)
      ? "MERGE" // null source_ref → set source_ref
      : "CREATE";

    console.log(`  [${action}] ${title}`);
    console.log(`         source_ref: ${sourceRef}`);
    console.log(`         chunks: ${groupChunks.length}, body_md: ${bodyMd.length}자`);
    if (uniqueTags.length > 0) {
      console.log(`         tags: ${uniqueTags.slice(0, 5).join(", ")}${uniqueTags.length > 5 ? "..." : ""}`);
    }

    if (DRY_RUN) continue;

    const record = {
      title,
      body_md: bodyMd,
      type: "education",       // contents_type_check 제약: education | case_study | webinar
      category,
      status: "ready",
      source_type: "lecture",
      source_ref: sourceRef,
      importance_score: 5,
      curation_status: "published",
      updated_at: new Date().toISOString(),
      ...(uniqueTags.length > 0 ? { key_topics: uniqueTags } : {}),
    };

    if (action === "UPDATE") {
      const existingId = existingByRef.get(sourceRef)!;
      const { error } = await supabase.from("contents").update(record).eq("id", existingId);
      if (error) {
        console.error(`    ❌ UPDATE 실패: ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else if (action === "MERGE") {
      // null source_ref 항목을 실제 source_ref로 업데이트
      const existingId = existingNullRefById.get(title)!;
      const { error } = await supabase.from("contents").update(record).eq("id", existingId);
      if (error) {
        console.error(`    ❌ MERGE 실패: ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      // CREATE: 새 레코드 삽입
      const { error } = await supabase.from("contents").insert(record);
      if (error) {
        console.error(`    ❌ INSERT 실패: ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);

  if (DRY_RUN) {
    const createCount = groups.filter(({ key: { week, lecture_name } }) => {
      const sourceRef = makeSourceRef(week, lecture_name);
      const title = makeTitle(week, lecture_name);
      return !existingByRef.has(sourceRef) && !existingNullRefById.has(title);
    }).length;
    const mergeCount = groups.filter(({ key: { week, lecture_name } }) => {
      const title = makeTitle(week, lecture_name);
      const sourceRef = makeSourceRef(week, lecture_name);
      return !existingByRef.has(sourceRef) && existingNullRefById.has(title);
    }).length;
    const updateCount = groups.filter(({ key: { week, lecture_name } }) =>
      existingByRef.has(makeSourceRef(week, lecture_name))
    ).length;

    console.log(`✅ DRY-RUN 완료`);
    console.log(`   예상: ${createCount}건 CREATE, ${mergeCount}건 MERGE, ${updateCount}건 UPDATE`);
    console.log(`\n   실제 반영하려면: npx tsx scripts/migrate-lectures-to-contents.ts --write`);
  } else {
    console.log(`✅ 마이그레이션 완료`);
    console.log(`   ${created}건 생성, ${updated}건 업데이트, ${errors}건 오류`);

    // 검증: 최종 카운트
    const { count: finalCount } = await supabase
      .from("contents")
      .select("*", { count: "exact", head: true })
      .eq("source_type", "lecture");
    console.log(`\n📊 검증: contents에 source_type='lecture' → ${finalCount}건`);
  }
}

main().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
