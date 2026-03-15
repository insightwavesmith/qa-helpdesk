/**
 * SmartEditor 글 주입 모듈
 *
 * 주입 방식: chrome.debugger API (Input.insertText)
 * - SmartEditor ONE은 DOM 직접 수정, execCommand, ClipboardEvent를 모두 무시
 * - chrome.debugger로 CDP Input.insertText를 사용하면 실제 키보드 입력과 동일하게 동작
 * - service-worker.ts의 DEBUGGER_INJECT 핸들러와 연동
 *
 * 데이터 포맷:
 * { type: 'BSCAMP_INJECT', payload: { title, content, images? } }
 */

export interface InjectPayload {
  title: string;
  content: string;    // HTML 본문
  images?: string[];  // 이미지 URL 배열
}

/** 이미지 플레이스홀더 패턴: [이미지], [IMAGE], [이미지: 설명텍스트] */
const IMAGE_PLACEHOLDER_RE = /\[이미지(?::?\s*([^\]]*))?\]|\[IMAGE(?::?\s*([^\]]*))?\]/gi;

/**
 * 본문 HTML에서 이미지 플레이스홀더를 시각적 블록으로 변환
 * [이미지], [IMAGE], [이미지: 설명텍스트], [IMAGE: description] 지원
 */
export function processImagePlaceholders(html: string): { html: string; slotCount: number } {
  let index = 0;
  const processed = html.replace(IMAGE_PLACEHOLDER_RE, (_match, descKo?: string, descEn?: string) => {
    index++;
    const desc = (descKo ?? descEn ?? "").trim();
    const label = desc
      ? `📷 이미지 ${index}: ${desc}`
      : `📷 이미지 삽입 위치 (${index})`;
    return `<div style="background:#f0f4f8;border:2px dashed #94a3b8;border-radius:8px;padding:16px;text-align:center;margin:16px 0;color:#64748b;font-size:14px;">${label}</div>`;
  });
  return { html: processed, slotCount: index };
}

/**
 * HTML을 플레인텍스트로 변환 (줄바꿈 보존)
 */
function htmlToPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  // <br>, <p>, <div> 를 줄바꿈으로 변환
  const blocks = div.querySelectorAll("p, div, br, h1, h2, h3, h4, h5, h6, li");
  blocks.forEach((el) => {
    if (el.tagName === "BR") {
      el.replaceWith("\n");
    } else {
      el.insertAdjacentText("afterend", "\n");
    }
  });

  return (div.textContent ?? "")
    .replace(/\n{3,}/g, "\n\n")  // 3+ 연속 줄바꿈 → 2개로
    .trim();
}

/**
 * 메시지 수신 리스너 설정
 */
export function setupInjectionListener(): () => void {
  function handleMessage(event: MessageEvent) {
    if (event.source !== window) return;
    if (event.data?.type !== "BSCAMP_INJECT") return;

    const payload = event.data.payload as InjectPayload;
    if (!payload?.title && !payload?.content) return;

    injectToSmartEditor(payload);
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

// ─── 유틸리티 ────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * [5순위] sendMessage 타임아웃 래퍼 (늑대플 Le 함수 동등)
 * CDP 명령 hang 방지: 기본 5초 타임아웃
 */
function sendCDP<T = unknown>(message: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
  return Promise.race([
    chrome.runtime.sendMessage(message) as Promise<T>,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`CDP timeout: ${String(message.type)}`)), timeoutMs),
    ),
  ]);
}

/**
 * [1순위] iframe 오프셋 보정 (늑대플 $t 함수 동등)
 *
 * content script가 iframe 안에서 실행될 때, getBoundingClientRect()는
 * iframe viewport 기준 좌표를 반환하지만 CDP는 메인 프레임 기준 좌표를 기대.
 * iframe의 위치만큼 보정해야 클릭이 정확한 위치에 도달함.
 */
function getIframeOffset(): { x: number; y: number } {
  try {
    if (window.frameElement) {
      const rect = (window.frameElement as HTMLElement).getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    }
  } catch {
    // cross-origin iframe 등에서 frameElement 접근 불가 시 무시
  }
  return { x: 0, y: 0 };
}

/**
 * SmartEditor에 제목 + 본문 주입
 */
async function injectToSmartEditor(payload: InjectPayload): Promise<void> {
  try {
    // 제목 주입 (DOM 직접 수정 — 제목은 잘 동작)
    if (payload.title) {
      injectTitle(payload.title);
    }

    // 본문 주입 (이미지 플레이스홀더 처리 포함)
    if (payload.content) {
      const { html, slotCount } = processImagePlaceholders(payload.content);
      await injectContent(html);

      // 이미지 슬롯 정보를 DiagnosisPanel에 전달
      if (slotCount > 0) {
        window.postMessage(
          { type: "BSCAMP_IMAGE_SLOTS", slotCount },
          "*"
        );
      }
    }
  } catch (err) {
    console.error("[bscamp-ext] 글 주입 실패:", err);
  }
}

