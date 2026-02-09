function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const FONT_FAMILY =
  "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const FOOTER_PLACEHOLDER = "{{UNSUBSCRIBE_URL}}";

function footerHtml(unsubscribeUrl?: string): string {
  const year = new Date().getFullYear();
  const unsubLink = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:#999999;text-decoration:underline;">수신거부</a>`
    : `<a href="mailto:smith.kim@inwv.co?subject=수신거부 요청" style="color:#999999;text-decoration:underline;">수신거부</a>`;
  return `<div style="background-color:#f7f7f7;padding:24px 32px;text-align:center;">
  <hr style="border:0;border-top:1px solid #eeeeee;margin:0 0 16px;" />
  <p style="color:#a4a4a4;font-size:12px;margin:0 0 8px;">자사몰 사관학교</p>
  <p style="color:#999999;font-size:12px;line-height:1.6;margin:0 0 8px;">
    본 메일은 BS CAMP에서 발송한 뉴스레터입니다.<br />
    수신을 원하지 않으시면 ${unsubLink}를 클릭해주세요.
  </p>
  <p style="color:#aaaaaa;font-size:11px;margin:0;">&copy; ${year} BS CAMP. All rights reserved.</p>
</div>`;
}

export function makeUnsubscribeUrl(baseUrl: string, email: string): string {
  const token = Buffer.from(email).toString("base64url");
  return `${baseUrl}/unsubscribe?token=${token}`;
}

export function replaceUnsubscribeUrl(html: string, unsubscribeUrl: string): string {
  return html.replace(FOOTER_PLACEHOLDER, unsubscribeUrl);
}

function fontFaceStyle(): string {
  return `@font-face {
  font-family: 'Pretendard';
  src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard/Pretendard-Regular.subset.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}`;
}

// --- Newsletter Template ---

export function newsletterTemplate({
  subject,
  bodyHtml,
  ctaText,
  ctaUrl,
}: {
  subject: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}) {
  const safeSubject = escapeHtml(subject);
  const ctaHtml =
    ctaText && ctaUrl
      ? `<div style="text-align:center;padding:0 32px 32px;">
  <a href="${escapeHtml(ctaUrl)}" style="background-color:#F75D5D;color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;text-decoration:none;display:inline-block;">${escapeHtml(ctaText)}</a>
</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <style>${fontFaceStyle()}</style>
</head>
<body style="margin:0;padding:24px 0;background-color:#f5f5f5;font-family:${FONT_FAMILY};">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <!-- Header -->
    <div style="background-color:#ffffff;padding:24px 32px;text-align:center;border-bottom:2px solid #F75D5D;">
      <p style="color:#F75D5D;font-size:20px;font-weight:700;margin:0;letter-spacing:0.5px;">BS CAMP</p>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#1a1a1a;font-size:22px;font-weight:700;margin:0 0 24px;line-height:1.4;">${safeSubject}</p>
      <div style="background-color:#ffffff;border:1px solid #eeeeee;border-radius:8px;padding:24px;">
        <div style="color:#333333;font-size:15px;line-height:1.7;">${bodyHtml}</div>
      </div>
    </div>
    ${ctaHtml}
    <!-- Footer -->
    ${footerHtml(FOOTER_PLACEHOLDER)}
  </div>
</body>
</html>`;
}

// --- Webinar Template ---

