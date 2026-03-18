/**
 * SmartEditor ONE DOM 구조 분석 스크립트
 *
 * 실행 방법:
 * 1단계: 네이버 로그인 쿠키 저장 (최초 1회)
 *   npx playwright test e2e/smarteditor-dom-analysis.ts --project=chromium --headed -g "로그인"
 *   → 브라우저에서 수동 로그인 후 30초 대기 → 쿠키 자동 저장
 *
 * 2단계: DOM 분석 실행
 *   npx playwright test e2e/smarteditor-dom-analysis.ts --project=chromium --headed -g "분석"
 */
import { test } from "@playwright/test";
import { writeFileSync } from "fs";

const NAVER_AUTH_FILE = "/tmp/naver-auth.json";
const OUTPUT_FILE = "/tmp/smarteditor-dom-analysis.txt";
const BLOG_EDITOR_URL = "https://blog.naver.com/1bpluschool/postwrite";

// 1단계: 네이버 로그인 쿠키 저장
test("naver-login", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://nid.naver.com/nidlogin.login");
  console.log("🔐 브라우저에서 네이버 로그인해주세요. 90초 대기합니다...");

  // 로그인 완료 대기 (메인 페이지로 이동하면 완료)
  await page.waitForURL("**/naver.com/**", { timeout: 90_000 }).catch(() => {
    console.log("⏳ URL 변경 감지 안 됨, 추가 대기...");
  });
  await page.waitForTimeout(5000);

  await context.storageState({ path: NAVER_AUTH_FILE });
  console.log(`✅ 쿠키 저장 완료: ${NAVER_AUTH_FILE}`);
  await context.close();
});

