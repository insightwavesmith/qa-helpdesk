/**
 * migrate-notion-to-case-study.mjs
 * 노션 피드백반 데이터(source_type="notion") → 사람×스프린트 병합 → case_study INSERT
 *
 * 사용법:
 *   node scripts/migrate-notion-to-case-study.mjs --dry-run   # DB 변경 없이 병합 결과만 출력
 *   node scripts/migrate-notion-to-case-study.mjs             # 실제 실행 (INSERT + 기존 notion 삭제)
 *
 * 환경변수:
 *   SUPABASE_SERVICE_ROLE_KEY (필수)
 */

const SUPABASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

// ─── 영문→한글 담당자 매핑 ───────────────────────────────────────────────────

const NAME_MAP = {
  "yoobeom heo": "허유범",
  "yonghyup sung": "성용협",
  "성용협": "성용협",
  "minkyu lee": "이민규",
  "minkyu jung": "정민규",
  "myungseok hyun": "현명석",
  "hyunseok seo": "서현석",
};

const KNOWN_NAMES = ["이민규", "성용협", "허유범", "정민규", "현명석", "서현석"];

// ─── 스프린트 기간 매핑 ──────────────────────────────────────────────────────

const SPRINT_PERIODS = {
  1: { start: "2026-01-21", end: "2026-01-27" },
  2: { start: "2026-01-28", end: "2026-02-10" },
};

// ─── Supabase REST 헬퍼 ─────────────────────────────────────────────────────

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function supabaseGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase GET ${table}: ${res.status} ${err.slice(0, 300)}`);
  }
  return res.json();
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase INSERT ${table}: ${res.status} ${err.slice(0, 300)}`);
  }
  return res.json();
}

