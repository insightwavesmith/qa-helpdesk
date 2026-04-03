const SLACK_WEBHOOK_URL = process.env.SLACK_CRON_ALERT_WEBHOOK;

export async function notifyChainFailure(endpoint: string, error: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "크론 체인 실패",
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: `*크론 체인 실패*\n• 엔드포인트: \`${endpoint}\`\n• 에러: ${error}\n• 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` }
      }]
    })
  }).catch(e => console.error("[cron-alert] Slack 전송 실패:", e));
}

export async function notifyCronError(cronName: string, error: string, recordsCount: number): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `크론 실행 에러: ${cronName}`,
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: `*크론 에러*\n• 이름: \`${cronName}\`\n• 처리: ${recordsCount}건\n• 에러: ${error}\n• 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` }
      }]
    })
  }).catch(e => console.error("[cron-alert] Slack 전송 실패:", e));
}
