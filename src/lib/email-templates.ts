export function newsletterTemplate({
  subject,
  bodyHtml,
}: {
  subject: string;
  bodyHtml: string;
}) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f7f6f5; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #1a1a1a; padding: 28px 32px; text-align: center; }
    .header img { height: 32px; }
    .header h1 { color: #ffffff; font-size: 18px; font-weight: 600; margin: 12px 0 0; }
    .body { padding: 32px; color: #333333; font-size: 15px; line-height: 1.7; }
    .body h1, .body h2, .body h3 { color: #1a1a1a; }
    .body a { color: #FF5757; text-decoration: underline; }
    .footer { background-color: #fafafa; padding: 24px 32px; text-align: center; font-size: 12px; color: #999999; line-height: 1.6; }
    .footer a { color: #999999; }
    .divider { border: 0; border-top: 1px solid #eeeeee; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BS CAMP</h1>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <hr class="divider" />
      <p>
        본 메일은 BS CAMP에서 발송한 뉴스레터입니다.<br />
        수신을 원하지 않으시면 <a href="mailto:smith.kim@inwv.co?subject=수신거부 요청">수신거부</a>를 클릭해주세요.
      </p>
      <p>&copy; ${new Date().getFullYear()} BS CAMP. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}
