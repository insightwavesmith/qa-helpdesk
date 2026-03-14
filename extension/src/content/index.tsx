import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isEditorPage } from "../lib/editor-detector";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { setupInjectionListener } from "./EditorInjector";
import { setupCafePublishListener } from "./CafePublisher";
import { isCafeEditor } from "../lib/editor-detector";
import "./content.css";

const ROOT_ID = "bscamp-ext-root";

// T2: SmartEditor 글 주입 리스너
let cleanupInjector: (() => void) | null = null;
// T5: 카페 발행 리스너
let cleanupCafe: (() => void) | null = null;

function mount() {
  // 이미 마운트된 경우 중복 방지
  if (document.getElementById(ROOT_ID)) return;

  // 에디터 페이지가 아닌 경우 아무것도 하지 않음
  if (!isEditorPage(window.location.href)) return;

  // 글 주입 리스너 설정
  if (!cleanupInjector) {
    cleanupInjector = setupInjectionListener();
  }
  // 카페 발행 리스너 설정
  if (!cleanupCafe && isCafeEditor(window.location.href)) {
    cleanupCafe = setupCafePublishListener();
  }

  const rootDiv = document.createElement("div");
  rootDiv.id = ROOT_ID;
  document.body.appendChild(rootDiv);

  createRoot(rootDiv).render(
    <StrictMode>
      <DiagnosisPanel />
    </StrictMode>,
  );
}

// DOM 준비 후 마운트
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

// SPA 네비게이션 감지 (네이버 블로그는 pushState 사용)
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    mount();
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });
