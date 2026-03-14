/**
 * 카페 발행 모듈 (T5)
 *
 * cafe.naver.com/자사몰사관학교 에디터에서
 * 짧은 요약 + 블로그 링크를 삽입하여 트래픽 유도합니다.
 *
 * 데이터 포맷:
 * { type: 'BSCAMP_CAFE_PUBLISH', payload: { summary, blogUrl, blogTitle } }
 */

export interface CafePublishPayload {
  summary: string;     // 짧은 요약 (2-3줄)
  blogUrl: string;     // 블로그 포스트 URL
  blogTitle: string;   // 블로그 제목
}

/**
 * 카페 발행 메시지 수신 리스너 설정
 */
export function setupCafePublishListener(): () => void {
  function handleMessage(event: MessageEvent) {
    if (event.source !== window) return;
    if (event.data?.type !== "BSCAMP_CAFE_PUBLISH") return;

    const payload = event.data.payload as CafePublishPayload;
    if (!payload?.summary || !payload?.blogUrl) return;

    injectCafeContent(payload);
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

/**
 * 카페 에디터에 트래픽 유도 포맷 삽입
 */
function injectCafeContent(payload: CafePublishPayload): void {
  const html = buildCafeHtml(payload);

  // 카페 에디터 본문 영역 찾기
  const editableArea = document.querySelector<HTMLElement>(
    ".se-main-container [contenteditable='true']"
  ) ?? document.querySelector<HTMLElement>(
    ".se-main-container"
  ) ?? document.querySelector<HTMLElement>(
    "#post-body"
  );

  if (!editableArea) {
    console.warn("[bscamp-ext] 카페 에디터 본문 영역을 찾을 수 없습니다.");
    return;
  }

  editableArea.focus();

  if (document.execCommand) {
    document.execCommand("insertHTML", false, html);
  } else {
    editableArea.innerHTML = html;
  }

  editableArea.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 카페용 트래픽 유도 HTML 생성
 */
function buildCafeHtml(payload: CafePublishPayload): string {
  return `
<div style="padding: 16px; font-family: 'Pretendard', sans-serif;">
  <p style="font-size: 15px; line-height: 1.8; color: #333; margin-bottom: 16px;">
    ${escapeHtml(payload.summary)}
  </p>
  <div style="background: #f8f9fa; border-left: 4px solid #F75D5D; padding: 14px 18px; border-radius: 8px; margin: 12px 0;">
    <p style="font-size: 13px; color: #666; margin-bottom: 6px;">자세한 내용은 블로그에서 확인하세요 👇</p>
    <a href="${escapeHtml(payload.blogUrl)}" style="font-size: 15px; color: #F75D5D; font-weight: 700; text-decoration: none;">
      📝 ${escapeHtml(payload.blogTitle)}
    </a>
  </div>
  <p style="font-size: 12px; color: #aaa; margin-top: 16px;">
    자사몰사관학교 | 함께 성장하는 커머스 커뮤니티
  </p>
</div>
`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
