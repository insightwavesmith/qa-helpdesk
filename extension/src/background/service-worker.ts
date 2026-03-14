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

    case "DEBUGGER_INSERT_TEXT": {
      return await handleDebuggerInsertText(message.payload);
    }

    case "DEBUGGER_ENTER": {
      return await handleDebuggerEnter();
    }

    case "DEBUGGER_DETACH": {
      return await handleDebuggerDetach();
    }

    default:
      return { success: false, error: "알 수 없는 메시지 타입입니다." };
  }
}

/** 현재 디버거가 연결된 tabId (세션 유지) */
let attachedTabId: number | null = null;

async function ensureDebuggerAttached(): Promise<number> {
  if (attachedTabId !== null) return attachedTabId;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) throw new Error("탭을 찾을 수 없습니다.");

  await chrome.debugger.attach({ tabId: tab.id }, "1.3");
  attachedTabId = tab.id;
  return tab.id;
}

/**
 * DEBUGGER_INJECT: 본문 영역 클릭만 (포커스 확보)
 * 텍스트 입력은 content script가 줄별로 INSERT_TEXT/ENTER 호출
 */
async function handleDebuggerInject(
  payload: { x: number; y: number },
): Promise<MessageResponse> {
  try {
    const tabId = await ensureDebuggerAttached();
    await debuggerClick(tabId, payload.x, payload.y);
    await sleep(200);
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[bscamp-ext] debugger inject 실패:", error);
    return { success: false, error };
  }
}

/**
 * DEBUGGER_INSERT_TEXT: 한 줄 텍스트 삽입
 */
async function handleDebuggerInsertText(
  payload: { text: string },
): Promise<MessageResponse> {
  try {
    const tabId = await ensureDebuggerAttached();
    await chrome.debugger.sendCommand(
      { tabId },
      "Input.insertText",
      { text: payload.text },
    );
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * DEBUGGER_ENTER: Enter 키 입력 (줄바꿈)
 */
async function handleDebuggerEnter(): Promise<MessageResponse> {
  try {
    const tabId = await ensureDebuggerAttached();
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * DEBUGGER_DETACH: 디버거 분리
 */
async function handleDebuggerDetach(): Promise<MessageResponse> {
  try {
    if (attachedTabId !== null) {
      await chrome.debugger.detach({ tabId: attachedTabId });
      attachedTabId = null;
    }
    return { success: true };
  } catch (err: unknown) {
    attachedTabId = null;
    const error = err instanceof Error ? err.message : String(err);
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
