import { isBlogEditor, isCafeEditor } from "../lib/editor-detector";
import type { MessageType, MessageResponse, StoredSession } from "../lib/types";

const STORAGE_KEY = "bscamp_session";

// 메시지 핸들러
chrome.runtime.onMessage.addListener(
  (
    message: MessageType,
    _sender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error });
      });
    // 비동기 응답을 위해 true 반환
    return true;
  },
);

async function handleMessage(
  message: MessageType,
): Promise<MessageResponse> {
  switch (message.type) {
    case "GET_AUTH": {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const session = result[STORAGE_KEY] as StoredSession | undefined;
      return { success: true, data: session ?? null };
    }

    case "SET_AUTH": {
      await chrome.storage.local.set({ [STORAGE_KEY]: message.payload });
      return { success: true };
    }

    case "LOGOUT": {
      await chrome.storage.local.remove(STORAGE_KEY);
      return { success: true };
    }

    case "CHECK_EDITOR": {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.url) return { success: true, data: { isEditor: false } };

      const isEditor = isBlogEditor(tab.url) || isCafeEditor(tab.url);
      const isBlog = isBlogEditor(tab.url);
      const isCafe = isCafeEditor(tab.url);

      return {
        success: true,
        data: { isEditor, isBlog, isCafe, url: tab.url },
      };
    }

    case "DEBUGGER_INJECT": {
      return await handleDebuggerInject(message.payload);
    }

    default:
      return { success: false, error: "알 수 없는 메시지 타입입니다." };
  }
}

/**
 * chrome.debugger API로 SmartEditor 본문에 텍스트 주입
 * 1) 본문 영역 클릭 (포커스)
 * 2) Ctrl+A (전체 선택)
 * 3) Input.insertText (텍스트 삽입)
 */
async function handleDebuggerInject(
  payload: { title?: string; text: string; x: number; y: number },
): Promise<MessageResponse> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return { success: false, error: "탭을 찾을 수 없습니다." };

  const tabId = tab.id;

  try {
    // 디버거 연결
    await chrome.debugger.attach({ tabId }, "1.3");

    // 1) 본문 영역 클릭 — 포커스 확보
    const { x, y } = payload;
    await debuggerClick(tabId, x, y);
    await sleep(200);

    // 2) Ctrl+A — 기존 내용 전체 선택
    await debuggerKeyCombo(tabId, "a", ["control"]);
    await sleep(100);

    // 3) 선택 영역 삭제 (Backspace)
    await debuggerKey(tabId, "Backspace", "Backspace", 8);
    await sleep(100);

    // 4) Input.insertText — 텍스트 한번에 삽입
    await chrome.debugger.sendCommand(
      { tabId },
      "Input.insertText",
      { text: payload.text },
    );
    await sleep(100);

    // 디버거 분리
    await chrome.debugger.detach({ tabId });

    return { success: true };
  } catch (err: unknown) {
    // 에러 시 디버거 분리 시도
    try { await chrome.debugger.detach({ tabId }); } catch { /* ignore */ }
    const error = err instanceof Error ? err.message : String(err);
    console.error("[bscamp-ext] debugger inject 실패:", error);
    return { success: false, error };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function debuggerClick(tabId: number, x: number, y: number): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1,
  });
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1,
  });
}

async function debuggerKey(
  tabId: number, key: string, code: string, keyCode: number,
): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
}

async function debuggerKeyCombo(
  tabId: number, key: string, modifiers: string[],
): Promise<void> {
  const mod = modifiers.reduce((acc, m) => {
    if (m === "control") return acc | 2;
    if (m === "shift") return acc | 8;
    if (m === "alt") return acc | 1;
    if (m === "meta") return acc | 4;
    return acc;
  }, 0);
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type: "keyDown", key, code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers: mod,
  });
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
    type: "keyUp", key, code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers: mod,
  });
}

// 탭 URL 변경 감지 → 네이버 에디터 페이지 진입 시 아이콘 활성화
chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.url) return;

    const isEditorPage =
      isBlogEditor(tab.url) || isCafeEditor(tab.url);

    if (isEditorPage) {
      chrome.action.setIcon({
        tabId,
        path: {
          16: "assets/icons/icon16.png",
          48: "assets/icons/icon48.png",
          128: "assets/icons/icon128.png",
        },
      });
      chrome.action.setBadgeText({ tabId, text: "ON" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#F75D5D" });
    } else {
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  },
);
