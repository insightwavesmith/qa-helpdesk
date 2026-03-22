#!/usr/bin/env node
/**
 * LP 시선 기반 행동 추론 (3층 합산 모델)
 *
 * eye_tracking JSONB에서 3-layer 행동 패턴을 추론:
 *   Layer 1 (Look): fold_attention > 0.4 → "hero가 시선을 끈다"
 *   Layer 2 (Read): 중간 섹션 weight 합계 > 0.3 → "사용자가 콘텐츠를 읽는다"
 *   Layer 3 (Act):  cta_attention > 0.15 → "CTA가 충분히 눈에 띈다"
 *
 * 결과를 lp_analysis.eye_tracking JSONB의 behavior_inference 키에 저장.
 *
 * Usage:
 *   node scripts/compute-lp-behavior-inference.mjs [--dry-run]
 *
 * 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ── Supabase 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

// ── 3-Layer 행동 추론 ──

/**
 * Layer 1 (Look): hero 영역이 시선을 끄는지
 * fold_attention > 0.4 → true
 */
function evaluateLayer1(et) {
  const foldAttention = et.fold_attention;
  if (foldAttention == null) return { passed: false, value: null, reason: "fold_attention 데이터 없음" };

  const passed = foldAttention > 0.4;
  return {
    passed,
    value: foldAttention,
    reason: passed
      ? `hero 영역 주목도 높음 (${foldAttention})`
      : `hero 영역 주목도 부족 (${foldAttention} ≤ 0.4)`,
  };
}

/**
 * Layer 2 (Read): 사용자가 중간 콘텐츠를 읽는지
 * 중간 섹션(상단, 중단, 하단)의 weight 합계 > 0.3 → true
 */
function evaluateLayer2(et) {
  const sections = et.sections;
  if (!sections || !Array.isArray(sections)) {
    return { passed: false, value: null, reason: "sections 데이터 없음" };
  }

  // hero(0번)와 푸터(마지막)를 제외한 중간 섹션의 weight 합계
  const middleSections = sections.filter(
    (s) => s.section !== "hero" && s.section !== "푸터"
  );
  const middleSum = middleSections.reduce((acc, s) => acc + (s.weight || 0), 0);
  const roundedSum = Math.round(middleSum * 1000) / 1000;

  const passed = roundedSum > 0.3;
  return {
    passed,
    value: roundedSum,
    sections_detail: middleSections.map((s) => ({
      section: s.section,
      weight: s.weight,
    })),
    reason: passed
      ? `중간 콘텐츠 읽기 패턴 감지 (합계=${roundedSum})`
      : `중간 콘텐츠 주목도 부족 (합계=${roundedSum} ≤ 0.3)`,
  };
}

/**
 * Layer 3 (Act): CTA가 충분히 눈에 띄는지
 * cta_attention > 0.15 → true
 */
function evaluateLayer3(et) {
  const ctaAttention = et.cta_attention;
  if (ctaAttention == null) return { passed: false, value: null, reason: "cta_attention 데이터 없음" };

  const passed = ctaAttention > 0.15;
  return {
    passed,
    value: ctaAttention,
    reason: passed
      ? `CTA 주목도 충분 (${ctaAttention})`
      : `CTA 주목도 부족 (${ctaAttention} ≤ 0.15)`,
  };
}

/**
 * 3-Layer 종합 → 행동 패턴 분류
 */
function classifyBehavior(l1, l2, l3) {
  // Look + Read + Act → full_funnel (완전 퍼널 통과)
  if (l1.passed && l2.passed && l3.passed) return "full_funnel";

  // Look + Read, CTA 못 봄 → read_and_leave (읽고 이탈)
  if (l1.passed && l2.passed && !l3.passed) return "read_and_leave";

  // Look만, Read 안 함 → browse_and_bounce (훑고 이탈)
  if (l1.passed && !l2.passed) return "browse_and_bounce";

  // Look 실패, 전체 산만 → confused (혼란)
  if (!l1.passed) return "confused";

  // 기타 예외 케이스
  return "confused";
}

/**
 * 행동 패턴에 대한 한국어 설명
 */
function getBehaviorDescription(pattern) {
  const descriptions = {
    full_funnel: "hero에서 시선 획득 → 콘텐츠 읽기 → CTA 인지까지 완전 퍼널 통과. 전환 가능성 높음.",
    read_and_leave: "hero가 시선을 끌고 콘텐츠도 읽지만 CTA를 인지하지 못함. CTA 강조 필요.",
    browse_and_bounce: "hero에서 시선은 끌지만 이후 콘텐츠를 읽지 않고 이탈. 콘텐츠 구성 개선 필요.",
    confused: "hero 영역부터 시선 분산. 비주얼 계층 구조 전면 재설계 필요.",
  };
  return descriptions[pattern] || "분류 불가";
}

/**
 * 행동 패턴에 대한 개선 제안
 */