function injectTitle(title: string): void {
  // SmartEditor ONE 제목
  const seTitle = document.querySelector<HTMLElement>(".se-title-text");
  if (seTitle) {
    seTitle.focus();
    seTitle.textContent = title;
    seTitle.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // 구형 에디터 제목 입력
  const titleInput = document.querySelector<HTMLInputElement>(
    "#post-title-inputbox, input[name='title'], textarea[name='title']"
  );
  if (titleInput) {
    titleInput.focus();
    titleInput.value = title;
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    titleInput.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // contenteditable 제목
  const editableTitle = document.querySelector<HTMLElement>(
    "[data-placeholder='제목'], [data-role='title']"
  );
  if (editableTitle) {
    editableTitle.focus();
    editableTitle.textContent = title;
    editableTitle.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * 본문 영역의 화면 좌표 계산 (iframe 오프셋 포함)
 *
 * SmartEditor ONE 구조:
 *   .se-component.se-text > .se-text-paragraph (p 태그)
 * 이 p 태그를 클릭해야 SmartEditor가 포커스를 잡고 React state와 동기화됨
 */
function getBodyAreaCoords(): { x: number; y: number; element: HTMLElement } | null {
  const offset = getIframeOffset();

  // 1차: .se-component.se-text 안의 p.se-text-paragraph (본문 영역)
  const textComponent = document.querySelector<HTMLElement>(".se-component.se-text");
  if (textComponent) {
    const paragraph = textComponent.querySelector<HTMLElement>("p.se-text-paragraph");
    if (paragraph) {
      const rect = paragraph.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const coords = {
          x: Math.round(rect.left + rect.width / 2 + offset.x),
          y: Math.round(rect.top + rect.height / 2 + offset.y),
          element: paragraph,
        };
        console.log(`[bscamp-ext] getBodyAreaCoords: .se-text > p.se-text-paragraph (${coords.x}, ${coords.y}), iframe offset=(${offset.x}, ${offset.y})`);
        return coords;
      }
    }
  }

  // 1-2차: 전체 p.se-text-paragraph 중 두 번째 (첫 번째가 제목인 경우)
  const paragraphs = document.querySelectorAll<HTMLElement>("p.se-text-paragraph");
  const bodyParagraph = paragraphs.length > 1 ? paragraphs[1] : paragraphs[0];
  if (bodyParagraph) {
    const rect = bodyParagraph.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.left >= 0) {
      const coords = {
        x: Math.round(rect.left + rect.width / 2 + offset.x),
        y: Math.round(rect.top + rect.height / 2 + offset.y),
        element: bodyParagraph,
      };
      console.log(`[bscamp-ext] getBodyAreaCoords: p.se-text-paragraph[${paragraphs.length > 1 ? 1 : 0}] (${coords.x}, ${coords.y})`);
      return coords;
    }
  }

  // 2차: .se-component.se-text 내부의 아무 요소
  const seText = document.querySelector<HTMLElement>(".se-component.se-text");
  if (seText) {
    const rect = seText.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const coords = {
        x: Math.round(rect.left + rect.width / 2 + offset.x),
        y: Math.round(rect.top + rect.height / 2 + offset.y),
        element: seText,
      };
      console.log(`[bscamp-ext] getBodyAreaCoords: .se-component.se-text (${coords.x}, ${coords.y})`);
      return coords;
    }
  }

  // 3차: contenteditable 중 면적이 가장 큰 것 (제목 제외)
  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of editables) {
    if (el.closest(".se-documentTitle")) continue;
    if (el.classList.contains("se-title-text")) continue;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  if (best) {
    const rect = best.getBoundingClientRect();
    const coords = {
      x: Math.round(rect.left + rect.width / 2 + offset.x),
      y: Math.round(rect.top + rect.height / 2 + offset.y),
      element: best,
    };
    console.log(`[bscamp-ext] getBodyAreaCoords: contenteditable (${coords.x}, ${coords.y})`);
    return coords;
  }

  return null;
}

/**
 * [4순위] 서로게이트 페어(이모지) 처리 포함 줄별 텍스트 입력 (늑대플 Aa 함수 동등)
 *
 * - 서로게이트 페어가 포함된 줄: 한 글자씩 분리하여 전송 (5ms 간격)
 * - 일반 텍스트 줄: 줄 전체를 한번에 전송
 */
async function insertTextByLines(lines: string[]): Promise<void> {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 서로게이트 페어(이모지) 포함 여부 체크
    const hasSurrogate = /[\uD800-\uDFFF]/.test(line);
    const chunks = hasSurrogate ? [...line] : [line];

    for (const chunk of chunks) {
      await sendCDP({
        type: "DEBUGGER_INSERT_TEXT",
        payload: { text: chunk },
      });
      if (chunks.length > 1) await delay(5);
    }
    await delay(100);

    // 마지막 줄이 아니면 Enter
    if (i < lines.length - 1) {
      await sendCDP({ type: "DEBUGGER_ENTER" });
      await delay(100);

      // 문장 끝이면 Enter 한번 더 (문단 구분)
      if (/[.!?。]$/.test(line.trimEnd())) {
        await sendCDP({ type: "DEBUGGER_ENTER" });
        await delay(100);
      }
    }
  }
}