export function webinarTemplate({
  title,
  date,
  time,
  registrationUrl,
}: {
  title: string;
  date: string;
  time: string;
  registrationUrl: string;
}) {
  const safeTitle = escapeHtml(title);
  const safeDate = escapeHtml(date);
  const safeTime = escapeHtml(time);
  const safeUrl = escapeHtml(registrationUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>자사몰 사관학교 LIVE 무료 웨비나 - ${safeTitle}</title>
  <style>${fontFaceStyle()}</style>
</head>
<body style="margin:0;padding:20px 0;background-color:#f5f5f5;font-family:${FONT_FAMILY};">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#2D2D2D;padding:28px 32px 8px;text-align:center;">
      <p style="color:#E85A2A;font-size:14px;font-weight:600;margin:0;">자사몰 사관학교</p>
    </div>
    <!-- Hero -->
    <div style="background-color:#2D2D2D;padding:0 32px 32px;text-align:center;">
      <p style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 4px;">자사몰 대표자를 위한</p>
      <h1 style="color:#ffffff;font-size:36px;font-weight:700;line-height:1.2;margin:0 0 16px;">${safeTitle}</h1>
      <p style="color:#ffffff;font-size:18px;font-weight:700;margin:0;">${safeDate}</p>
      <p style="color:#ffffff;font-size:18px;font-weight:700;margin:0 0 16px;">${safeTime}</p>
      <div style="text-align:center;margin-bottom:8px;">
        <span style="display:inline-block;background-color:#E85A2A;color:#ffffff;font-size:14px;font-weight:700;padding:6px 16px;border-radius:20px;">LIVE 무료 웨비나</span>
      </div>
      <p style="color:#cccccc;font-size:14px;margin:8px 0 16px;">사전등록 필수 | 더 자세한 내용은 아래에서 확인해 주세요.</p>
      <div style="text-align:center;padding:8px 0 0;">
        <a href="${safeUrl}" style="background-color:#ffffff;color:#2D2D2D;font-size:16px;font-weight:700;padding:14px 32px;border-radius:500px;text-decoration:none;display:inline-block;">신청하기</a>
      </div>
    </div>
    <!-- Body -->
    <div style="background-color:#ffffff;padding:32px;">
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">안녕하세요. 자사몰 사관학교 스미스입니다.</p>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">최근 대표님들과 이야기를 나누다 보면 이런 말을 정말 자주 듣습니다.</p>
      <div style="color:#1a1a1a;font-size:16px;font-weight:700;line-height:1.7;margin:0 0 24px;padding:16px 20px;border-left:3px solid #E85A2A;background-color:#fafafa;">
        &ldquo;자사몰 사관학교 아니었으면,<br />잘못된 정보로 계속 광고 돌리고 있었을 것 같아요.&rdquo;
      </div>
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:32px 0 12px;padding:0;">자사몰 광고의 현실</h2>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">쿠팡이나 오픈마켓에서는 매출이 나오는데, 자사몰 광고는 유독 어렵게 느껴집니다.</p>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">소재를 바꾸고, 타겟을 바꾸고, 예산을 조절해도 누군가에게 &ldquo;왜 이 광고를 지금 쓰고 있는지&rdquo; 설명하려 하면 말이 막힙니다.</p>
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:32px 0 12px;padding:0;">&lsquo;방법만 배운&rsquo; 광고 운영</h2>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">이건 대표님이 광고를 못해서가 아닙니다. 대부분 <strong>방법만 배워왔기 때문</strong>이죠.</p>
      <p style="color:#E85A2A;font-size:16px;font-weight:700;font-style:italic;line-height:1.7;margin:0 0 16px;">&ldquo;나는 이 고객에게 이 광고를 왜 지금 써야 하는가?&rdquo;</p>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">이 질문에 답하지 못하면 광고는 계속 &lsquo;감&rsquo;으로 운영될 수밖에 없습니다.</p>
    </div>
    <!-- Stats -->
    <div style="background-color:#f9f9f9;padding:32px;text-align:center;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:0 0 4px;padding:0;">구조를 이해한 자사몰의 결과</h2>
      <p style="color:#777777;font-size:13px;margin:0 0 20px;">1기~5기 수강생 78명의 성과입니다.</p>
      <table width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;">
        <tr>
          <td style="background-color:#ffffff;border-radius:8px;padding:16px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;margin:0 0 4px;">총 광고비</p>
            <p style="color:#E85A2A;font-size:22px;font-weight:700;margin:0;">40.8억</p>
          </td>
          <td style="background-color:#ffffff;border-radius:8px;padding:16px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;margin:0 0 4px;">총 매출</p>
            <p style="color:#E85A2A;font-size:22px;font-weight:700;margin:0;">104억</p>
          </td>
          <td style="background-color:#ffffff;border-radius:8px;padding:16px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;margin:0 0 4px;">평균 ROAS</p>
            <p style="color:#E85A2A;font-size:22px;font-weight:700;margin:0;">254%</p>
          </td>
        </tr>
      </table>
    </div>
    <!-- Final CTA -->
    <div style="background-color:#ffffff;padding:32px;">
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;text-align:center;">구조가 잡히면 광고는 더 이상 불안한 영역이 아닙니다.</p>
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;text-align:center;"><strong>왜 이 광고를 지금 쓰는지, 스스로 설명할 수 있는 상태</strong>를 만들고 싶다면<br />이번 웨비나에서 뵙겠습니다.</p>
      <div style="text-align:center;padding:16px 0 0;">
        <a href="${safeUrl}" style="background-color:#E85A2A;color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:500px;text-decoration:none;display:inline-block;">웨비나 신청하기</a>
      </div>
    </div>
    <!-- Footer -->
    ${footerHtml(FOOTER_PLACEHOLDER)}
  </div>
</body>
</html>`;
}

// --- Performance Report Template ---

export function performanceTemplate({
  subject,
  roas,
  revenue,
  adSpend,
  bodyText,
  ctaText,
  ctaUrl,
}: {
  subject: string;
  roas: string;
  revenue: string;
  adSpend: string;
  bodyText: string;
  ctaText?: string;
  ctaUrl?: string;
}) {
  const safeSubject = escapeHtml(subject);
  const safeBodyText = escapeHtml(bodyText);
  const ctaHtml =
    ctaText && ctaUrl
      ? `<div style="text-align:center;padding:0 32px 32px;">
  <a href="${escapeHtml(ctaUrl)}" style="background-color:#E85A2A;color:#ffffff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:500px;text-decoration:none;display:inline-block;">${escapeHtml(ctaText)}</a>
</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <style>${fontFaceStyle()}</style>
</head>
<body style="margin:0;padding:20px 0;background-color:#f5f5f5;font-family:${FONT_FAMILY};">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#1a1a1a;padding:28px 32px;text-align:center;">
      <p style="color:#E85A2A;font-size:14px;font-weight:600;margin:0 0 8px;">자사몰 사관학교</p>
      <h1 style="color:#ffffff;font-size:18px;font-weight:600;margin:0;">BS CAMP</h1>
    </div>
    <!-- Title -->
    <div style="padding:32px 32px 0;">
      <h2 style="color:#1a1a1a;font-size:22px;font-weight:700;margin:0;padding:0;text-align:center;">${safeSubject}</h2>
    </div>
    <!-- Stats -->
    <div style="padding:24px 24px 8px;">
      <table width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;">
        <tr>
          <td style="background-color:#f9f9f9;border-radius:8px;padding:20px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;font-weight:600;text-transform:uppercase;margin:0 0 6px;">ROAS</p>
            <p style="color:#E85A2A;font-size:24px;font-weight:700;margin:0;">${escapeHtml(roas)}</p>
          </td>
          <td style="background-color:#f9f9f9;border-radius:8px;padding:20px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;font-weight:600;text-transform:uppercase;margin:0 0 6px;">매출</p>
            <p style="color:#E85A2A;font-size:24px;font-weight:700;margin:0;">${escapeHtml(revenue)}</p>
          </td>
          <td style="background-color:#f9f9f9;border-radius:8px;padding:20px 8px;text-align:center;border:1px solid #eeeeee;width:33.33%;">
            <p style="color:#888888;font-size:12px;font-weight:600;text-transform:uppercase;margin:0 0 6px;">광고비</p>
            <p style="color:#E85A2A;font-size:24px;font-weight:700;margin:0;">${escapeHtml(adSpend)}</p>
          </td>
        </tr>
      </table>
    </div>
    <!-- Body -->
    <div style="padding:24px 32px 16px;">
      <p style="color:#333333;font-size:15px;line-height:1.7;margin:0 0 16px;">${safeBodyText}</p>
    </div>
    ${ctaHtml}
    <!-- Footer -->
    ${footerHtml(FOOTER_PLACEHOLDER)}
  </div>
</body>
</html>`;
}
