import { isBlogEditor, isCafeEditor } from "../lib/editor-detector";
import type { MessageType, MessageResponse, StoredSession } from "../lib/types";

const STORAGE_KEY = "bscamp_session";

// 메시지 핸들러
chrome.runtime.onMessage.addListener(
  (
    message: MessageType,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    const senderTabId = sender.tab?.id ?? null;
    handleMessage(message, senderTabId)
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
  senderTabId: number | null,
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

    case "DEBUGGER_ATTACH": {
      return await handleDebuggerAttach(senderTabId);
    }

    case "DEBUGGER_CLICK": {
      return await handleDebuggerClick(message.payload);
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

/**
 * DEBUGGER_ATTACH: 늑대플 방식 — sender.tab.id 사용 + 항상 detach→attach
 *
 * 핵심 차이: chrome.tabs.query 대신 sender.tab.id로 정확한 탭 지정
 * 이전 세션 잔존 방지를 위해 항상 detach 후 fresh attach
 */
async function handleDebuggerAttach(senderTabId: number | null): Promise<MessageResponse> {
  try {
    if (!senderTabId) throw new Error("sender.tab.id를 가져올 수 없습니다.");

    // 기존 연결이 있으면 먼저 detach (늑대플: 항상 fresh session)
    if (attachedTabId !== null) {
      try {
        await chrome.debugger.detach({ tabId: attachedTabId });
      } catch {
        // 이미 detach 되었거나 탭이 닫힌 경우 무시
      }
      attachedTabId = null;
    }

    await chrome.debugger.attach({ tabId: senderTabId }, "1.3");
    attachedTabId = senderTabId;
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[bscamp-ext] debugger attach 실패:", error);
    return { success: false, error };
  }
}

/**
 * DEBUGGER_CLICK: 좌표 클릭 (포커스 확보)
 */
async function handleDebuggerClick(
  payload: { x: number; y: number },
): Promise<MessageResponse> {
  try {
    if (attachedTabId === null) throw new Error("디버거가 연결되지 않았습니다. DEBUGGER_ATTACH를 먼저 호출하세요.");
    await debuggerClick(attachedTabId, payload.x, payload.y);
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[bscamp-ext] debugger click 실패:", error);
    return { success: false, error };
  }
}

/**
 * DEBUGGER_INSERT_TEXT: Input.insertText로 텍스트 삽입
 *
 * 늑대플 방식: DEBUGGER_CLICK으로 포커스 확보 후 Input.insertText 호출.
 * 클릭으로 SmartEditor 본문에 포커스가 잡힌 상태에서 insertText를 쓰면
 * 실제 본문 영역에 정상 삽입됨.
 */
async function handleDebuggerInsertText(
  payload: { text: string },
): Promise<MessageResponse> {
  try {
    if (attachedTabId === null) throw new Error("디버거가 연결되지 않았습니다.");
    await chrome.debugger.sendCommand({ tabId: attachedTabId }, "Input.insertText", {
      text: payload.text,
    });
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
    if (attachedTabId === null) throw new Error("디버거가 연결되지 않았습니다.");
    await chrome.debugger.sendCommand({ tabId: attachedTabId }, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand({ tabId: attachedTabId }, "Input.dispatchKeyEvent", {
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
