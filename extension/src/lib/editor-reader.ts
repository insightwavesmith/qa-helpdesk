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
 * fallback 순서: .se-main-container → .se-component.se-text → contenteditable DIV (제목 제외)
 */
function findBodyElement(): HTMLElement | null {
  // 1차: .se-main-container (구버전 호환)
  const seMain = document.querySelector<HTMLElement>(".se-main-container");
  if (seMain) return seMain;

  // 2차: .se-component.se-text (SmartEditor ONE 텍스트 컴포넌트)
  const seText = document.querySelector<HTMLElement>(".se-component.se-text");
  if (seText) return seText;

  // 3차: contenteditable DIV 중 제목이 아닌 것
  const titleEl = document.querySelector<HTMLElement>(".se-title-text");
  const titleContainer = titleEl?.closest(".se-component, .se-documentTitle");
  const editables = document.querySelectorAll<HTMLElement>("[contenteditable='true']");
  for (const el of editables) {
    if (titleEl && (el === titleEl || el.contains(titleEl))) continue;
    if (titleContainer && titleContainer.contains(el)) continue;
    return el;
  }

  // 4차: 구형 에디터
  return document.querySelector<HTMLElement>("#post-body, .se_doc_viewer");
}

function extractBody(): {
  content: string;
  imageCount: number;
  externalLinks: string[];
} {
  const bodyEl = findBodyElement();

  const content = bodyEl?.innerText?.trim() ?? bodyEl?.textContent?.trim() ?? "";

  // 이미지 카운트 — bodyEl 내부 우선, 없으면 전체 에디터 영역
  const imgScope = bodyEl ?? document;
  const images = imgScope.querySelectorAll(
    ".se-image, img[data-lazy-src], .se-module-image img, img",
  );
  const imageCount = images.length;

  // 외부 링크 추출 (naver 도메인 제외)
  const anchors = imgScope.querySelectorAll<HTMLAnchorElement>("a[href]");
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
 * 에디터 변경사항을 1초 디바운스로 감지하는 MutationObserver 설정
 */
export function observeEditorChanges(
  callback: (content: EditorContent) => void,
): () => void {
  const targetNode = findBodyElement() ??
    document.querySelector("#post-body") ??
    document.body;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      callback(getEditorContent());
    }, 1000);
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return () => {
    observer.disconnect();
    if (debounceTimer !== null) clearTimeout(debounceTimer);
  };
}