/**
 * chrome.debugger 기반 줄별 텍스트 주입 (늑대플 방식 완전 포팅)
 *
 * 늑대플 분석 기반 수정 5건 적용:
 * 1) iframe 오프셋 보정 ($t → getIframeOffset)
 * 2) scrollIntoView + Escape 선행
 * 3) detach를 senderTabId로 (service-worker.ts에서 처리)
 * 4) 서로게이트 페어 처리 (Aa → insertTextByLines)
 * 5) sendMessage 타임아웃 래퍼 (Le → sendCDP)
 */
async function injectContent(htmlContent: string): Promise<void> {
  const plainText = htmlToPlainText(htmlContent);
  const target = getBodyAreaCoords();

  if (!target) {
    console.error("[bscamp-ext] 본문 영역 좌표를 찾을 수 없습니다.");
    return;
  }

  const lines = plainText.split("\n").filter((l) => l.trim().length > 0);
  console.log(`[bscamp-ext] debugger 주입 시도: coords=(${target.x}, ${target.y}), ${lines.length}줄, ${plainText.length}자`);

  try {
    // 1. attach
    const attachRes = await sendCDP<{ success: boolean; error?: string }>({ type: "DEBUGGER_ATTACH" });
    if (!attachRes?.success) {
      throw new Error(attachRes?.error ?? "attach 실패");
    }
    await delay(200);

    // 2. [2순위] Escape로 UI 초기화 (팝업/선택 해제 — 늑대플 패턴)
    await sendCDP({ type: "DEBUGGER_ESCAPE" });
    await delay(200);

    // 3. [2순위] scrollIntoView로 요소를 뷰포트에 노출 (늑대플 패턴)
    target.element.scrollIntoView({ behavior: "instant", block: "center" });
    await delay(300);

    // 4. 좌표 재계산 (스크롤 후 위치가 바뀌었을 수 있음)
    const freshTarget = getBodyAreaCoords();
    const clickX = freshTarget?.x ?? target.x;
    const clickY = freshTarget?.y ?? target.y;

    // 5. 본문 클릭 (포커스)
    const clickRes = await sendCDP<{ success: boolean; error?: string }>({
      type: "DEBUGGER_CLICK",
      payload: { x: clickX, y: clickY },
    });
    if (!clickRes?.success) {
      throw new Error(clickRes?.error ?? "클릭 실패");
    }
    await delay(300);

    // 6. 줄별 입력 (서로게이트 페어 처리 포함)
    await insertTextByLines(lines);

    // 7. detach
    await delay(500);
    await sendCDP({ type: "DEBUGGER_DETACH" }, 3000);
    console.log("[bscamp-ext] debugger 주입 성공");
    return;
  } catch (err) {
    console.warn("[bscamp-ext] debugger 주입 실패, DOM fallback:", err);
    try { await sendCDP({ type: "DEBUGGER_DETACH" }, 3000); } catch { /* ignore */ }
  }

  // 2차 fallback: DOM 직접 수정
  await injectContentFallback(htmlContent);
}

/**
 * DOM 직접 수정 fallback (debugger 사용 불가 시)
 */
async function injectContentFallback(htmlContent: string): Promise<void> {
  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  let target: HTMLElement | null = null;
  let maxArea = 0;

  for (const el of editables) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      target = el;
    }
  }

  if (!target) {
    target = document.querySelector<HTMLElement>(".se-main-container")
      ?? document.querySelector<HTMLElement>("#post-body");
  }

  if (!target) {
    console.error("[bscamp-ext] 본문 주입 대상을 찾을 수 없습니다.");
    return;
  }

  target.focus();
  target.innerHTML = htmlContent;
  target.dispatchEvent(new Event("input", { bubbles: true }));
}
