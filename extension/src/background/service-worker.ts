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

    default:
      return { success: false, error: "알 수 없는 메시지 타입입니다." };
  }
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