// 2단계: DOM 분석 (naver-login 먼저 실행 필요)
test("smarteditor-dom-analysis", async ({ browser }) => {
  test.setTimeout(120_000);

  // 저장된 쿠키로 컨텍스트 생성
  let context;
  try {
    context = await browser.newContext({ storageState: NAVER_AUTH_FILE });
  } catch {
    console.error("❌ 쿠키 없음. 먼저 실행: npx playwright test smarteditor -g naver-login --headed --workers=1");
    return;
  }

  const page = await context.newPage();

  // 에디터 페이지로 이동
  console.log("📝 에디터 페이지로 이동 중...");
  await page.goto(BLOG_EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  console.log("  현재 URL:", page.url());

  // 로그인 리다이렉트 시 → 수동 로그인 대기
  if (page.url().includes("nidlogin") || page.url().includes("login")) {
    console.log("🔐 로그인 필요. 브라우저에서 로그인해주세요...");
    await page.waitForURL((url) => url.toString().includes("blog.naver.com"), { timeout: 90_000 });
    // 에디터 URL이 아니면 다시 이동
    if (!page.url().includes("postwrite")) {
      await page.goto(BLOG_EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
  }

  // SmartEditor 로드 대기
  console.log("⏳ SmartEditor 로드 대기 중...");
  console.log("  현재 URL:", page.url());
  await page.waitForSelector("[class*='se-'], [contenteditable]", { timeout: 30000 }).catch(() => {
    console.log("⚠ se- 요소를 찾지 못했습니다. 현재 DOM으로 분석합니다.");
  });
  await page.waitForTimeout(5000);
  console.log("  최종 URL:", page.url());

  const result = await page.evaluate(() => {
    const output: string[] = [];

    // SVGAnimatedString 안전 처리
    function getClassName(el: Element): string {
      return typeof el.className === "string" ? el.className : (el.getAttribute("class") ?? "");
    }

    output.push("=" .repeat(80));
    output.push("SmartEditor ONE DOM 구조 분석");
    output.push("=" .repeat(80));
    output.push(`URL: ${window.location.href}`);
    output.push(`시간: ${new Date().toISOString()}`);
    output.push("");

    // 1) 모든 iframe 나열
    output.push("─".repeat(60));
    output.push("1. 모든 iframe");
    output.push("─".repeat(60));
    const iframes = document.querySelectorAll("iframe");
    if (iframes.length === 0) {
      output.push("  (iframe 없음)");
    }
    iframes.forEach((iframe, i) => {
      output.push(`  [${i}] id="${iframe.id}" name="${iframe.name}" src="${iframe.src?.slice(0, 120)}"`);
      output.push(`      class="${getClassName(iframe)}" width=${iframe.width} height=${iframe.height}`);
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const editables = doc.querySelectorAll("[contenteditable]");
          output.push(`      내부 contenteditable: ${editables.length}개`);
          editables.forEach((el, j) => {
            const htmlEl = el as HTMLElement;
            output.push(`        [${j}] <${htmlEl.tagName.toLowerCase()}> class="${getClassName(htmlEl)}" contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
          });
        }
      } catch {
        output.push("      (cross-origin 접근 불가)");
      }
    });
    output.push("");

    // 2) 모든 contenteditable 나열
    output.push("─".repeat(60));
    output.push("2. 모든 contenteditable 요소");
    output.push("─".repeat(60));
    const editables = document.querySelectorAll("[contenteditable]");
    editables.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      const text = (htmlEl.innerText ?? "").trim();
      const parents: string[] = [];
      let p: HTMLElement | null = htmlEl.parentElement;
      for (let depth = 0; depth < 3 && p; depth++) {
        parents.push(`<${p.tagName.toLowerCase()} class="${p.className}">`);
        p = p.parentElement;
      }
      output.push(`  [${i}] <${htmlEl.tagName.toLowerCase()}>`);
      output.push(`      id="${htmlEl.id}" class="${getClassName(htmlEl)}"`);
      output.push(`      contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
      output.push(`      text="${text.slice(0, 80)}${text.length > 80 ? "..." : ""}" (${text.length}자)`);
      output.push(`      rect: ${JSON.stringify(htmlEl.getBoundingClientRect())}`);
      output.push(`      부모: ${parents.join(" > ")}`);
    });
    output.push("");

    // 3) .se-main-container 내부 DOM 트리
    output.push("─".repeat(60));
    output.push("3. .se-main-container 내부 (깊이 3)");
    output.push("─".repeat(60));
    const seMain = document.querySelector(".se-main-container");
    if (seMain) {
      function dumpTree(el: Element, depth: number, maxDepth: number): void {
        if (depth > maxDepth) return;
        const indent = "  ".repeat(depth + 1);
        const htmlEl = el as HTMLElement;
        const attrs: string[] = [];
        if (htmlEl.id) attrs.push(`id="${htmlEl.id}"`);
        if (getClassName(htmlEl)) attrs.push(`class="${getClassName(htmlEl)}"`);
        if (htmlEl.getAttribute("contenteditable")) attrs.push(`contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
        const text = (htmlEl.innerText ?? "").trim();
        const textPreview = text.length > 0 ? ` text="${text.slice(0, 40)}${text.length > 40 ? "..." : ""}" (${text.length}자)` : "";
        output.push(`${indent}<${htmlEl.tagName.toLowerCase()} ${attrs.join(" ")}>${textPreview}`);
        for (const child of el.children) {
          dumpTree(child, depth + 1, maxDepth);
        }
      }
      dumpTree(seMain, 0, 3);
    } else {
      output.push("  (.se-main-container 없음)");
    }
    output.push("");

    // 4) .se-component.se-text 내부 구조
    output.push("─".repeat(60));
    output.push("4. .se-component.se-text 내부 (전체)");
    output.push("─".repeat(60));
    const seText = document.querySelector(".se-component.se-text");
    if (seText) {
      function dumpFull(el: Element, depth: number): void {
        const indent = "  ".repeat(depth + 1);
        const htmlEl = el as HTMLElement;
        const attrs: string[] = [];
        if (htmlEl.id) attrs.push(`id="${htmlEl.id}"`);
        if (getClassName(htmlEl)) attrs.push(`class="${getClassName(htmlEl)}"`);
        if (htmlEl.getAttribute("contenteditable")) attrs.push(`contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
        if (htmlEl.getAttribute("data-placeholder")) attrs.push(`data-placeholder="${htmlEl.getAttribute("data-placeholder")}"`);
        const rect = htmlEl.getBoundingClientRect();
        const rectStr = `(${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)})`;
        output.push(`${indent}<${htmlEl.tagName.toLowerCase()} ${attrs.join(" ")}> ${rectStr}`);
        for (const child of el.children) {
          dumpFull(child, depth + 1);
        }
      }
      dumpFull(seText, 0);
    } else {
      output.push("  (.se-component.se-text 없음)");
    }
    output.push("");

    // 5) 추가: .se-documentTitle 내부 구조
    output.push("─".repeat(60));
    output.push("5. .se-documentTitle 내부 (전체)");
    output.push("─".repeat(60));
    const seTitle = document.querySelector(".se-documentTitle");
    if (seTitle) {
      function dumpTitle(el: Element, depth: number): void {
        const indent = "  ".repeat(depth + 1);
        const htmlEl = el as HTMLElement;
        const attrs: string[] = [];
        if (htmlEl.id) attrs.push(`id="${htmlEl.id}"`);
        if (getClassName(htmlEl)) attrs.push(`class="${getClassName(htmlEl)}"`);
        if (htmlEl.getAttribute("contenteditable")) attrs.push(`contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
        if (htmlEl.getAttribute("data-placeholder")) attrs.push(`data-placeholder="${htmlEl.getAttribute("data-placeholder")}"`);
        const text = (htmlEl.innerText ?? "").trim();
        const textPreview = text.length > 0 ? ` "${text.slice(0, 50)}"` : "";
        output.push(`${indent}<${htmlEl.tagName.toLowerCase()} ${attrs.join(" ")}>${textPreview}`);
        for (const child of el.children) {
          dumpTitle(child, depth + 1);
        }
      }
      dumpTitle(seTitle, 0);
    } else {
      output.push("  (.se-documentTitle 없음)");
    }
    output.push("");

    // 6) 전체 에디터 영역 최상위 구조
    output.push("─".repeat(60));
    output.push("6. 에디터 최상위 구조 (.se-editor 또는 #se_components_wrapper)");
    output.push("─".repeat(60));
    const editorRoot = document.querySelector(".se-editor, #se_components_wrapper, .se-layout-container");
    if (editorRoot) {
      function dumpRoot(el: Element, depth: number, maxDepth: number): void {
        if (depth > maxDepth) return;
        const indent = "  ".repeat(depth + 1);
        const htmlEl = el as HTMLElement;
        const attrs: string[] = [];
        if (htmlEl.id) attrs.push(`id="${htmlEl.id}"`);
        if (getClassName(htmlEl)) attrs.push(`class="${getClassName(htmlEl)}"`);
        if (htmlEl.getAttribute("contenteditable")) attrs.push(`contenteditable="${htmlEl.getAttribute("contenteditable")}"`);
        const rect = htmlEl.getBoundingClientRect();
        const rectStr = `(${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)})`;
        output.push(`${indent}<${htmlEl.tagName.toLowerCase()} ${attrs.join(" ")}> ${rectStr}`);
        for (const child of el.children) {
          dumpRoot(child, depth + 1, maxDepth);
        }
      }
      dumpRoot(editorRoot, 0, 4);
    } else {
      output.push("  (에디터 루트 없음)");
    }
    output.push("");

    // 7) se- 접두어 클래스를 가진 모든 요소 요약
    output.push("─".repeat(60));
    output.push("7. se- 클래스 요소 요약 (고유 클래스)");
    output.push("─".repeat(60));
    const allEls = document.querySelectorAll("[class*='se-']");
    const classSet = new Set<string>();
    allEls.forEach((el) => {
      const cn = typeof el.className === "string" ? el.className : (el.getAttribute("class") ?? "");
      cn.split(/\s+/).filter((c: string) => c.startsWith("se-")).forEach((c: string) => classSet.add(c));
    });
    const sorted = [...classSet].sort();
    output.push(`  총 ${sorted.length}개: ${sorted.join(", ")}`);
    output.push("");

    output.push("=" .repeat(80));
    output.push("분석 완료");
    output.push("=" .repeat(80));

    return output.join("\n");
  });

  writeFileSync(OUTPUT_FILE, result, "utf-8");
  console.log(`\n✅ 분석 결과 저장: ${OUTPUT_FILE}`);
  console.log(result);

  await context.close();
});
