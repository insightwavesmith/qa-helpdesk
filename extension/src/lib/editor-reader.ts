export interface EditorContent {
  title: string;
  content: string;
  imageCount: number;
  externalLinks: string[];
}

/**
 * 네이버 SmartEditor 3/ONE의 DOM에서 제목과 본문을 읽어옴
 */
export function getEditorContent(): EditorContent {
  const title = extractTitle();
  const { content, imageCount, externalLinks } = extractBody();

  return { title, content, imageCount, externalLinks };
}

function extractTitle(): string {
  // SmartEditor ONE 제목
  const seTitle = document.querySelector<HTMLElement>(".se-title-text");
  if (seTitle?.textContent) return seTitle.textContent.trim();

  // 블로그 제목 인풋 (구형)
  const titleInput = document.querySelector<HTMLInputElement>(
    "#post-title-inputbox, input[name='title'], textarea[name='title']",
  );
  if (titleInput?.value) return titleInput.value.trim();

  // contenteditable 제목 영역
  const contentEditableTitle = document.querySelector<HTMLElement>(
    "[data-placeholder='제목'], [data-role='title']",
  );
  if (contentEditableTitle?.textContent)
    return contentEditableTitle.textContent.trim();

  return "";
}

/**
 * SmartEditor ONE 본문 영역 찾기
 *
 * 전략: 여러 후보를 수집 → innerText가 가장 긴 것을 본문으로 선택
 * (본문은 항상 제목보다 길다. 제목 17자 vs 본문 800자+)
 *
 * 후보 수집 순서:
 *   1. .se-main-container
 *   2. .se-component.se-text
 *   3. 모든 contenteditable="true" 요소
 *   4. .se-editor, .se-content, #post-body, .se_doc_viewer
 *   5. document.body (최종 fallback)
 */
function findBodyElement(): HTMLElement {
  const titleText = extractTitle();
  const candidates: HTMLElement[] = [];

  // 후보 수집
  const selectors = [
    ".se-main-container",
    ".se-component.se-text",
    ".se-editor",
    ".se-content",
    "#post-body",
    ".se_doc_viewer",
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) candidates.push(el);
  }

  // 모든 contenteditable 요소도 후보에 추가
  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  for (const el of editables) {
    candidates.push(el);
  }

  // innerText가 가장 긴 후보 선택 (제목 텍스트와 동일한 것은 제외)
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const el of candidates) {
    const text = (el.innerText ?? el.textContent ?? "").trim();
    // 제목 텍스트와 완전 일치하면 스킵 (제목 요소일 가능성)
    if (text === titleText && text.length < 100) continue;
    if (text.length > bestLen) {
      bestLen = text.length;
      best = el;
    }
  }

  if (best) {
    console.debug(`[bscamp-ext] findBodyElement: ${bestLen}자, tag=${best.tagName}, class="${best.className}"`);
    return best;
  }

  console.debug("[bscamp-ext] findBodyElement: fallback to document.body");
  return document.body;
}

function extractBody(): {
  content: string;
  imageCount: number;
  externalLinks: string[];
} {
  const bodyEl = findBodyElement();

  // 본문 텍스트 — 제목 텍스트가 포함될 수 있으므로 제거
  let content = bodyEl.innerText?.trim() ?? bodyEl.textContent?.trim() ?? "";
  const title = extractTitle();
  if (title && content.startsWith(title)) {
    content = content.slice(title.length).trim();
  }

  // 이미지 카운트
  const images = bodyEl.querySelectorAll(
    ".se-image, img[data-lazy-src], .se-module-image img, img",
  );
  const imageCount = images.length;

  // 외부 링크 추출 (naver 도메인 제외)
  const anchors = bodyEl.querySelectorAll<HTMLAnchorElement>("a[href]");
  const externalLinks: string[] = [];
  anchors.forEach((a) => {
    const href = a.href;
    if (href && !href.includes("naver.com") && href.startsWith("http")) {
      externalLinks.push(href);
    }
  });

  return { content, imageCount, externalLinks };
}

/**
 * 에디터 변경사항 감지: MutationObserver + 3초 폴링 병행
 * (MutationObserver가 paste/주입을 놓치는 경우 대비)
 */
export function observeEditorChanges(
  callback: (content: EditorContent) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastContentHash = "";

  function emitIfChanged() {
    const data = getEditorContent();
    const hash = `${data.title}|${data.content.length}|${data.imageCount}`;
    if (hash !== lastContentHash) {
      lastContentHash = hash;
      callback(data);
    }
  }

  // MutationObserver — 가능한 넓은 범위 감시
  const targetNode = document.querySelector(".se-editor")
    ?? document.querySelector("#post-body")
    ?? document.body;

  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(emitIfChanged, 1000);
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // 3초 폴링 — MutationObserver가 놓치는 변경 커버
  const pollInterval = setInterval(emitIfChanged, 3000);

  return () => {
    observer.disconnect();
    clearInterval(pollInterval);
    if (debounceTimer !== null) clearTimeout(debounceTimer);
  };
}