function getActionItems(pattern, l1, l2, l3) {
  const actions = [];

  if (!l1.passed) {
    actions.push("hero 영역 비주얼 임팩트 강화 (대비, 크기, 컬러 조정)");
    actions.push("핵심 메시지를 fold 위로 이동");
  }

  if (l1.passed && !l2.passed) {
    actions.push("스크롤 유도 시각 요소 추가 (화살표, 앵커 링크)");
    actions.push("중간 섹션 콘텐츠 밀도 최적화 (텍스트 줄이고 비주얼 추가)");
  }

  if (l2.passed && !l3.passed) {
    actions.push("CTA 버튼 크기/컬러 강화 (대비 높이기)");
    actions.push("sticky CTA 또는 중간 CTA 추가 검토");
    actions.push("CTA 주변 여백 확보 (주의 집중)");
  }

  if (actions.length === 0) {
    actions.push("현재 구조 유지. A/B 테스트로 세부 최적화 진행 권장.");
  }

  return actions;
}

// ── main ──
async function main() {
  console.log(`LP 시선 기반 행동 추론 (3층 모델)${DRY_RUN ? " (dry-run)" : ""}`);
  console.log();

  const PAGE_SIZE = 1000;

  // ── 1. eye_tracking이 NOT NULL인 lp_analysis 조회 ──
  console.log("lp_analysis 조회 중 (eye_tracking 존재하는 LP)...");

  let allAnalysis = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/lp_analysis?select=id,lp_id,viewport,eye_tracking` +
      `&eye_tracking=not.is.null` +
      `&order=lp_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    allAnalysis.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`eye_tracking 존재하는 lp_analysis: ${allAnalysis.length}건`);

  if (allAnalysis.length === 0) {
    console.log("행동 추론 대상 LP가 없습니다.");
    return;
  }

  // ── 2. 각 LP별 3-Layer 행동 추론 ──
  console.log("3-Layer 행동 추론 중...");

  const results = [];
  let skipped = 0;

  for (const row of allAnalysis) {
    const et = row.eye_tracking;
    if (!et) {
      skipped++;
      continue;
    }

    // 이미 behavior_inference가 있으면 스킵 (재계산 원할 시 --force 옵션 추가 가능)
    if (et.behavior_inference && !process.argv.includes("--force")) {
      skipped++;
      continue;
    }

    const layer1 = evaluateLayer1(et);
    const layer2 = evaluateLayer2(et);
    const layer3 = evaluateLayer3(et);

    const pattern = classifyBehavior(layer1, layer2, layer3);
    const description = getBehaviorDescription(pattern);
    const actionItems = getActionItems(pattern, layer1, layer2, layer3);

    // 퍼널 통과율: 3개 layer 중 몇 개 passed
    const funnelPassRate = [layer1.passed, layer2.passed, layer3.passed].filter(Boolean).length;

    const behaviorInference = {
      pattern,
      description,
      funnel_pass_rate: `${funnelPassRate}/3`,
      layers: {
        look: { ...layer1, threshold: 0.4 },
        read: { ...layer2, threshold: 0.3 },
        act: { ...layer3, threshold: 0.15 },
      },
      action_items: actionItems,
      computed_at: new Date().toISOString(),
    };

    results.push({ row, behaviorInference });
  }

  console.log(`행동 추론 완료: ${results.length}건 (스킵: ${skipped}건)`);

  // ── 3. 패턴별 분포 출력 ──
  const distribution = {};
  for (const r of results) {
    const p = r.behaviorInference.pattern;
    distribution[p] = (distribution[p] || 0) + 1;
  }
  console.log();
  console.log("━━━ 행동 패턴 분포 ━━━");
  for (const [pattern, count] of Object.entries(distribution)) {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${pattern}: ${count}건 (${pct}%)`);
  }

  // ── 4. DB 저장 ──
  console.log();
  console.log(`lp_analysis.eye_tracking.behavior_inference ${DRY_RUN ? "저장 (dry-run)" : "저장"} 중...`);

  let savedCount = 0;
  let errors = 0;

  for (const { row, behaviorInference } of results) {
    if (DRY_RUN) {
      savedCount++;
      continue;
    }

    // 기존 eye_tracking에 behavior_inference 키 추가 (머지)
    const existingET = row.eye_tracking || {};
    const updatedET = {
      ...existingET,
      behavior_inference: behaviorInference,
    };

    const opResult = await sbPatch(
      "lp_analysis",
      `id=eq.${row.id}`,
      { eye_tracking: updatedET }
    );

    if (opResult.ok) {
      savedCount++;
    } else {
      console.error(`  X DB 저장 실패 (lp_id=${row.lp_id}): ${opResult.body}`);
      errors++;
    }
  }

  // ── 결과 출력 ──
  console.log();
  console.log("━━━ LP 행동 추론 결과 ━━━");
  console.log(`대상: ${allAnalysis.length}건`);
  console.log(`추론 완료: ${results.length}건`);
  console.log(`스킵: ${skipped}건`);
  if (DRY_RUN) {
    console.log(`저장: (dry-run — 실제 저장 안 함, 대상: ${savedCount}건)`);
  } else {
    console.log(`저장: ${savedCount}건`);
    if (errors > 0) console.log(`실패: ${errors}건`);
  }

  // 패턴별 샘플 출력
  if (results.length > 0) {
    console.log();
    for (const pattern of ["full_funnel", "read_and_leave", "browse_and_bounce", "confused"]) {
      const sample = results.find((r) => r.behaviorInference.pattern === pattern);
      if (sample) {
        const bi = sample.behaviorInference;
        console.log(`[${pattern}] lp_id=${sample.row.lp_id.slice(0, 8)}... — ${bi.description}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