async function supabaseDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase DELETE ${table}: ${res.status} ${err.slice(0, 300)}`);
  }
}

// ─── 이름 추출 ──────────────────────────────────────────────────────────────

/** body_md에서 "담당: {이름}" 추출 → 한글 이름 반환 */
function extractOwnerFromBody(bodyMd) {
  if (!bodyMd) return null;
  const match = bodyMd.match(/담당:\s*(.+)/);
  if (!match) return null;

  const raw = match[1].trim().toLowerCase();

  // 영문 이름 매핑
  for (const [eng, kor] of Object.entries(NAME_MAP)) {
    if (raw.includes(eng.toLowerCase())) return kor;
  }

  // 이미 한글 이름이면 그대로
  for (const name of KNOWN_NAMES) {
    if (raw.includes(name)) return name;
  }

  return null;
}

/** title에서 이름 추출 (Sprint 문서: "{이름} - Sprint N") */
function extractOwnerFromTitle(title) {
  if (!title) return null;

  // Sprint 문서: "이민규 - Sprint 1 [자사몰 개선]" 등
  for (const name of KNOWN_NAMES) {
    if (title.startsWith(name)) return name;
  }

  return null;
}

// ─── title 패턴 분류 ────────────────────────────────────────────────────────

/** Sprint 번호 추출 (1, 2, ...) */
function extractSprintNumber(title) {
  const match = title.match(/Sprint\s*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

/** 문서 유형 분류 */
function classifyDoc(title) {
  if (/Sprint\s*\d/i.test(title) && !title.startsWith("개선과제") && !title.startsWith("이벤트")) {
    return "sprint";
  }
  if (title.startsWith("개선과제(to-do#1)")) return "todo1";
  if (title.startsWith("이벤트") || title.startsWith("이벤트&리뷰(to-do#2)") || title.startsWith("이벤트/리뷰과제(to-do#2)")) return "todo2";
  if (title.startsWith("몰입노트")) return "molip";
  return "unknown";
}

// ─── to-do의 스프린트 판별 (기간 기반) ──────────────────────────────────────

function dateToSprint(bodyMd) {
  if (!bodyMd) return null;
  const match = bodyMd.match(/기간:\s*(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const dateStr = match[1];
  for (const [num, period] of Object.entries(SPRINT_PERIODS)) {
    if (dateStr >= period.start && dateStr <= period.end) return parseInt(num);
  }
  return null;
}

// ─── 병합 로직 ──────────────────────────────────────────────────────────────

function buildMergedMarkdown(name, sprintNum, sprintDoc, todo1Docs, todo2Docs) {
  const period = SPRINT_PERIODS[sprintNum];
  const periodStr = period ? `${period.start} ~ ${period.end}` : "";

  const lines = [];
  lines.push(`# ${name} Sprint ${sprintNum} 실전 사례`);
  lines.push("");

  if (periodStr) {
    lines.push(`> 기간: ${periodStr}`);
    lines.push("");
  }

  // 스프린트 목표
  lines.push("## 스프린트 목표");
  if (sprintDoc && sprintDoc.body_md && sprintDoc.body_md.trim()) {
    lines.push(sprintDoc.body_md.trim());
  } else {
    lines.push("(스프린트 문서 없음)");
  }
  lines.push("");

  // 개선과제 (to-do#1)
  if (todo1Docs.length > 0) {
    lines.push("## 개선과제 (to-do#1)");
    lines.push("");
    for (const doc of todo1Docs) {
      const taskName = doc.title.replace(/^개선과제\(to-do#1\)\s*-\s*/, "").trim();
      lines.push(`### ${taskName}`);

      // body_md에서 메타 정보 추출
      const body = doc.body_md || "";
      const statusMatch = body.match(/상태:\s*(.+)/);
      const periodMatch = body.match(/기간:\s*(.+)/);
      if (statusMatch) lines.push(`- 상태: ${statusMatch[1].trim()}`);
      if (periodMatch) lines.push(`- 기간: ${periodMatch[1].trim()}`);

      // 과제 상세 내용 (메타 라인 제외)
      const contentLines = body
        .split("\n")
        .filter((l) => !l.match(/^(과제|담당|상태|기간|비고):\s*/))
        .join("\n")
        .trim();
      if (contentLines) {
        lines.push("");
        lines.push(contentLines);
      }
      lines.push("");
    }
  }

  // 이벤트/리뷰 과제 (to-do#2)
  if (todo2Docs.length > 0) {
    lines.push("## 이벤트/리뷰 과제 (to-do#2)");
    lines.push("");
    for (const doc of todo2Docs) {
      const taskName = doc.title
        .replace(/^이벤트(&|\/)?리뷰(\(|과제\()?to-do#2\)\s*-\s*/, "")
        .replace(/^이벤트&리뷰\(to-do#2\)\s*-\s*/, "")
        .replace(/^이벤트\/리뷰과제\(to-do#2\)\s*-\s*/, "")
        .trim();
      lines.push(`### ${taskName}`);

      const body = doc.body_md || "";
      const statusMatch = body.match(/상태:\s*(.+)/);
      const periodMatch = body.match(/기간:\s*(.+)/);
      if (statusMatch) lines.push(`- 상태: ${statusMatch[1].trim()}`);
      if (periodMatch) lines.push(`- 기간: ${periodMatch[1].trim()}`);

      const contentLines = body
        .split("\n")
        .filter((l) => !l.match(/^(과제|담당|상태|기간|비고):\s*/))
        .join("\n")
        .trim();
      if (contentLines) {
        lines.push("");
        lines.push(contentLines);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`피드백반 notion → case_study 마이그레이션`);
  console.log(`모드: ${DRY_RUN ? "DRY RUN (DB 변경 없음)" : "실행 (DB 변경)"}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. source_type="notion" 전체 조회
  const notionDocs = await supabaseGet(
    "contents",
    "source_type=eq.notion&select=id,title,body_md,source_ref,created_at&order=created_at.asc&limit=500"
  );
  console.log(`[1] source_type="notion" 조회: ${notionDocs.length}건\n`);

  if (notionDocs.length === 0) {
    console.log("notion 문서가 없습니다. 종료합니다.");
    return;
  }

  // 2. 문서 분류 + 담당자 매핑
  const classified = notionDocs.map((doc) => {
    const type = classifyDoc(doc.title);
    const owner =
      extractOwnerFromTitle(doc.title) ||
      extractOwnerFromBody(doc.body_md) ||
      null;
    const sprintNum =
      extractSprintNumber(doc.title) ||
      dateToSprint(doc.body_md) ||
      null;

    return { ...doc, docType: type, owner, sprintNum };
  });

  // 미매핑 확인
  const unmapped = classified.filter((d) => !d.owner);
  if (unmapped.length > 0) {
    console.log(`[주의] 담당자 미매핑 ${unmapped.length}건:`);
    for (const d of unmapped.slice(0, 10)) {
      console.log(`  - "${d.title}" (type: ${d.docType})`);
    }
    if (unmapped.length > 10) console.log(`  ... 외 ${unmapped.length - 10}건`);
    console.log("");
  }

  const noSprint = classified.filter((d) => d.owner && !d.sprintNum && d.docType !== "molip");
  if (noSprint.length > 0) {
    console.log(`[주의] 스프린트 미매핑 ${noSprint.length}건:`);
    for (const d of noSprint.slice(0, 10)) {
      console.log(`  - "${d.title}" (owner: ${d.owner}, type: ${d.docType})`);
    }
    console.log("");
  }

  // 3. 사람×스프린트 그룹핑
  /** @type {Map<string, { name: string, sprintNum: number, sprint: object|null, todo1: object[], todo2: object[] }>} */
  const groups = new Map();

  for (const doc of classified) {
    if (!doc.owner) continue;

    // 스프린트 미매핑 to-do는 Sprint 1로 기본 배정
    const sNum = doc.sprintNum || 1;
    const key = `${doc.owner}_${sNum}`;

    if (!groups.has(key)) {
      groups.set(key, { name: doc.owner, sprintNum: sNum, sprint: null, todo1: [], todo2: [] });
    }

    const group = groups.get(key);
    if (doc.docType === "sprint") {
      group.sprint = doc;
    } else if (doc.docType === "todo1") {
      group.todo1.push(doc);
    } else if (doc.docType === "todo2") {
      group.todo2.push(doc);
    }
    // molip은 별도 처리하지 않음 (사람별로 깔끔하게 분류 어려움)
  }

  console.log(`[2] 사람×스프린트 그룹: ${groups.size}개\n`);

  // 4. 병합
  const merged = [];
  for (const [key, group] of groups) {
    const bodyMd = buildMergedMarkdown(
      group.name,
      group.sprintNum,
      group.sprint,
      group.todo1,
      group.todo2
    );

    const title = `${group.name} Sprint ${group.sprintNum} — 자사몰 전환율 개선 실전 사례`;
    const sourceRef = `notion-sprint-${group.name}-${group.sprintNum}`;

    merged.push({
      title,
      body_md: bodyMd,
      type: "case_study",
      source_type: "case_study",
      source_ref: sourceRef,
      curation_status: "new",
      status: "draft",
      category: "meta_ads",
      embedding_status: "pending",
      tags: [],
    });

    const taskCount = group.todo1.length + group.todo2.length;
    const hasSprintDoc = group.sprint ? "O" : "X";
    console.log(
      `  ${group.name} Sprint ${group.sprintNum}: 스프린트문서=${hasSprintDoc}, to-do#1=${group.todo1.length}, to-do#2=${group.todo2.length}, 총과제=${taskCount}, body=${bodyMd.length}자`
    );
  }

  console.log(`\n[3] 병합 결과: ${merged.length}건\n`);

  // 5. DRY RUN이면 여기서 종료
  if (DRY_RUN) {
    console.log("--- DRY RUN 상세 ---\n");
    for (const doc of merged) {
      console.log(`제목: ${doc.title}`);
      console.log(`source_ref: ${doc.source_ref}`);
      console.log(`body_md 길이: ${doc.body_md.length}자`);
      console.log(`body_md 미리보기:\n${doc.body_md.slice(0, 500)}\n...\n`);
      console.log("-".repeat(40));
    }
    console.log(`\nDRY RUN 완료. 실행하려면 --dry-run 플래그를 제거하세요.`);
    return;
  }

  // 6. case_study INSERT
  console.log("[4] case_study INSERT 시작...\n");
  let insertOk = 0;
  let insertFail = 0;

  for (const doc of merged) {
    try {
      const result = await supabaseInsert("contents", doc);
      const id = Array.isArray(result) ? result[0].id : result.id;
      console.log(`  INSERT: ${doc.title} → ${id}`);
      insertOk++;
    } catch (e) {
      console.error(`  INSERT 실패: ${doc.title}: ${e.message}`);
      insertFail++;
    }
  }

  console.log(`\n  INSERT 결과: 성공=${insertOk}, 실패=${insertFail}\n`);

  if (insertFail > 0) {
    console.error("INSERT 실패가 있어 기존 데이터 삭제를 건너뜁니다.");
    console.error("실패 원인을 확인 후 수동으로 정리하세요.");
    return;
  }

  // 7. 기존 notion 데이터 삭제 (knowledge_chunks 먼저 → contents)
  console.log("[5] 기존 notion 데이터 삭제...\n");

  // 7-1. notion knowledge_chunks 삭제
  try {
    await supabaseDelete("knowledge_chunks", "source_type=eq.notion");
    console.log("  knowledge_chunks (source_type=notion) 삭제 완료");
  } catch (e) {
    console.error(`  knowledge_chunks 삭제 실패: ${e.message}`);
    console.error("  contents는 삭제하지 않습니다. 수동 정리 필요.");
    return;
  }

  // 7-2. notion contents 삭제
  try {
    await supabaseDelete("contents", "source_type=eq.notion");
    console.log("  contents (source_type=notion) 삭제 완료");
  } catch (e) {
    console.error(`  contents 삭제 실패: ${e.message}`);
  }

  // 8. 결과 요약
  console.log(`\n${"=".repeat(60)}`);
  console.log("마이그레이션 완료");
  console.log(`${"=".repeat(60)}`);
  console.log(`  기존 notion 문서: ${notionDocs.length}건`);
  console.log(`  병합 case_study:  ${merged.length}건`);
  console.log(`  INSERT 성공:      ${insertOk}건`);
  console.log(`  notion 데이터:    삭제 완료`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
