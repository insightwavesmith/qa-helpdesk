/**
 * SmartEditor 글 주입 모듈 (T2)
 *
 * bscamp 큐레이션에서 "블로그 발행" 버튼 클릭 시
 * window.postMessage로 전달된 데이터를 받아 SmartEditor에 주입합니다.
 *
 * 주입 방식: clipboard paste 이벤트 시뮬레이션
 * - SmartEditor ONE은 execCommand("insertHTML")를 무시함
 * - ClipboardEvent + DataTransfer로 붙여넣기를 시뮬레이션하면 에디터가 인식
 *
 * 데이터 포맷:
 * { type: 'BSCAMP_INJECT', payload: { title, content, images? } }
 */

export interface InjectPayload {
  title: string;
  content: string;    // HTML 본문
  images?: string[];  // 이미지 URL 배열
}

/** 이미지 플레이스홀더 패턴 */
const IMAGE_PLACEHOLDER_RE = /\[이미지\]|\[IMAGE\]/gi;

/**
 * 본문 HTML에서 [이미지]/[IMAGE] 텍스트를 플레이스홀더 블록으로 변환
 * 변환 결과와 슬롯 수를 반환
 */
export function processImagePlaceholders(html: string): { html: string; slotCount: number } {
  let index = 0;
  const processed = html.replace(IMAGE_PLACEHOLDER_RE, () => {
    index++;
    return `<div style="text-align:center;padding:18px 0;margin:12px 0;border:2px dashed #ccc;border-radius:8px;color:#888;font-size:14px;background:#fafafa;">━━━ 📷 이미지 삽입 위치 (${index}) ━━━</div>`;
  });
  return { html: processed, slotCount: index };
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
    // 제목 주입
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
 * clipboard paste 이벤트를 시뮬레이션하여 SmartEditor에 HTML 삽입
 * SmartEditor ONE은 paste 이벤트를 통해서만 외부 HTML을 수용함
 */
function pasteHtmlIntoElement(element: HTMLElement, html: string): void {
  element.focus();

  // DataTransfer 객체 생성 후 HTML 데이터 설정
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/html", html);
  dataTransfer.setData("text/plain", html.replace(/<[^>]*>/g, ""));

  // paste 이벤트 시뮬레이션
  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  });

  element.dispatchEvent(pasteEvent);
}

/**
 * SmartEditor ONE 본문 contenteditable 영역 찾기
 *
 * 실제 DOM 구조:
 * - .se-component.se-documentTitle (제목 컴포넌트) 안에 .se-title-text
 * - 본문은 별도의 contenteditable DIV (클래스 없음)
 *
 * 전략: 모든 contenteditable="true" 요소 중
 *   1) .se-title-text 자체 또는 그 부모 내부에 있는 것은 제목 → 제외
 *   2) 나머지가 본문 편집 영역
 */
function findSmartEditorBodyArea(): HTMLElement | null {
  const titleEl = document.querySelector<HTMLElement>(".se-title-text");
  const titleContainer = titleEl?.closest(".se-component, .se-documentTitle");

  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  for (const el of editables) {
    // 제목 영역이면 스킵
    if (titleEl && (el === titleEl || el.contains(titleEl))) continue;
    if (titleContainer && titleContainer.contains(el)) continue;

    // SmartEditor 관련 영역인지 확인 (se- 접두어 클래스가 있거나 documentTitle이 아닌 것)
    // 최소한 에디터 페이지의 contenteditable이면 본문으로 간주
    return el;
  }
  return null;
}

async function injectContent(htmlContent: string): Promise<void> {
  // 1차: SmartEditor ONE 본문 영역 (contenteditable 기반 탐색)
  const bodyArea = findSmartEditorBodyArea();
  if (bodyArea) {
    // 기존 내용 초기화
    bodyArea.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);

    // clipboard paste 시뮬레이션으로 HTML 주입
    pasteHtmlIntoElement(bodyArea, htmlContent);

    // paste 후 에디터가 처리할 시간 확보
    await delay(300);

    // paste가 실패한 경우 fallback
    const textAfterPaste = bodyArea.textContent?.trim() ?? "";
    if (textAfterPaste.length === 0) {
      console.warn("[bscamp-ext] paste 시뮬레이션 실패, innerHTML fallback 시도");
      bodyArea.innerHTML = htmlContent;
      bodyArea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return;
  }

  // 2차: .se-main-container (구버전 SmartEditor ONE 호환)
  const seContainer = document.querySelector<HTMLElement>(".se-main-container");
  if (seContainer) {
    const editableArea = seContainer.querySelector<HTMLElement>("[contenteditable='true']")
      ?? seContainer;

    editableArea.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);

    pasteHtmlIntoElement(editableArea, htmlContent);
    await delay(300);

    if ((editableArea.textContent?.trim() ?? "").length === 0) {
      editableArea.innerHTML = htmlContent;
      editableArea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return;
  }

  // 3차: iframe 기반 에디터 (구형 SmartEditor 2)
  const editorIframe = document.querySelector<HTMLIFrameElement>(
    "#mainFrame, iframe[id*='SmartEditor'], .se2_iframe"
  );
  if (editorIframe) {
    try {
      const iframeDoc = editorIframe.contentDocument ?? editorIframe.contentWindow?.document;
      if (iframeDoc?.body) {
        const body = iframeDoc.body;
        body.focus();
        pasteHtmlIntoElement(body, htmlContent);

        await delay(300);

        if ((body.textContent?.trim() ?? "").length === 0) {
          body.innerHTML = htmlContent;
        }
        return;
      }
    } catch {
      console.warn("[bscamp-ext] iframe 접근 불가 — chrome.debugger API가 필요합니다.");
      await injectViaDebugger(editorIframe, htmlContent);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * chrome.debugger API를 사용한 iframe 본문 주입
 * cross-origin iframe 접근 시 사용
 */
async function injectViaDebugger(
  _iframe: HTMLIFrameElement,
  htmlContent: string
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const tabId = tab.id;

    // 디버거 연결
    await chrome.debugger.attach({ tabId }, "1.3");

    // clipboard paste 시뮬레이션을 iframe 내부에서 실행
    const escapedHtml = JSON.stringify(htmlContent);
    const expression = `
      (function() {
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
          try {
            var doc = frames[i].contentDocument || frames[i].contentWindow.document;
            if (doc && doc.body) {
              doc.body.focus();
              var dt = new DataTransfer();
              dt.setData('text/html', ${escapedHtml});
              var evt = new ClipboardEvent('paste', {
                bubbles: true, cancelable: true, clipboardData: dt
              });
              doc.body.dispatchEvent(evt);
              return true;
            }
          } catch(e) { continue; }
        }
        return false;
      })()
    `;

    await chrome.debugger.sendCommand(
      { tabId },
      "Runtime.evaluate",
      { expression }
    );

    // 디버거 분리
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    console.error("[bscamp-ext] debugger 주입 실패:", err);
  }
}
