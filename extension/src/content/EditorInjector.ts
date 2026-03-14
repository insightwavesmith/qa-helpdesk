/**
 * SmartEditor 글 주입 모듈 (T2)
 *
 * bscamp 큐레이션에서 "블로그 발행" 버튼 클릭 시
 * window.postMessage로 전달된 데이터를 받아 SmartEditor에 주입합니다.
 *
 * 데이터 포맷:
 * { type: 'BSCAMP_INJECT', payload: { title, content, images? } }
 */

export interface InjectPayload {
  title: string;
  content: string;    // HTML 본문
  images?: string[];  // 이미지 URL 배열
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

    // 본문 주입
    if (payload.content) {
      await injectContent(payload.content);
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

async function injectContent(htmlContent: string): Promise<void> {
  // SmartEditor ONE 본문 컨테이너
  const seContainer = document.querySelector<HTMLElement>(".se-main-container");
  if (seContainer) {
    // contenteditable 영역 찾기
    const editableArea = seContainer.querySelector<HTMLElement>("[contenteditable='true']")
      ?? seContainer;

    editableArea.focus();

    // execCommand로 HTML 삽입 (Undo 지원)
    if (document.execCommand) {
      document.execCommand("insertHTML", false, htmlContent);
    } else {
      editableArea.innerHTML = htmlContent;
    }
    editableArea.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // iframe 기반 에디터 (구형 SmartEditor 2)
  const editorIframe = document.querySelector<HTMLIFrameElement>(
    "#mainFrame, iframe[id*='SmartEditor'], .se2_iframe"
  );
  if (editorIframe) {
    try {
      const iframeDoc = editorIframe.contentDocument ?? editorIframe.contentWindow?.document;
      if (iframeDoc) {
        const body = iframeDoc.body;
        body.focus();
        if (iframeDoc.execCommand) {
          iframeDoc.execCommand("insertHTML", false, htmlContent);
        } else {
          body.innerHTML = htmlContent;
        }
        return;
      }
    } catch {
      // cross-origin iframe — chrome.debugger 필요
      console.warn("[bscamp-ext] iframe 접근 불가 — chrome.debugger API가 필요합니다.");
      await injectViaDebugger(editorIframe, htmlContent);
    }
  }
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

    // JavaScript 실행으로 본문 주입
    const escapedHtml = JSON.stringify(htmlContent);
    const expression = `
      (function() {
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
          try {
            var doc = frames[i].contentDocument || frames[i].contentWindow.document;
            if (doc && doc.body) {
              doc.body.innerHTML = ${escapedHtml};
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
