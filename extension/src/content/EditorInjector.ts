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
 * 본문 영역의 화면 좌표 계산
 * SmartEditor ONE에서 본문 편집 영역의 중심 좌표를 반환
 */
function getBodyAreaCoords(): { x: number; y: number } | null {
  // SmartEditor ONE 본문 영역 후보
  const selectors = [
    ".se-component.se-text",
    ".se-main-container [contenteditable='true']",
    ".se-main-container",
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + Math.min(rect.height / 2, 100)),
        };
      }
    }
  }

  // contenteditable 중 제목이 아닌 것
  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  const titleText = document.querySelector<HTMLElement>(".se-title-text")?.textContent ?? "";

  for (const el of editables) {
    const text = (el.innerText ?? el.textContent ?? "").trim();
    // 제목과 같은 짧은 텍스트면 스킵
    if (text === titleText && text.length < 100) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 50) {
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + Math.min(rect.height / 2, 100)),
      };
    }
  }

  // 최종 fallback: 페이지 중앙 영역 (본문이 보통 있는 위치)
  return { x: Math.round(window.innerWidth / 2), y: 400 };
}

async function injectContent(htmlContent: string): Promise<void> {
  const plainText = htmlToPlainText(htmlContent);
  const coords = getBodyAreaCoords();

  if (!coords) {
    console.error("[bscamp-ext] 본문 영역 좌표를 찾을 수 없습니다.");
    return;
  }

  console.log(`[bscamp-ext] debugger 주입 시도: coords=(${coords.x}, ${coords.y}), text=${plainText.length}자`);

  // 1차: chrome.debugger API (Input.insertText)
  try {
    const response = await chrome.runtime.sendMessage({
      type: "DEBUGGER_INJECT",
      payload: {
        text: plainText,
        x: coords.x,
        y: coords.y,
      },
    });

    if (response?.success) {
      console.log("[bscamp-ext] debugger 주입 성공");
      return;
    }

    console.warn("[bscamp-ext] debugger 주입 실패:", response?.error);
  } catch (err) {
    console.warn("[bscamp-ext] debugger 통신 실패:", err);
  }

  // 2차 fallback: DOM 직접 수정
  console.log("[bscamp-ext] DOM fallback 시도");
  await injectContentFallback(htmlContent);
}

/**
 * DOM 직접 수정 fallback (debugger 사용 불가 시)
 */
async function injectContentFallback(htmlContent: string): Promise<void> {
  // contenteditable 영역 중 가장 큰 것
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
    target = document.querySelector<HTMLElement>(".se-main-container") ?? document.querySelector<HTMLElement>("#post-body");
  }

  if (!target) {
    console.error("[bscamp-ext] 본문 주입 대상을 찾을 수 없습니다.");
    return;
  }

  target.focus();
  target.innerHTML = htmlContent;
  target.dispatchEvent(new Event("input", { bubbles: true }));
}
