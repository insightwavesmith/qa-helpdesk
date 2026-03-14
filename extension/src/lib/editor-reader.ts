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

function extractBody(): {
  content: string;
  imageCount: number;
  externalLinks: string[];
} {
  // SmartEditor ONE 메인 컨테이너
  const seContainer = document.querySelector<HTMLElement>(
    ".se-main-container",
  );
  const bodyEl =
    seContainer ??
    document.querySelector<HTMLElement>(
      "#post-body, .se-component, .se_doc_viewer",
    );

  const content = bodyEl?.innerText?.trim() ?? bodyEl?.textContent?.trim() ?? "";

  // 이미지 카운트
  const images = document.querySelectorAll(
    ".se-image, img[data-lazy-src], .se-module-image img, .se-main-container img",
  );
  const imageCount = images.length;

  // 외부 링크 추출 (naver 도메인 제외)
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    ".se-main-container a[href], #post-body a[href]",
  );
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
  const targetNode =
    document.querySelector(".se-main-container") ??
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
