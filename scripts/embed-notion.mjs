/**
 * embed-notion.mjs
 * 노션 피드백반 데이터 수집 → Supabase 임베딩 저장
 *
 * 수집 우선순위:
 * 1. Sprint 실험 문서 (수강생 멤버 DB 페이지 하위 child_page)
 * 2. 몰입노트 DB 각 페이지 본문
 * 3. to-do #1/2 항목 (내용 있는 것만)
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Notion DB IDs
const MEMBER_DB_ID = "e8b2d7e8-2b75-4224-8490-878e7ae07f29";
const MOLIP_DB_ID = "663d5497-ccad-4505-b57a-52400a656d46";
const TODO1_DB_ID = "2ed4edaa-73df-8064-a70a-d1066493fb9e";
const TODO2_DB_ID = "2ed4edaa-73df-80c4-8ea9-eb7436301308";

// ─── Notion API ────────────────────────────────────────────────────────────

async function notionFetch(path, body = null) {
  const opts = {
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
  return res.json();
}

async function queryDatabase(dbId, filter = null) {
  const pages = [];
  let cursor = undefined;
  while (true) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    const data = await notionFetch(`/databases/${dbId}/query`, body);
    pages.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return pages;
}

async function getBlockChildren(blockId) {
  const blocks = [];
  let cursor = undefined;
  while (true) {
    let url = `/blocks/${blockId}/children?page_size=100`;
    if (cursor) url += `&start_cursor=${cursor}`;
    const data = await notionFetch(url);
    blocks.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return blocks;
}

// 블록에서 텍스트 추출
function extractBlockText(block) {
  const type = block.type;
  const content = block[type];
  if (!content) return "";

  const richTexts = content.rich_text || content.text || [];
  const text = richTexts.map((rt) => rt.plain_text || "").join("");

  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "quote") return `> ${text}`;
  if (type === "callout") return `💡 ${text}`;
  if (type === "bulleted_list_item") return `• ${text}`;
  if (type === "numbered_list_item") return `- ${text}`;
  if (type === "to_do") return `[${content.checked ? "x" : " "}] ${text}`;
  return text;
}

// 페이지 블록 전체 텍스트 재귀 수집
async function getPageFullText(pageId, depth = 0) {
  if (depth > 3) return ""; // 너무 깊이 들어가지 않도록
  const blocks = await getBlockChildren(pageId);
  const lines = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text.trim()) lines.push(text);

    // 하위 블록 재귀 처리 (toggle, quote 등)
    if (block.has_children && ["toggle", "callout", "quote", "bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const childText = await getPageFullText(block.id, depth + 1);
      if (childText.trim()) lines.push(childText);
    }
  }

  return lines.join("\n");
}

// ─── Gemini 임베딩 ─────────────────────────────────────────────────────────

async function generateEmbedding(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

// ─── 텍스트 청킹 ──────────────────────────────────────────────────────────

function chunkText(text, chunkSize = 800, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 50); // 너무 짧은 청크 제거
}

// ─── Supabase 저장 ─────────────────────────────────────────────────────────

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert ${table}: ${res.status} ${err.slice(0, 300)}`);
  }
  return res.json();
}

// 이미 저장된 노션 문서인지 확인 (source_ref로 중복 체크)
async function checkExistingContent(sourceRef) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/contents?source_ref=eq.${sourceRef}&select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const data = await res.json();
  return data.length > 0 ? data[0].id : null;
}

// ─── 문서 처리 (저장 + 임베딩) ────────────────────────────────────────────

let embedCount = 0;
let embedFail = 0;

async function processDocument({ title, bodyText, sourceType, sourceRef, lectureName, week, metadata }) {
  if (!bodyText || bodyText.trim().length < 20) {
    console.log(`  ⚠️  스킵 (내용 없음): ${title}`);
    return { chunks: 0, success: 0, fail: 0 };
  }

  // 중복 체크
  const existing = await checkExistingContent(sourceRef);
  if (existing) {
    console.log(`  ⏭️  이미 존재: ${title} (${existing})`);
    return { chunks: 0, success: 0, fail: 0 };
  }

  // 1. contents 테이블에 저장
  let contentId;
  try {
    const inserted = await supabaseInsert("contents", {
      title,
      body_md: bodyText,
      source_type: sourceType || "notion",
      source_ref: sourceRef,
      type: "education",       // CHECK: education/case_study/webinar/notice/promo
      category: "education",
      status: "draft",
      tags: [],
      embedding_status: "pending",
      curation_status: "new",  // CHECK: new/selected/dismissed/published
      priority: 2,
      importance_score: 0,
    });
    contentId = Array.isArray(inserted) ? inserted[0].id : inserted.id;
    console.log(`  ✅ contents 저장: ${title} → ${contentId}`);
  } catch (e) {
    console.error(`  ❌ contents 저장 실패: ${title}: ${e.message}`);
    return { chunks: 0, success: 0, fail: 1 };
  }

  // 2. 청킹 + 임베딩 + knowledge_chunks 저장
  const chunks = chunkText(bodyText);
  let localSuccess = 0;
  let localFail = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Rate limit: 50건마다 10초 대기
    if (embedCount > 0 && embedCount % 50 === 0) {
      console.log(`  ⏳ Rate limit 대기 (10초)... (총 ${embedCount}건 처리)`);
      await new Promise((r) => setTimeout(r, 10000));
    }

    try {
      const embedding = await generateEmbedding(chunk);
      embedCount++;

      await supabaseInsert("knowledge_chunks", {
        content_id: contentId,
        chunk_index: i,
        chunk_total: chunks.length,
        content: chunk,
        embedding,
        source_type: "notion",
        lecture_name: lectureName || title,
        week: week || "notion",
        metadata: metadata || {},
        embedding_model: "models/gemini-embedding-001",
      });

      localSuccess++;
    } catch (e) {
      localFail++;
      embedFail++;
      console.error(`  ❌ 청크 ${i}/${chunks.length} 실패: ${e.message}`);
    }
  }

  // contents 임베딩 상태 업데이트
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/contents?id=eq.${contentId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        embedding_status: localFail === 0 ? "done" : "partial",
        chunks_count: localSuccess,
        embedded_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // 업데이트 실패해도 계속 진행
  }

  console.log(`  📦 청크 ${localSuccess}/${chunks.length} 완료`);
  return { chunks: chunks.length, success: localSuccess, fail: localFail };
}

// ─── 데이터 수집 함수들 ────────────────────────────────────────────────────

// 멤버 목록 수집
async function fetchMembers() {
  console.log("\n📋 멤버 DB 수집 중...");
  const pages = await queryDatabase(MEMBER_DB_ID);
  const members = [];
  for (const page of pages) {
    const props = page.properties;
    const name = props["이름"]?.title?.[0]?.text?.content || "";
    const brand = props["브랜드"]?.rich_text?.[0]?.text?.content || "";
    const group = props["조"]?.select?.name || "";
    const accountId = props["account_id"]?.rich_text?.[0]?.text?.content || "";
    if (name) {
      members.push({ id: page.id, name, brand, group, accountId });
    }
  }
  console.log(`  → ${members.length}명 수집`);
  return members;
}

// Sprint 문서 수집 (각 멤버 페이지의 child_page)
async function collectSprintDocs(members) {
  console.log("\n🚀 Sprint 문서 수집 중...");
  const docs = [];

  for (const member of members) {
    console.log(`  [${member.name}] 페이지 탐색...`);
    try {
      const blocks = await getBlockChildren(member.id);
      const sprintPages = blocks.filter((b) => b.type === "child_page");

      for (const sprintPage of sprintPages) {
        const title = sprintPage.child_page?.title || "Sprint";
        console.log(`    → ${title} (${sprintPage.id})`);

        try {
          const bodyText = await getPageFullText(sprintPage.id);
          docs.push({
            title: `${member.name} - ${title}`,
            bodyText,
            sourceType: "notion",
            sourceRef: `notion-sprint-${sprintPage.id}`,
            lectureName: `${member.name} Sprint 문서`,
            week: title.toLowerCase().replace(/\s/g, ""),
            metadata: {
              type: "sprint",
              memberName: member.name,
              brand: member.brand,
              group: member.group,
              sprintTitle: title,
              pageId: sprintPage.id,
            },
          });
        } catch (e) {
          console.error(`    ❌ 블록 수집 실패: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`  ❌ 멤버 페이지 실패 (${member.name}): ${e.message}`);
    }
  }

  console.log(`  → Sprint 문서 총 ${docs.length}개`);
  return docs;
}

// 몰입노트 DB 수집
async function collectMolipDocs() {
  console.log("\n📝 몰입노트 DB 수집 중...");
  const pages = await queryDatabase(MOLIP_DB_ID);
  const docs = [];

  for (const page of pages) {
    const props = page.properties;
    const title = props["이름"]?.title?.[0]?.text?.content || `몰입노트_${page.id}`;
    const status = props["상태"]?.status?.name || "";
    const workDay = props["Work Day"]?.date?.start || "";
    const presenter = props["발표"]?.people?.[0]?.name || "";

    console.log(`  [${title}] 블록 수집...`);
    try {
      const bodyText = await getPageFullText(page.id);

      docs.push({
        title: `몰입노트 - ${title}`,
        bodyText,
        sourceType: "notion",
        sourceRef: `notion-molip-${page.id}`,
        lectureName: `몰입노트 - ${title}`,
        week: workDay ? workDay.slice(0, 10) : "unknown",
        metadata: {
          type: "molip_note",
          noteTitle: title,
          status,
          workDay,
          presenter,
          pageId: page.id,
        },
      });
    } catch (e) {
      console.error(`  ❌ 몰입노트 실패 (${title}): ${e.message}`);
    }
  }

  console.log(`  → 몰입노트 총 ${docs.length}개`);
  return docs;
}

// to-do DB 수집
async function collectTodoDocs(dbId, dbName) {
  console.log(`\n✅ ${dbName} 수집 중...`);
  const pages = await queryDatabase(dbId);
  const docs = [];
  let skipped = 0;

  for (const page of pages) {
    const props = page.properties;

    // 내용 추출 (title 타입)
    const content = props["내용"]?.title?.[0]?.text?.content || "";
    if (!content.trim()) {
      skipped++;
      continue;
    }

    // 사람 추출
    const people = props["사람"]?.people?.map((p) => p.name).join(", ") || "";
    const status = props["상태"]?.status?.name || props["상태"]?.select?.name || "";
    const period = props["기간"]?.date?.start || "";
    const note = props["비고"]?.rich_text?.map((r) => r.plain_text).join("") || "";

    // 본문 텍스트 구성
    let bodyText = `과제: ${content}`;
    if (people) bodyText += `\n담당: ${people}`;
    if (status) bodyText += `\n상태: ${status}`;
    if (period) bodyText += `\n기간: ${period}`;
    if (note) bodyText += `\n비고: ${note}`;

    // 페이지 본문 블록도 수집
    try {
      const extraText = await getPageFullText(page.id);
      if (extraText.trim()) bodyText += `\n\n${extraText}`;
    } catch (e) {
      // 블록 없어도 무시
    }

    docs.push({
      title: `${dbName} - ${content.slice(0, 50)}`,
      bodyText,
      sourceType: "notion",
      sourceRef: `notion-todo-${page.id}`,
      lectureName: dbName,
      week: period || "unknown",
      metadata: {
        type: "todo",
        dbName,
        content,
        people,
        status,
        period,
        pageId: page.id,
      },
    });
  }

  console.log(`  → ${docs.length}개 수집, ${skipped}개 스킵 (내용 없음)`);
  return docs;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 노션 피드백반 임베딩 작업 시작");
  console.log(`  시간: ${new Date().toLocaleString("ko-KR")}\n`);

  // 1. 멤버 목록 수집
  const members = await fetchMembers();

  // 2. 데이터 수집
  const sprintDocs = await collectSprintDocs(members);
  const molipDocs = await collectMolipDocs();
  const todo1Docs = await collectTodoDocs(TODO1_DB_ID, "개선과제(to-do#1)");
  const todo2Docs = await collectTodoDocs(TODO2_DB_ID, "이벤트/리뷰과제(to-do#2)");

  // 우선순위 순서: Sprint → 몰입노트 → to-do
  const allDocs = [...sprintDocs, ...molipDocs, ...todo1Docs, ...todo2Docs];

  console.log(`\n📊 수집 현황:`);
  console.log(`  Sprint 문서: ${sprintDocs.length}개`);
  console.log(`  몰입노트: ${molipDocs.length}개`);
  console.log(`  to-do #1: ${todo1Docs.length}개`);
  console.log(`  to-do #2: ${todo2Docs.length}개`);
  console.log(`  합계: ${allDocs.length}개`);

  // 3. 임베딩 처리
  console.log("\n🔄 임베딩 처리 시작...\n");

  let totalChunks = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  let docsFailed = 0;

  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];
    console.log(`[${i + 1}/${allDocs.length}] ${doc.title}`);

    try {
      const result = await processDocument(doc);
      totalChunks += result.chunks;
      totalSuccess += result.success;
      totalFail += result.fail;
    } catch (e) {
      docsFailed++;
      console.error(`  ❌ 문서 처리 실패: ${e.message}`);
    }
  }

  // 4. 결과 요약
  console.log("\n" + "═".repeat(60));
  console.log("✅ 노션 피드백반 임베딩 완료");
  console.log("═".repeat(60));
  console.log(`📋 수집 문서: ${allDocs.length}개`);
  console.log(`   - Sprint: ${sprintDocs.length}개`);
  console.log(`   - 몰입노트: ${molipDocs.length}개`);
  console.log(`   - to-do #1: ${todo1Docs.length}개`);
  console.log(`   - to-do #2: ${todo2Docs.length}개`);
  console.log(`📦 총 청크: ${totalChunks}개`);
  console.log(`✅ 임베딩 성공: ${totalSuccess}개`);
  console.log(`❌ 임베딩 실패: ${totalFail}개`);
  console.log(`💥 문서 처리 실패: ${docsFailed}개`);
  console.log(`📡 Gemini API 호출: ${embedCount}회`);
  console.log("═".repeat(60));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
