/**
 * sync-notion — 노션 캠프반 데이터 자동 동기화
 * Vercel Cron: 매일 04:00 UTC (KST 13:00)
 *
 * 수집 대상: 멤버 DB → Sprint 문서 / 몰입노트 DB / to-do DB
 * 저장: contents → knowledge_chunks (임베딩)
 * 중복: source_ref로 체크 (이미 저장된 문서 스킵)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini";
import { chunkText } from "@/lib/chunk-utils";

// ── Vercel Cron 인증 ─────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Notion 환경변수 ──────────────────────────────────────────
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const MEMBER_DB_ID = process.env.NOTION_DB_MEMBER ?? "";
const MOLIP_DB_ID = process.env.NOTION_DB_MOLIP ?? "";
const TODO1_DB_ID = process.env.NOTION_DB_TODO1 ?? "";
const TODO2_DB_ID = process.env.NOTION_DB_TODO2 ?? "";

// ── Notion API 유틸 ─────────────────────────────────────────

async function notionFetch(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const opts: RequestInit = {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.notion.com/v1${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

async function queryDatabase(dbId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/databases/${dbId}/query`, body);
    const results = data.results as NotionPage[];
    pages.push(...results);
    if (!data.has_more) break;
    cursor = data.next_cursor as string;
  }
  return pages;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

async function getBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let url = `/blocks/${blockId}/children?page_size=100`;
    if (cursor) url += `&start_cursor=${cursor}`;
    const data = await notionFetch(url);
    blocks.push(...(data.results as NotionBlock[]));
    if (!data.has_more) break;
    cursor = data.next_cursor as string;
  }
  return blocks;
}

function extractBlockText(block: NotionBlock): string {
  const type = block.type;
  const content = block[type];
  if (!content) return "";

  const richTexts: { plain_text?: string }[] = content.rich_text || content.text || [];
  const text = richTexts.map((rt) => rt.plain_text || "").join("");

  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "quote") return `> ${text}`;
  if (type === "callout") return text;
  if (type === "bulleted_list_item") return `- ${text}`;
  if (type === "numbered_list_item") return `- ${text}`;
  if (type === "to_do") return `[${content.checked ? "x" : " "}] ${text}`;
  return text;
}

async function getPageFullText(pageId: string, depth = 0): Promise<string> {
  if (depth > 3) return "";
  const blocks = await getBlockChildren(pageId);
  const lines: string[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text.trim()) lines.push(text);

    if (block.has_children && ["toggle", "callout", "quote", "bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const childText = await getPageFullText(block.id, depth + 1);
      if (childText.trim()) lines.push(childText);
    }
  }

  return lines.join("\n");
}

// ── Notion 프로퍼티 헬퍼 ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPropTitle(props: Record<string, any>, key: string): string {
  return props[key]?.title?.[0]?.text?.content || "";
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPropRichText(props: Record<string, any>, key: string): string {
  return props[key]?.rich_text?.[0]?.text?.content || "";
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPropSelect(props: Record<string, any>, key: string): string {
  return props[key]?.select?.name || props[key]?.status?.name || "";
}

// ── 문서 처리 (저장 + 임베딩) ────────────────────────────────

interface DocInput {
  title: string;
  bodyText: string;
  sourceRef: string;
  lectureName: string;
  week: string;
  metadata: Record<string, unknown>;
}

interface ProcessResult {
  chunks: number;
  success: number;
  fail: number;
  skipped: boolean;
}

let embedCount = 0;

async function processDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  doc: DocInput,
): Promise<ProcessResult> {
  if (!doc.bodyText || doc.bodyText.trim().length < 20) {
    return { chunks: 0, success: 0, fail: 0, skipped: true };
  }

  // 중복 체크 (source_ref)
  const { data: existing } = await svc
    .from("contents")
    .select("id")
    .eq("source_ref", doc.sourceRef)
    .limit(1);

  if (existing && existing.length > 0) {
    return { chunks: 0, success: 0, fail: 0, skipped: true };
  }

  // 1. contents 저장
  const { data: inserted, error: insertErr } = await svc
    .from("contents")
    .insert({
      title: doc.title,
      body_md: doc.bodyText,
      source_type: "notion",
      source_ref: doc.sourceRef,
      type: "education",
      category: "education",
      status: "draft",
      tags: [],
      embedding_status: "pending",
      curation_status: "new",
      priority: 2,
      importance_score: 0,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error(`[sync-notion] contents 저장 실패: ${doc.title}`, insertErr?.message);
    return { chunks: 0, success: 0, fail: 1, skipped: false };
  }

  const contentId = inserted.id as string;

  // 2. 청킹 + 임베딩
  const chunks = chunkText(doc.bodyText);
  let localSuccess = 0;
  let localFail = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Rate limit: 50건마다 10초 대기
    if (embedCount > 0 && embedCount % 50 === 0) {
      await new Promise((r) => setTimeout(r, 10_000));
    }

    try {
      const embedding = await generateEmbedding(chunks[i]);
      embedCount++;

      const { error: chunkErr } = await svc
        .from("knowledge_chunks")
        .insert({
          content_id: contentId,
          chunk_index: i,
          chunk_total: chunks.length,
          content: chunks[i],
          embedding,
          source_type: "notion",
          lecture_name: doc.lectureName,
          week: doc.week,
          metadata: doc.metadata,
          embedding_model: "gemini-embedding-001",
        });

      if (chunkErr) throw chunkErr;
      localSuccess++;
    } catch (e) {
      localFail++;
      console.error(`[sync-notion] 청크 ${i}/${chunks.length} 실패:`, e instanceof Error ? e.message : e);
    }
  }

  // contents 임베딩 상태 업데이트
  await svc
    .from("contents")
    .update({
      embedding_status: localFail === 0 ? "done" : "partial",
      chunks_count: localSuccess,
      embedded_at: new Date().toISOString(),
    })
    .eq("id", contentId);

  return { chunks: chunks.length, success: localSuccess, fail: localFail, skipped: false };
}

// ── 데이터 수집 ─────────────────────────────────────────────

interface Member {
  id: string;
  name: string;
  brand: string;
  group: string;
}

async function fetchMembers(): Promise<Member[]> {
  if (!MEMBER_DB_ID) return [];
  const pages = await queryDatabase(MEMBER_DB_ID);
  return pages
    .map((page) => ({
      id: page.id,
      name: getPropTitle(page.properties, "이름"),
      brand: getPropRichText(page.properties, "브랜드"),
      group: getPropSelect(page.properties, "조"),
    }))
    .filter((m) => m.name);
}

async function collectSprintDocs(members: Member[]): Promise<DocInput[]> {
  const docs: DocInput[] = [];
  for (const member of members) {
    try {
      const blocks = await getBlockChildren(member.id);
      const sprintPages = blocks.filter((b) => b.type === "child_page");

      for (const sp of sprintPages) {
        const title = sp.child_page?.title || "Sprint";
        try {
          const bodyText = await getPageFullText(sp.id);
          docs.push({
            title: `${member.name} - ${title}`,
            bodyText,
            sourceRef: `notion-sprint-${sp.id}`,
            lectureName: `${member.name} Sprint 문서`,
            week: title.toLowerCase().replace(/\s/g, ""),
            metadata: { type: "sprint", memberName: member.name, brand: member.brand, group: member.group, sprintTitle: title },
          });
        } catch { /* 블록 수집 실패 무시 */ }
      }
    } catch { /* 멤버 페이지 실패 무시 */ }
  }
  return docs;
}

async function collectMolipDocs(): Promise<DocInput[]> {
  if (!MOLIP_DB_ID) return [];
  const pages = await queryDatabase(MOLIP_DB_ID);
  const docs: DocInput[] = [];

  for (const page of pages) {
    const title = getPropTitle(page.properties, "이름") || `몰입노트_${page.id}`;
    const status = getPropSelect(page.properties, "상태");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workDay = (page.properties as any)["Work Day"]?.date?.start || "";

    try {
      const bodyText = await getPageFullText(page.id);
      docs.push({
        title: `몰입노트 - ${title}`,
        bodyText,
        sourceRef: `notion-molip-${page.id}`,
        lectureName: `몰입노트 - ${title}`,
        week: workDay ? workDay.slice(0, 10) : "unknown",
        metadata: { type: "molip_note", noteTitle: title, status, workDay },
      });
    } catch { /* 무시 */ }
  }
  return docs;
}

async function collectTodoDocs(dbId: string, dbName: string): Promise<DocInput[]> {
  if (!dbId) return [];
  const pages = await queryDatabase(dbId);
  const docs: DocInput[] = [];

  for (const page of pages) {
    const content = getPropTitle(page.properties, "내용");
    if (!content.trim()) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = page.properties as any;
    const people = props["사람"]?.people?.map((p: { name: string }) => p.name).join(", ") || "";
    const status = getPropSelect(page.properties, "상태");
    const period = props["기간"]?.date?.start || "";
    const note = props["비고"]?.rich_text?.map((r: { plain_text: string }) => r.plain_text).join("") || "";

    let bodyText = `과제: ${content}`;
    if (people) bodyText += `\n담당: ${people}`;
    if (status) bodyText += `\n상태: ${status}`;
    if (period) bodyText += `\n기간: ${period}`;
    if (note) bodyText += `\n비고: ${note}`;

    try {
      const extraText = await getPageFullText(page.id);
      if (extraText.trim()) bodyText += `\n\n${extraText}`;
    } catch { /* 무시 */ }

    docs.push({
      title: `${dbName} - ${content.slice(0, 50)}`,
      bodyText,
      sourceRef: `notion-todo-${page.id}`,
      lectureName: dbName,
      week: period || "unknown",
      metadata: { type: "todo", dbName, content, people, status, period },
    });
  }
  return docs;
}

// ── GET /api/cron/sync-notion ───────────────────────────────

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!NOTION_TOKEN) {
    return NextResponse.json({ error: "NOTION_TOKEN not set" }, { status: 500 });
  }

  const svc = createServiceClient();
  embedCount = 0;

  try {
    // 1. 데이터 수집
    const members = await fetchMembers();
    const sprintDocs = await collectSprintDocs(members);
    const molipDocs = await collectMolipDocs();
    const todo1Docs = await collectTodoDocs(TODO1_DB_ID, "개선과제(to-do#1)");
    const todo2Docs = await collectTodoDocs(TODO2_DB_ID, "이벤트/리뷰과제(to-do#2)");

    const allDocs = [...sprintDocs, ...molipDocs, ...todo1Docs, ...todo2Docs];

    // 2. 임베딩 처리
    let totalChunks = 0;
    let totalSuccess = 0;
    let totalFail = 0;
    let totalSkipped = 0;

    for (const doc of allDocs) {
      const result = await processDocument(svc, doc);
      totalChunks += result.chunks;
      totalSuccess += result.success;
      totalFail += result.fail;
      if (result.skipped) totalSkipped++;
    }

    return NextResponse.json({
      message: "sync-notion 완료",
      members: members.length,
      collected: {
        sprint: sprintDocs.length,
        molip: molipDocs.length,
        todo1: todo1Docs.length,
        todo2: todo2Docs.length,
        total: allDocs.length,
      },
      embedding: {
        chunks: totalChunks,
        success: totalSuccess,
        fail: totalFail,
        skipped: totalSkipped,
        api_calls: embedCount,
      },
    });
  } catch (e) {
    console.error("[sync-notion] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
